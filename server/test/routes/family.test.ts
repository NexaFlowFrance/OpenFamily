import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

// =============================================================================
// Family routes — multi-account behaviour.
//
// Focus: the owner-only guard on member management. Invited members (a `users`
// row with family_owner_id set) may READ the family but must not add, edit,
// delete, or invite members. We mock the DB so the auth middleware resolves the
// caller's role, and route the per-call SQL by inspecting its text.
// =============================================================================

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

// `query` is used both by the auth middleware (the users lookup) and by the GET
// routes. We branch on the SQL so a single mock serves both.
const makeQueryMock = (familyOwnerId: string | null) =>
    vi.fn(async (sql: string) => {
        if (/family_owner_id/i.test(sql)) {
            // Middleware scope lookup: SELECT family_owner_id FROM users WHERE id = $1
            return { rows: [{ family_owner_id: familyOwnerId }] };
        }
        if (/^\s*SELECT .* FROM family_members/i.test(sql)) {
            return { rows: [] };
        }
        return { rows: [] };
    });

const queryMock = { current: makeQueryMock(null) };

vi.mock('../../src/db', () => ({
    default: {},
    query: (sql: string, params?: unknown[]) => queryMock.current(sql, params),
    getClient: vi.fn(),
}));

// The invitation email must never actually try to send during tests.
vi.mock('../../src/email/EmailService', () => ({
    sendInvitationEmail: vi.fn(async () => ({ messageId: 'test', latencyMs: 1 })),
}));

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
    queryMock.current = makeQueryMock(null);
});

const asMember = (method: 'post' | 'put' | 'delete', path: string) => {
    queryMock.current = makeQueryMock(OWNER_ID); // caller is an invited member
    const req = request(app)
        [method](path)
        .set('Cookie', `${ACCESS_COOKIE_NAME}=${generateAccessToken(MEMBER_ID)}`);
    return req;
};

describe('family routes — owner-only guard', () => {
    it('blocks an invited member from creating a member (403)', async () => {
        const res = await asMember('post', '/api/family').send({ name: 'New' });
        expect(res.status).toBe(403);
    });

    it('blocks an invited member from updating a member (403)', async () => {
        const res = await asMember('put', `/api/family/${OWNER_ID}`).send({ name: 'X' });
        expect(res.status).toBe(403);
    });

    it('blocks an invited member from deleting a member (403)', async () => {
        const res = await asMember('delete', `/api/family/${OWNER_ID}`);
        expect(res.status).toBe(403);
    });

    it('blocks an invited member from inviting a member (403)', async () => {
        const res = await asMember('post', `/api/family/${OWNER_ID}/invite`).send({
            email: 'x@example.com',
        });
        expect(res.status).toBe(403);
    });

    it('lets an invited member read the family (200)', async () => {
        queryMock.current = makeQueryMock(OWNER_ID);
        const res = await request(app)
            .get('/api/family')
            .set('Cookie', `${ACCESS_COOKIE_NAME}=${generateAccessToken(MEMBER_ID)}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true });
    });

    it('lets the owner reach the create handler (not 403)', async () => {
        queryMock.current = makeQueryMock(null); // caller owns the family
        const res = await request(app)
            .post('/api/family')
            .set('Cookie', `${ACCESS_COOKIE_NAME}=${generateAccessToken(OWNER_ID)}`)
            .send({ name: '' }); // empty name → 400 from the handler, never 403
        expect(res.status).not.toBe(403);
        expect(res.status).toBe(400);
    });
});
