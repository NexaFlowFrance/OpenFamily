import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { WebSocket, WebSocketServer } from 'ws';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { issueAccessToken } from '../src/lib/authTokens';
import { apiTokenRefusal } from '../src/lib/apiTokens';
import { attachWebSocketServer } from '../src/lib/wsServer';

// Personal API tokens: a long-lived credential a parent makes in Settings so
// that another program (Home Assistant, Gladys Assistant, a script) can use
// the REST API and the WebSocket as that parent, within the chosen scope.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };

beforeEach(async () => {
    await resetState();
    parent = await registerWithPassword('parent@example.org');
});

const TOKEN_SHAPE = /^ofk_[A-Za-z0-9_-]{43}$/;
const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const listTokens = (token?: string) => {
    const req = request(app).get('/api/api-tokens');
    return token ? req.set(bearer(token)) : req;
};
const createToken = (token: string, body: Record<string, unknown> = { name: 'Gladys', scope: 'write' }) =>
    request(app).post('/api/api-tokens').set(bearer(token)).send(body);
const revokeToken = (token: string, id: string) => request(app).delete(`/api/api-tokens/${id}`).set(bearer(token));

interface CreatedToken {
    id: string;
    name: string;
    token: string;
    token_prefix: string;
    scope: 'read' | 'write';
    created_by: string | null;
    last_used_at: string | null;
}

/** A token made with the given session (the family owner's by default). */
const apiToken = async (scope: 'read' | 'write' = 'write', session = parent.token): Promise<CreatedToken> => {
    const created = await createToken(session, { name: `${scope} token`, scope });
    expect(created.status).toBe(201);
    return created.body.data as CreatedToken;
};

/** Another account of the same family, signed in. */
const familyMember = async (role: 'parent' | 'enfant', email: string) => {
    const created = await query(
        `INSERT INTO users (email, name, role, family_owner_id) VALUES ($1, $2, $3, $4)
         RETURNING id, family_owner_id, token_version`,
        [email, 'Member', role, parent.user.id],
    );
    return { id: created.rows[0].id as string, token: issueAccessToken(created.rows[0]) };
};

const shopping = (token: string) => request(app).get('/api/shopping').set(bearer(token));
const addMilk = (token: string) =>
    request(app).post('/api/shopping').set(bearer(token)).send({ name: 'Milk', category: 'Dairy' });

