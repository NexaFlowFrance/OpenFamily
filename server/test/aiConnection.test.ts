import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { describeFetchFailure } from '../src/services/ai';
import { ollamaHasModel } from '../src/services/ai/ollama';

// The AI assistant's connection test (issue #137): it must say what went wrong,
// in the provider's own words when it has any, against a stand-in for Ollama.

type Behaviour = {
    models?: string[];
    chat?: 'ok' | 'drop' | 'error' | 'empty';
    tagsStatus?: number;
};

let parent: { token: string; user: { id: string } };
let ollama: http.Server;
let baseUrl: string;
let behaviour: Behaviour = {};
const asked: string[] = [];

beforeAll(async () => {
    await startSuite();
    ollama = http.createServer((req, res) => {
        asked.push(`${req.method} ${req.url}`);
        if (req.method === 'GET' && req.url === '/api/tags') {
            if (behaviour.tagsStatus) {
                res.writeHead(behaviour.tagsStatus).end('<html>not ollama</html>');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ models: (behaviour.models ?? []).map((name) => ({ name, size: 1 })) }));
            return;
        }
        if (req.method === 'POST' && req.url === '/api/chat') {
            req.on('data', () => undefined);
            req.on('end', () => {
                switch (behaviour.chat) {
                    case 'drop':
                        // A proxy's upstream timeout, or a runner that died: the socket closes with no answer.
                        req.socket.destroy();
                        return;
                    case 'error':
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'model requires more system memory (12.3 GiB) than is available (8.0 GiB)' }));
                        return;
                    case 'empty':
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ message: { role: 'assistant', content: '' } }));
                        return;
                    default:
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ message: { role: 'assistant', content: '{"ok": true}' }, prompt_eval_count: 12, eval_count: 5 }));
                }
            });
            return;
        }
        res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => ollama.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${(ollama.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => ollama.close(() => resolve()));
    await stopSuite();
});

beforeEach(async () => {
    await resetState();
    behaviour = {};
    asked.length = 0;
    parent = await registerWithPassword('parent@example.org');
});

afterEach(() => {
    ollama.closeAllConnections();
});

const test = (body: Record<string, unknown>) =>
    request(app).post('/api/ai/test').set('Authorization', `Bearer ${parent.token}`).send({ provider: 'ollama', base_url: baseUrl, ...body });

describe('testing the connection to Ollama', () => {
    it('answers with the time the model took when everything is in place', async () => {
        behaviour = { models: ['qwen3.5:4b', 'llama3.1:8b'], chat: 'ok' };
        const response = await test({ model: 'qwen3.5:4b' });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.elapsed_ms).toBeTypeOf('number');
        expect(asked).toEqual(['GET /api/tags', 'POST /api/chat']);
    });

    it('names the installed models when the one asked for is missing', async () => {
        behaviour = { models: ['llama3.1:8b', 'gemma4:12b'] };
        const response = await test({ model: 'qwen3.5:4b' });
        expect(response.status).toBe(502);
        expect(response.body.error).toBe('AI_MODEL_NOT_FOUND');
        expect(response.body.message).toContain('llama3.1:8b, gemma4:12b');
        expect(asked).toEqual(['GET /api/tags']);
    });

    it('says when no model is installed at all', async () => {
        behaviour = { models: [] };
        const response = await test({ model: 'qwen3.5:4b' });
        expect(response.body.error).toBe('AI_MODEL_NOT_FOUND');
        expect(response.body.message).toContain('ollama pull qwen3.5:4b');
    });

    it('accepts a name without its tag for the latest model', async () => {
        behaviour = { models: ['qwen3.5:latest'], chat: 'ok' };
        expect((await test({ model: 'qwen3.5' })).status).toBe(200);
    });

    it('reports a connection that was cut before any answer, as such', async () => {
        behaviour = { models: ['qwen3.5:4b'], chat: 'drop' };
        const response = await test({ model: 'qwen3.5:4b' });
        expect(response.status).toBe(502);
        expect(response.body.error).toBe('AI_CONNECTION_DROPPED');
        expect(response.body.message).toMatch(/a coupé la connexion après \d+ s/);
    });

    it("passes the provider's own error on", async () => {
        behaviour = { models: ['gemma4:12b'], chat: 'error' };
        const response = await test({ model: 'gemma4:12b' });
        expect(response.status).toBe(502);
        expect(response.body.error).toBe('AI_PROVIDER_ERROR');
        expect(response.body.message).toContain('more system memory');
    });

    it('tells an address that is not an Ollama server from one that is down', async () => {
        behaviour = { tagsStatus: 404 };
        const notOllama = await test({ model: 'qwen3.5:4b' });
        expect(notOllama.body.error).toBe('AI_PROVIDER_ERROR');
        expect(notOllama.body.message).toContain('HTTP 404');

        const closed = http.createServer();
        await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', () => resolve()));
        const port = (closed.address() as AddressInfo).port;
        await new Promise<void>((resolve) => closed.close(() => resolve()));
        const down = await test({ model: 'qwen3.5:4b', base_url: `http://127.0.0.1:${port}` });
        expect(down.body.error).toBe('AI_UNREACHABLE');
        expect(down.body.message).toContain("rien n'écoute");
    });

    it('is for parents only', async () => {
        const stranger = await registerWithPassword('other@example.org');
        void stranger;
        const response = await request(app).post('/api/ai/test').send({ provider: 'ollama', base_url: baseUrl, model: 'x' });
        expect(response.status).toBe(401);
    });
});

describe('what a failed fetch is called', () => {
    const failure = (code: string, message = 'fetch failed') => {
        const cause = Object.assign(new Error(message), { code });
        return Object.assign(new TypeError('fetch failed'), { cause });
    };

    it.each([
        ['ECONNREFUSED', 'AI_UNREACHABLE', "rien n'écoute"],
        ['ENOTFOUND', 'AI_UNREACHABLE', 'introuvable'],
        ['ECONNRESET', 'AI_CONNECTION_DROPPED', 'coupé la connexion'],
        ['UND_ERR_SOCKET', 'AI_CONNECTION_DROPPED', 'coupé la connexion'],
        ['EHOSTUNREACH', 'AI_UNREACHABLE', 'injoignable'],
        ['DEPTH_ZERO_SELF_SIGNED_CERT', 'AI_UNREACHABLE', 'Certificat TLS'],
    ])('%s is %s', (code, expectedCode, words) => {
        const error = describeFetchFailure(failure(code), 'http://ollama.lan:11434/api/chat', 10_400, 60_000);
        expect(error.code).toBe(expectedCode);
        expect(error.message).toContain(words);
        expect(error.message).toContain('ollama.lan:11434');
    });

    it('names the timeout when the provider never answered', () => {
        const error = describeFetchFailure(Object.assign(new Error('aborted'), { name: 'AbortError' }), 'http://x', 60_000, 60_000);
        expect(error.code).toBe('AI_UNREACHABLE');
        expect(error.message).toContain('60 s');
    });

    it('matches model names the way Ollama does', () => {
        expect(ollamaHasModel(['Qwen3.5:4b'], 'qwen3.5:4b')).toBe(true);
        expect(ollamaHasModel(['qwen3.5:latest'], 'qwen3.5')).toBe(true);
        expect(ollamaHasModel(['qwen3.5:4b'], 'qwen3.5')).toBe(false);
        expect(ollamaHasModel([], 'qwen3.5')).toBe(false);
    });
});
