import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../src/lib/logger';
import { challengeMatches } from '../src/lib/oidcProvider';
import { app, exchange, idp, query, registerWithPassword, resetState, runCallback, sso, startSuite, stopSuite } from './helpers';

beforeAll(startSuite);
afterAll(stopSuite);
beforeEach(() => resetState());

describe('the one-time handoff', () => {
    it('works once: a replayed code is refused', async () => {
        const result = await runCallback();
        const first = await exchange(result.code!, result.verifier);
        expect(first.status).toBe(200);
        const replay = await exchange(result.code!, result.verifier);
        expect(replay.status).toBe(400);
        expect(replay.body.error).toBe('invalid_code');
    });

    it('only one of two concurrent exchanges succeeds', async () => {
        const result = await runCallback();
        const [a, b] = await Promise.all([exchange(result.code!, result.verifier), exchange(result.code!, result.verifier)]);
        expect([a.status, b.status].sort()).toEqual([200, 400]);
        const { rows } = await query('SELECT count(*)::int AS n FROM users');
        expect(rows[0].n).toBe(1);
    });

    it('needs the verifier of the tab that started the sign-in', async () => {
        const result = await runCallback();
        const wrong = await exchange(result.code!, crypto.randomBytes(32).toString('base64url'));
        expect(wrong.status).toBe(400);
        // The attempt burned the code: the right verifier no longer helps.
        const retry = await exchange(result.code!, result.verifier);
        expect(retry.status).toBe(400);
    });

    it('expires', async () => {
        const result = await runCallback();
        await query("UPDATE oidc_flows SET expires_at = NOW() - interval '1 second'");
        const late = await exchange(result.code!, result.verifier);
        expect(late.status).toBe(400);
    });

    it('is never sent to the server: the callback puts it in the URL fragment', async () => {
        const result = await runCallback();
        const url = new URL(result.location);
        expect(url.search).toBe('');
        expect(url.hash).toMatch(/^#code=[A-Za-z0-9_-]{43}$/);
    });

    it('matches the RFC 7636 S256 example', () => {
        expect(challengeMatches('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(true);
        expect(challengeMatches('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cN')).toBe(false);
    });
});

describe('the callback', () => {
    it('refuses a reused state', async () => {
        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        const started = await request(app).post('/api/auth/oidc/start').send({ clientChallenge: challenge });
        const atProvider = await fetch(started.body.data.authorizationUrl, { redirect: 'manual' });
        const search = new URL(atProvider.headers.get('location')!).search;

        const first = await request(app).get(`/api/auth/oidc/callback${search}`);
        expect(first.headers.location).toContain('#code=');
        const second = await request(app).get(`/api/auth/oidc/callback${search}`);
        expect(second.headers.location).toContain('#error=expired');
    });

    it('refuses an unknown state', async () => {
        const response = await request(app).get('/api/auth/oidc/callback?state=made-up&code=abc');
        expect(response.headers.location).toBe('http://app.test/auth/callback#error=expired');
    });

    it('reports a refusal at the provider as cancelled, without logging its text', async () => {
        const info = vi.spyOn(logger, 'info');
        const warn = vi.spyOn(logger, 'warn');
        idp.tamper.authorizeError = 'access_denied';
        const result = await runCallback();
        expect(result.error).toBe('cancelled');

        idp.tamper.authorizeError = '<img src=x onerror=alert(1)>';
        expect((await runCallback()).error).toBe('cancelled');

        const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
        expect(logged).toContain('access_denied');
        expect(logged).not.toContain('SECRET-DESCRIPTION');
        expect(logged).not.toContain('onerror');
        info.mockRestore();
        warn.mockRestore();
    });
});

describe('linking', () => {
    it('needs the session that started the link', async () => {
        const bob = await registerWithPassword('bob@example.org');
        const carol = await registerWithPassword('carol@example.org');
        const result = await runCallback({ link: true, token: bob.token });

        const anonymous = await exchange(result.code!, result.verifier);
        expect(anonymous.status).toBe(401);
        expect(anonymous.body.error).toBe('session_mismatch');

        const other = await runCallback({ link: true, token: bob.token });
        const asCarol = await exchange(other.code!, other.verifier, carol.token);
        expect(asCarol.status).toBe(403);
        expect(asCarol.body.error).toBe('session_mismatch');
        const { rows } = await query('SELECT count(*)::int AS n FROM user_identities');
        expect(rows[0].n).toBe(0);
    });

    it('needs a signed-in account to start', async () => {
        const response = await request(app).post('/api/auth/oidc/start').send({ clientChallenge: 'a'.repeat(43), link: true });
        expect(response.status).toBe(401);
    });

    it('never returns a token', async () => {
        idp.reset({ sub: 'bob-sub', email: 'bob@idp.example' });
        const bob = await registerWithPassword('bob@example.org');
        const linked = await sso({ link: true, token: bob.token });
        expect(linked.status).toBe(200);
        expect(linked.body.data).toEqual({ mode: 'link', email: 'bob@idp.example' });
    });
});