describe('managing API tokens', () => {
    it('needs a session', async () => {
        expect((await listTokens()).status).toBe(401);
        expect((await request(app).post('/api/api-tokens').send({ name: 'Gladys', scope: 'read' })).status).toBe(401);
    });

    it('is for parents: a child account can neither list nor create', async () => {
        const child = await familyMember('enfant', 'child@example.org');
        expect((await listTokens(child.token)).status).toBe(403);
        expect((await createToken(child.token)).status).toBe(403);
        expect((await query('SELECT count(*)::int AS n FROM api_tokens')).rows[0].n).toBe(0);
    });

    it('creates a token, hands out its secret once, and lists it for every parent of the family', async () => {
        const created = await createToken(parent.token, { name: '  Gladys  ', scope: 'write' });
        expect(created.status).toBe(201);
        const data = created.body.data as CreatedToken;
        expect(data.token).toMatch(TOKEN_SHAPE);
        expect(data).toMatchObject({ name: 'Gladys', scope: 'write', created_by: 'Someone', last_used_at: null });
        expect(data.token_prefix).toBe(data.token.slice(0, 12));

        // The database keeps the hash, never the secret.
        const stored = await query('SELECT token_hash, user_id, created_by FROM api_tokens');
        expect(stored.rows[0]).toEqual({ token_hash: sha256(data.token), user_id: parent.user.id, created_by: parent.user.id });

        const otherParent = await familyMember('parent', 'other@example.org');
        const listed = await listTokens(otherParent.token);
        expect(listed.status).toBe(200);
        expect(listed.body.data).toHaveLength(1);
        expect(listed.body.data[0]).toMatchObject({ id: data.id, name: 'Gladys', token_prefix: data.token_prefix, scope: 'write' });
        expect(listed.body.data[0]).not.toHaveProperty('token');
        expect(listed.body.data[0]).not.toHaveProperty('token_hash');
    });

    it.each([[''], ['   '], ['x'.repeat(81)], [42]])('refuses the name %j', async (name) => {
        const response = await createToken(parent.token, { name, scope: 'read' });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('invalid_name');
    });

    it.each([['admin'], [''], [undefined], [42]])('refuses the scope %j', async (scope) => {
        const response = await createToken(parent.token, { name: 'Gladys', scope });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('invalid_scope');
    });

    it('stops at twenty tokens per family', async () => {
        for (let index = 0; index < 20; index += 1) {
            expect((await createToken(parent.token, { name: `Token ${index}`, scope: 'read' })).status).toBe(201);
        }
        const over = await createToken(parent.token, { name: 'One too many', scope: 'read' });
        expect(over.status).toBe(409);
        expect(over.body).toMatchObject({ error: 'limit_reached', max: 20 });
    });

    it('revokes a token of its own family only', async () => {
        const mine = await apiToken('read');
        const other = await registerWithPassword('other@example.org');
        const theirs = await apiToken('read', other.token);

        expect((await revokeToken(parent.token, theirs.id)).status).toBe(404);
        expect((await revokeToken(parent.token, 'not-an-id')).status).toBe(404);
        expect((await listTokens(other.token)).body.data).toHaveLength(1);

        expect((await revokeToken(parent.token, mine.id)).status).toBe(200);
        expect((await listTokens(parent.token)).body.data).toEqual([]);
    });

    it('cannot be managed with an API token: only a session makes or revokes tokens', async () => {
        const token = await apiToken('write');
        for (const response of [
            await listTokens(token.token),
            await createToken(token.token),
            await revokeToken(token.token, token.id),
        ]) {
            expect(response.status).toBe(403);
            expect(response.body.error).toBe('api_token_forbidden');
        }
        expect((await listTokens(parent.token)).body.data).toHaveLength(1);
    });
});

