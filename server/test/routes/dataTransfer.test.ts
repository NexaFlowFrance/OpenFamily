import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ANOTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const GOOD_UUID = '550e8400-e29b-41d4-a716-446655440000';

// =============================================================================
// We mock the DB module so the import route can run end-to-end without a real
// PostgreSQL. Each test inspects exactly which SQL the route ran, and on which
// parameter values, to prove that the whitelist enforcement from task #7
// behaves correctly under both legitimate and adversarial payloads.
// =============================================================================

interface RecordedQuery {
    sql: string;
    values: unknown[];
}

const queries: RecordedQuery[] = [];

const fakeClient = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values: values ?? [] });
        // BEGIN / COMMIT / ROLLBACK return no rows; INSERT ... ON CONFLICT DO
        // NOTHING returns rowCount=1.
        return { rowCount: sql.toUpperCase().startsWith('INSERT') ? 1 : 0, rows: [] };
    }),
    release: vi.fn(),
};

vi.mock('../../src/db', () => ({
    default: { query: vi.fn() },
    // authMiddleware resolves the family scope via a users lookup; return an
    // owner row (family_owner_id = null) so req.userId stays the token's userId.
    query: vi.fn(async () => ({ rows: [{ family_owner_id: null }] })),
    getClient: vi.fn(async () => fakeClient),
}));

// Import after the mock is registered.
let app: import('express').Express;
let generateAccessToken: (userId: string) => string;
let ACCESS_COOKIE_NAME: string;

beforeAll(async () => {
    const auth = await import('../../src/middleware/auth');
    generateAccessToken = auth.generateAccessToken;
    ACCESS_COOKIE_NAME = auth.ACCESS_COOKIE_NAME;
    app = (await import('../../src/app')).default;
});

beforeEach(() => {
    queries.length = 0;
    fakeClient.query.mockClear();
    fakeClient.release.mockClear();
});

const authedPost = (payload: unknown) =>
    request(app)
        .post('/api/data/import')
        .set('Cookie', `${ACCESS_COOKIE_NAME}=${generateAccessToken(USER_ID)}`)
        .send(payload as object);

const insertQueries = () => queries.filter((q) => q.sql.startsWith('INSERT'));

describe('POST /api/data/import — whitelist behavior (task #7)', () => {
    it('accepts a legitimate family_members payload and inserts only whitelisted columns', async () => {
        const res = await authedPost({
            family_members: [{ name: 'Alice', role: 'Mère', color: '#FF0000' }],
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            success: true,
            data: { imported: { family_members: 1 } },
        });

        const inserts = insertQueries();
        expect(inserts).toHaveLength(1);
        expect(inserts[0].sql).toMatch(/^INSERT INTO family_members /);
        expect(inserts[0].sql).toContain('"user_id"');
        expect(inserts[0].sql).toContain('"name"');
        expect(inserts[0].sql).toContain('"role"');
        expect(inserts[0].sql).toContain('"color"');
        // user_id must be the authenticated user, not anything the payload set.
        expect(inserts[0].values[0]).toBe(USER_ID);
    });

    it('refuses to honour a user_id supplied in the payload (mass-assignment guard)', async () => {
        await authedPost({
            family_members: [{ user_id: ANOTHER_USER_ID, name: 'Mallory' }],
        });
        const inserts = insertQueries();
        expect(inserts).toHaveLength(1);
        // user_id is the first parameter and is always the authenticated user.
        expect(inserts[0].values[0]).toBe(USER_ID);
        // The forged user_id from the body must not appear anywhere in values.
        expect(inserts[0].values).not.toContain(ANOTHER_USER_ID);
    });

    it('silently drops columns that are not in the whitelist', async () => {
        await authedPost({
            family_members: [
                { name: 'Alice', password_hash: 'pwned', is_admin: true, secret_field: 'x' },
            ],
        });
        const inserts = insertQueries();
        expect(inserts).toHaveLength(1);
        expect(inserts[0].sql).not.toMatch(/password_hash/i);
        expect(inserts[0].sql).not.toMatch(/is_admin/i);
        expect(inserts[0].sql).not.toMatch(/secret_field/i);
        // None of the forbidden values reach pg.
        expect(inserts[0].values).not.toContain('pwned');
        expect(inserts[0].values).not.toContain(true);
    });

    it('never lets a payload-controlled column name end up in the SQL', async () => {
        await authedPost({
            family_members: [
                {
                    // Classic injection attempt — try to break out of the
                    // identifier quoting.
                    ['id"); DROP TABLE users; --']: 'evil',
                    name: 'Alice',
                },
            ],
        });
        const inserts = insertQueries();
        expect(inserts).toHaveLength(1);
        expect(inserts[0].sql).not.toMatch(/DROP/i);
        expect(inserts[0].sql).not.toContain(';');
        expect(inserts[0].sql).toMatch(/"name"/);
    });

    it('rejects rows whose UUID fields are malformed (id, recipe_id, etc.)', async () => {
        // Bad id in family_members — entire row should be skipped.
        await authedPost({ family_members: [{ id: 'not-a-uuid', name: 'Skip' }] });
        expect(insertQueries()).toHaveLength(0);

        // Bad assigned_to in budget_entries — same outcome.
        queries.length = 0;
        await authedPost({
            budget_entries: [
                {
                    category: 'X',
                    amount: 10,
                    date: '2026-01-01',
                    assigned_to: 'definitely-not-uuid',
                },
            ],
        });
        expect(insertQueries()).toHaveLength(0);
    });

    it('accepts a valid UUID and includes it in the insert', async () => {
        await authedPost({ family_members: [{ id: GOOD_UUID, name: 'WithId' }] });
        const inserts = insertQueries();
        expect(inserts).toHaveLength(1);
        expect(inserts[0].sql).toContain('"id"');
        expect(inserts[0].values).toContain(GOOD_UUID);
    });

    it('rejects oversized payloads with HTTP 413 before opening a DB transaction', async () => {
        const bigRows = Array.from({ length: 10_001 }, (_, i) => ({ name: `n${i}` }));
        const res = await authedPost({ family_members: bigRows });
        expect(res.status).toBe(413);
        // No queries should have been issued at all.
        expect(queries).toHaveLength(0);
    });

    it('rejects non-array fields with HTTP 400', async () => {
        const res = await authedPost({ family_members: 'not-an-array' });
        expect(res.status).toBe(400);
        expect(queries).toHaveLength(0);
    });

    it('rejects non-object rows silently (does not crash the whole import)', async () => {
        const res = await authedPost({
            family_members: ['junk', 42, null, { name: 'Real' }],
        });
        expect(res.status).toBe(200);
        const inserts = insertQueries();
        // Only the one valid row produces an insert.
        expect(inserts).toHaveLength(1);
        expect(inserts[0].values).toContain('Real');
    });
});
