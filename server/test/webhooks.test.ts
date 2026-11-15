import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { issueAccessToken } from '../src/lib/authTokens';
import { setWebhookCoalesceForTests, settleWebhooks, signWebhookBody } from '../src/lib/webhooks';

// Outgoing webhooks: addresses a parent registers in Settings, told when the
// family's data changes. Each call is signed and says what kind of thing
// changed, never the thing itself.

interface Received { method: string; path: string; headers: http.IncomingHttpHeaders; body: string }

let receiver: http.Server;
let port: number;
const received: Received[] = [];
// What the receiver answers: set by each test.
let answer: { status: number; location?: string } = { status: 200 };

beforeAll(async () => {
    await startSuite();
    setWebhookCoalesceForTests(25);
    receiver = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            received.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body });
            res.writeHead(answer.status, answer.location ? { Location: answer.location } : {});
            res.end('ok');
        });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    port = (receiver.address() as AddressInfo).port;
});

afterAll(async () => {
    await settleWebhooks();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
    await stopSuite();
});

let parent: { token: string; user: { id: string } };

beforeEach(async () => {
    await settleWebhooks();
    await resetState();
    received.length = 0;
    answer = { status: 200 };
    parent = await registerWithPassword('parent@example.org');
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const target = (path = '/hook/secret-path') => `http://127.0.0.1:${port}${path}`;
const listHooks = (token?: string) => {
    const req = request(app).get('/api/webhooks');
    return token ? req.set(bearer(token)) : req;
};
const createHook = (token: string, body: Record<string, unknown> = {}) =>
    request(app).post('/api/webhooks').set(bearer(token)).send({ name: 'Home Assistant', url: target(), ...body });
const updateHook = (token: string, id: string, body: Record<string, unknown>) =>
    request(app).put(`/api/webhooks/${id}`).set(bearer(token)).send(body);
const addItem = (token: string, name = 'Milk') =>
    request(app).post('/api/shopping').set(bearer(token)).send({ name, category: 'Autre' });
const addTask = (token: string) => request(app).post('/api/tasks').set(bearer(token)).send({ title: 'Trash' });
const hook = async (body: Record<string, unknown> = {}, token = parent.token) => {
    const created = await createHook(token, body);
    expect(created.status).toBe(201);
    return created.body.data as { id: string; secret: string };
};
const familyMember = async (role: 'parent' | 'enfant', email: string) => {
    const created = await query(
        `INSERT INTO users (email, name, role, family_owner_id) VALUES ($1, 'Member', $2, $3)
         RETURNING id, family_owner_id, token_version`,
        [email, role, parent.user.id],
    );
    return { id: created.rows[0].id as string, token: issueAccessToken(created.rows[0]) };
};
const stored = async (id: string) => (await listHooks(parent.token)).body.data.find((entry: { id: string }) => entry.id === id);

describe('managing webhooks', () => {
    it('needs a session of a parent, never an API token', async () => {
        expect((await listHooks()).status).toBe(401);
        const child = await familyMember('enfant', 'child@example.org');
        expect((await listHooks(child.token)).status).toBe(403);
        expect((await createHook(child.token)).status).toBe(403);

        const token = await request(app).post('/api/api-tokens').set(bearer(parent.token)).send({ name: 'Script', scope: 'write' });
        const withToken = await listHooks(token.body.data.token);
        expect(withToken.status).toBe(403);
        expect(withToken.body.error).toBe('api_token_forbidden');
    });

    it('registers a webhook, hands out its secret once, and keeps the address to itself', async () => {
        const created = await createHook(parent.token, { name: '  Home Assistant  ', events: ['tasks', 'shopping'] });
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({
            name: 'Home Assistant',
            url_host: `127.0.0.1:${port}`,
            // In the order OpenFamily lists them, whatever the order sent.
            events: ['shopping', 'tasks'],
            enabled: true,
            failure_count: 0,
            last_status: null,
        });
        const secret = created.body.data.secret as string;
        expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);

        const listed = await listHooks(parent.token);
        expect(listed.body.data).toHaveLength(1);
        const shown = JSON.stringify(listed.body);
        expect(shown).not.toContain(secret);
        expect(shown).not.toContain('secret-path');

        // In the database too: the address and the secret are encrypted together.
        const row = (await query('SELECT * FROM webhooks')).rows[0];
        expect(JSON.stringify(row)).not.toContain('secret-path');
        expect(JSON.stringify(row)).not.toContain(secret);
    });

    it.each([
        [{ name: '' }, 'invalid_name'],
        [{ name: 'x'.repeat(81) }, 'invalid_name'],
        [{ url: 'not an address' }, 'invalid_url'],
        [{ url: 'http://user:password@example.org/hook' }, 'invalid_url'],
        [{ url: 'ftp://example.org/hook' }, 'unsafe_url'],
        // The address cloud providers answer with their credentials on.
        [{ url: 'http://169.254.169.254/latest/meta-data' }, 'unsafe_url'],
        [{ events: ['shopping', 'passwords'] }, 'invalid_events'],
        [{ events: 'shopping' }, 'invalid_events'],
    ])('refuses %j', async (body, error) => {
        const answered = await createHook(parent.token, body);
        expect(answered.status).toBe(400);
        expect(answered.body.error).toBe(error);
        expect((await query('SELECT count(*)::int AS n FROM webhooks')).rows[0].n).toBe(0);
    });

    it('stops at ten webhooks per family', async () => {
        for (let index = 0; index < 10; index += 1) {
            expect((await createHook(parent.token, { name: `Hook ${index}` })).status).toBe(201);
        }
        const over = await createHook(parent.token, { name: 'One too many' });
        expect(over.status).toBe(409);
        expect(over.body).toMatchObject({ error: 'limit_reached', max: 10 });
    });

    it('renames, narrows, switches off and removes a webhook of its own family only', async () => {
        const mine = await hook();
        const other = await registerWithPassword('other@example.org');
        const theirs = await hook({}, other.token);

        const renamed = await updateHook(parent.token, mine.id, { name: 'n8n', events: ['appointments'], enabled: false });
        expect(renamed.body.data).toMatchObject({ name: 'n8n', events: ['appointments'], enabled: false });
        expect(renamed.body.data).not.toHaveProperty('secret');
        expect((await updateHook(parent.token, mine.id, { enabled: 'yes' })).status).toBe(400);
        expect((await updateHook(parent.token, mine.id, {})).status).toBe(400);

        expect((await updateHook(parent.token, theirs.id, { name: 'Mine now' })).status).toBe(404);
        expect((await request(app).delete(`/api/webhooks/${theirs.id}`).set(bearer(parent.token))).status).toBe(404);
        expect((await request(app).post(`/api/webhooks/${theirs.id}/test`).set(bearer(parent.token))).status).toBe(404);
        expect((await request(app).delete('/api/webhooks/not-an-id').set(bearer(parent.token))).status).toBe(404);

        expect((await request(app).delete(`/api/webhooks/${mine.id}`).set(bearer(parent.token))).status).toBe(200);
        expect((await listHooks(parent.token)).body.data).toEqual([]);
        expect((await listHooks(other.token)).body.data).toHaveLength(1);
    });
});

describe('telling a webhook', () => {
    it('says what kind of thing changed, signed, and nothing of the family', async () => {
        const { id, secret } = await hook();
        expect((await addItem(parent.token, 'Milk')).status).toBe(200);
        await settleWebhooks();

        expect(received).toHaveLength(1);
        const [call] = received;
        expect(call.method).toBe('POST');
        expect(call.path).toBe('/hook/secret-path');
        expect(call.headers['content-type']).toBe('application/json');
        expect(call.headers['x-openfamily-event']).toBe('shopping.created');
        // The receiver checks this with the secret it was given.
        expect(call.headers['x-openfamily-signature']).toBe(signWebhookBody(secret, call.body));

        const body = JSON.parse(call.body);
        expect(body).toMatchObject({ event: 'shopping.created', entity: 'shopping', action: 'created', webhook_id: id });
        expect(body.delivery_id).toBe(call.headers['x-openfamily-delivery']);
        expect(Number.isNaN(Date.parse(body.occurred_at))).toBe(false);
        expect(Object.keys(body).sort()).toEqual(['action', 'delivery_id', 'entity', 'event', 'occurred_at', 'webhook_id']);
        expect(call.body).not.toContain('Milk');

        expect(await stored(id)).toMatchObject({ last_status: 200, last_error: null, failure_count: 0 });
    });

    it('tells a burst of the same change once', async () => {
        await hook();
        await Promise.all([addItem(parent.token, 'Milk'), addItem(parent.token, 'Bread'), addItem(parent.token, 'Eggs')]);
        await settleWebhooks();
        expect(received.map((call) => call.headers['x-openfamily-event'])).toEqual(['shopping.created']);
    });

    it('tells a webhook only what it asked for, and only while it is on', async () => {
        const tasksOnly = await hook({ events: ['tasks'] });
        await addItem(parent.token);
        await settleWebhooks();
        expect(received).toEqual([]);

        await addTask(parent.token);
        await settleWebhooks();
        expect(received.map((call) => call.headers['x-openfamily-event'])).toEqual(['tasks.created']);

        await updateHook(parent.token, tasksOnly.id, { enabled: false });
        await addTask(parent.token);
        await settleWebhooks();
        expect(received).toHaveLength(1);
    });

    it("never tells one family's webhook about another family", async () => {
        await hook();
        const other = await registerWithPassword('other@example.org');
        await addItem(other.token);
        await settleWebhooks();
        expect(received).toEqual([]);
    });

    it('keeps the outcome of the last call for Settings', async () => {
        const { id } = await hook();
        answer = { status: 500 };
        await addItem(parent.token);
        await settleWebhooks();
        expect(await stored(id)).toMatchObject({ last_status: 500, last_error: 'HTTP 500', failure_count: 1, enabled: true });

        answer = { status: 204 };
        await addTask(parent.token);
        await settleWebhooks();
        const after = await stored(id);
        expect(after).toMatchObject({ last_status: 204, last_error: null, failure_count: 0 });
        expect(after.last_delivery_at).not.toBeNull();
    });

    it('says so when nothing answers', async () => {
        // A port nothing listens on: taken from a server closed right away.
        const closed = http.createServer();
        await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
        const deadPort = (closed.address() as AddressInfo).port;
        await new Promise<void>((resolve) => closed.close(() => resolve()));

        const { id } = await hook({ url: `http://127.0.0.1:${deadPort}/hook` });
        await addItem(parent.token);
        await settleWebhooks();
        expect(await stored(id)).toMatchObject({ last_status: 0, last_error: 'ECONNREFUSED', failure_count: 1 });
    });

    it('does not follow a redirect: only the address entered is called', async () => {
        const { id } = await hook();
        answer = { status: 302, location: `http://127.0.0.1:${port}/somewhere-else` };
        await addItem(parent.token);
        await settleWebhooks();
        expect(received.map((call) => call.path)).toEqual(['/hook/secret-path']);
        expect(await stored(id)).toMatchObject({ last_status: 302, failure_count: 1 });
    });

    it('switches a webhook off after twenty failures in a row, and on again by hand', async () => {
        const { id } = await hook();
        await query('UPDATE webhooks SET failure_count = 19 WHERE id = $1', [id]);
        answer = { status: 500 };
        await addItem(parent.token);
        await settleWebhooks();
        expect(await stored(id)).toMatchObject({ enabled: false, failure_count: 20 });

        received.length = 0;
        await addTask(parent.token);
        await settleWebhooks();
        expect(received).toEqual([]);

        const back = await updateHook(parent.token, id, { enabled: true });
        expect(back.body.data).toMatchObject({ enabled: true, failure_count: 0 });
    });

    it('sends a test call on demand and says how it went', async () => {
        const { id, secret } = await hook();
        const tested = await request(app).post(`/api/webhooks/${id}/test`).set(bearer(parent.token));
        expect(tested.status).toBe(200);
        expect(tested.body.data.delivery).toEqual({ ok: true, status: 200, error: null });
        expect(tested.body.data.webhook).toMatchObject({ id, last_status: 200 });
        expect(received).toHaveLength(1);
        expect(JSON.parse(received[0].body)).toMatchObject({ event: 'webhook.test', entity: null, action: null });
        expect(received[0].headers['x-openfamily-signature']).toBe(signWebhookBody(secret, received[0].body));

        answer = { status: 401 };
        const refused = await request(app).post(`/api/webhooks/${id}/test`).set(bearer(parent.token));
        expect(refused.body.data.delivery).toEqual({ ok: false, status: 401, error: 'HTTP 401' });
    });
});