describe('using an API token', () => {
    it("reads and writes the family's data like the app", async () => {
        const token = await apiToken('write');
        const empty = await shopping(token.token);
        expect(empty.status).toBe(200);
        expect(empty.body.data).toEqual([]);

        expect((await addMilk(token.token)).status).toBe(200);
        const items = await shopping(token.token);
        expect(items.body.data.map((item: { name: string }) => item.name)).toEqual(['Milk']);
        expect((await query('SELECT user_id FROM shopping_items')).rows[0].user_id).toBe(parent.user.id);
    });

    it("acts as the parent who made it, in that parent's family", async () => {
        const member = await familyMember('parent', 'member@example.org');
        const token = await apiToken('write', member.token);

        expect((await addMilk(token.token)).status).toBe(200);
        expect((await query('SELECT user_id FROM shopping_items')).rows[0].user_id).toBe(parent.user.id);

        const me = await request(app).get('/api/auth/me').set(bearer(token.token));
        expect(me.status).toBe(200);
        expect(me.body.data.user).toMatchObject({ id: member.id, email: 'member@example.org', is_owner: false });
    });

    it('with read-only scope, reads but never writes', async () => {
        const token = await apiToken('read');
        expect((await shopping(token.token)).status).toBe(200);

        const id = crypto.randomUUID();
        for (const response of [
            await addMilk(token.token),
            await request(app).put(`/api/shopping/${id}`).set(bearer(token.token)).send({ name: 'Bread' }),
            await request(app).delete(`/api/shopping/${id}`).set(bearer(token.token)),
        ]) {
            expect(response.status).toBe(403);
            expect(response.body.error).toBe('read_only_token');
        }
        expect((await query('SELECT count(*)::int AS n FROM shopping_items')).rows[0].n).toBe(0);
    });

    it.each([
        ['get', '/api/api-tokens'],
        ['post', '/api/auth/refresh'],
        ['post', '/api/auth/logout-all'],
        ['put', '/api/auth/profile'],
        ['get', '/api/invites/members'],
        ['get', '/api/integrations'],
        ['get', '/api/data/export'],
        ['get', '/api/display-links'],
        ['get', '/api/calendar/token'],
        ['get', '/api/notifications'],
        ['get', '/api/ai/settings'],
        ['post', '/api/AUTH/refresh'],
    ] as const)('is refused on %s %s whatever its scope', async (method, path) => {
        const token = await apiToken('write');
        const response = await request(app)[method](path).set(bearer(token.token)).send({});
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('api_token_forbidden');
    });

    it('still says which account it stands for', async () => {
        const token = await apiToken('read');
        const me = await request(app).get('/api/auth/me').set(bearer(token.token));
        expect(me.status).toBe(200);
        expect(me.body.data.user.email).toBe('parent@example.org');
    });

    it('records when it was last used', async () => {
        const token = await apiToken('read');
        expect((await shopping(token.token)).status).toBe(200);
        // The timestamp is written after the response, without being awaited.
        await new Promise((resolve) => setTimeout(resolve, 100));
        const listed = await listTokens(parent.token);
        expect(listed.body.data[0].last_used_at).not.toBeNull();
    });

    it('is refused once revoked, and so is an unknown or malformed one', async () => {
        const token = await apiToken('write');
        expect((await revokeToken(parent.token, token.id)).status).toBe(200);
        expect((await shopping(token.token)).status).toBe(401);
        expect((await shopping(`ofk_${'x'.repeat(43)}`)).status).toBe(401);
        expect((await shopping('ofk_')).status).toBe(401);
    });

    it('is not a session: signing the account out everywhere leaves it working', async () => {
        const token = await apiToken('read');
        const signedOut = await request(app).post('/api/auth/logout-all').set(bearer(parent.token)).send({});
        expect(signedOut.status).toBe(200);
        expect((await shopping(parent.token)).status).toBe(401);
        expect((await shopping(token.token)).status).toBe(200);
    });

    it('stops working when the parent who made it leaves the family or is deleted', async () => {
        const member = await familyMember('parent', 'member@example.org');
        const token = await apiToken('write', member.token);
        expect((await shopping(token.token)).status).toBe(200);

        await query('UPDATE users SET family_owner_id = NULL WHERE id = $1', [member.id]);
        expect((await shopping(token.token)).status).toBe(401);
        await query('UPDATE users SET family_owner_id = $2 WHERE id = $1', [member.id, parent.user.id]);
        expect((await shopping(token.token)).status).toBe(200);

        await query('DELETE FROM users WHERE id = $1', [member.id]);
        expect((await shopping(token.token)).status).toBe(401);
        expect((await listTokens(parent.token)).body.data).toEqual([]);
    });
});

describe('apiTokenRefusal', () => {
    it('reserves the account, family and credential routes, by whole segments and ignoring case', () => {
        expect(apiTokenRefusal('GET', '/api/auth/refresh', 'write')).toBe('api_token_forbidden');
        expect(apiTokenRefusal('GET', '/api/auth/', 'write')).toBe('api_token_forbidden');
        expect(apiTokenRefusal('GET', '/api/Auth/Refresh/', 'write')).toBe('api_token_forbidden');
        expect(apiTokenRefusal('GET', '/api/auth/me', 'read')).toBeNull();
        expect(apiTokenRefusal('GET', '/api/auth/me/', 'read')).toBeNull();
        expect(apiTokenRefusal('PUT', `/api/family/${crypto.randomUUID()}/link`, 'write')).toBe('api_token_forbidden');
        expect(apiTokenRefusal('GET', '/api/family', 'read')).toBeNull();
        expect(apiTokenRefusal('GET', '/api/authors', 'read')).toBeNull();
        expect(apiTokenRefusal('POST', '/api/ai/parse', 'write')).toBeNull();
        expect(apiTokenRefusal('GET', '/api/ai/settings', 'write')).toBe('api_token_forbidden');
    });

    it('lets a read-only token read, and nothing else', () => {
        expect(apiTokenRefusal('GET', '/api/tasks', 'read')).toBeNull();
        expect(apiTokenRefusal('HEAD', '/api/tasks', 'read')).toBeNull();
        expect(apiTokenRefusal('POST', '/api/tasks', 'read')).toBe('read_only_token');
        expect(apiTokenRefusal('patch', '/api/tasks/1', 'read')).toBe('read_only_token');
        expect(apiTokenRefusal('POST', '/api/tasks', 'write')).toBeNull();
    });
});

describe('over the WebSocket', () => {
    let server: http.Server;
    let wss: WebSocketServer;
    let port: number;

    interface Socket {
        ws: WebSocket;
        updates: Array<Record<string, unknown>>;
        closed: Promise<number>;
    }

    beforeAll(async () => {
        server = http.createServer(app);
        wss = attachWebSocketServer(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        port = (server.address() as AddressInfo).port;
    });

    afterAll(async () => {
        for (const client of wss.clients) client.terminate();
        await new Promise<void>((resolve) => wss.close(() => resolve()));
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    /** Opens a socket and signs in with the token; resolves once the server has answered. */
    const connect = async (token: string): Promise<{ socket: Socket; authenticated: boolean }> => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const updates: Array<Record<string, unknown>> = [];
        const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
        const answered = new Promise<boolean>((resolve) => {
            ws.on('message', (raw) => {
                const message = JSON.parse(raw.toString()) as Record<string, unknown>;
                if (message.type === 'auth') resolve(message.success === true);
                else updates.push(message);
            });
        });
        await new Promise<void>((resolve, reject) => {
            ws.once('open', resolve);
            ws.once('error', reject);
        });
        ws.send(JSON.stringify({ type: 'auth', token }));
        return { socket: { ws, updates, closed }, authenticated: await answered };
    };

    const nextUpdate = (socket: Socket, timeoutMs = 2000): Promise<Record<string, unknown>> =>
        new Promise((resolve, reject) => {
            const deadline = Date.now() + timeoutMs;
            const poll = () => {
                if (socket.updates.length > 0) return resolve(socket.updates.shift()!);
                if (Date.now() > deadline) return reject(new Error('no update arrived'));
                setTimeout(poll, 20);
            };
            poll();
        });

    const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

    it("signs in with an API token and receives the family's updates", async () => {
        const token = await apiToken('read');
        const { socket, authenticated } = await connect(token.token);
        expect(authenticated).toBe(true);

        expect((await addMilk(parent.token)).status).toBe(200);
        expect(await nextUpdate(socket)).toEqual({ type: 'update', entity: 'shopping', action: 'created' });
        socket.ws.close();
    });

    it("a family member's app receives the family's updates too, another family's does not", async () => {
        const member = await familyMember('parent', 'member@example.org');
        const stranger = await registerWithPassword('stranger@example.org');
        const memberSocket = await connect(member.token);
        const strangerSocket = await connect(stranger.token);
        expect(memberSocket.authenticated).toBe(true);
        expect(strangerSocket.authenticated).toBe(true);

        expect((await addMilk(parent.token)).status).toBe(200);
        expect(await nextUpdate(memberSocket.socket)).toEqual({ type: 'update', entity: 'shopping', action: 'created' });
        await settle();
        expect(strangerSocket.socket.updates).toEqual([]);
        memberSocket.socket.ws.close();
        strangerSocket.socket.ws.close();
    });

    it('refuses a revoked token at sign-in', async () => {
        const token = await apiToken('read');
        expect((await revokeToken(parent.token, token.id)).status).toBe(200);
        const { socket, authenticated } = await connect(token.token);
        expect(authenticated).toBe(false);
        expect(await socket.closed).toBe(4001);
    });

    it('closes the sockets of a token the moment it is revoked', async () => {
        const token = await apiToken('read');
        const { socket, authenticated } = await connect(token.token);
        expect(authenticated).toBe(true);
        expect((await revokeToken(parent.token, token.id)).status).toBe(200);
        expect(await socket.closed).toBe(4001);
    });
});
