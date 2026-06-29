import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

// =============================================================================
// Garden routes — auth + validation behaviour.
//
// The DB is mocked: we branch on the SQL text so the auth middleware's user
// lookup resolves, and any INSERT ... RETURNING returns a plausible row. This
// exercises the zod validation layer (which runs before any DB access) and the
// happy-path wiring without needing a live Postgres.
// =============================================================================

const USER_ID = '11111111-1111-4111-8111-111111111111';

const makeQueryMock = () =>
    vi.fn(async (sql: string) => {
        if (/family_owner_id/i.test(sql)) {
            // Auth middleware scope lookup.
            return { rows: [{ family_owner_id: null }] };
        }
        if (/INSERT INTO garden_zones/i.test(sql)) {
            return {
                rows: [
                    {
                        id: '22222222-2222-4222-8222-222222222222',
                        name: 'Pelouse devant',
                        zone_type: 'Pelouse',
                        location: 'Devant',
                        area_m2: null,
                        sun_exposure: null,
                        soil_type: null,
                        notes: null,
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
            };
        }
        return { rows: [] };
    });

const queryMock = { current: makeQueryMock() };

vi.mock('../../src/db', () => ({
    default: {},
    query: (sql: string, params?: unknown[]) => queryMock.current(sql, params),
    getClient: vi.fn(),
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
    queryMock.current = makeQueryMock();
});

const authed = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    request(app)
        [method](path)
        .set('Cookie', `${ACCESS_COOKIE_NAME}=${generateAccessToken(USER_ID)}`);

describe('garden routes', () => {
    it('requires authentication', async () => {
        const res = await request(app).get('/api/garden/zones');
        expect(res.status).toBe(401);
    });

    it('rejects a zone with an invalid zone_type (400)', async () => {
        const res = await authed('post', '/api/garden/zones').send({
            name: 'X',
            zone_type: 'NotAType',
        });
        expect(res.status).toBe(400);
    });

    it('rejects a care row with neither planned_date nor performed_date (400)', async () => {
        const res = await authed('post', '/api/garden/care').send({
            title: 'Arroser',
            care_type: 'Arrosage',
        });
        expect(res.status).toBe(400);
    });

    it('rejects unknown keys on a zone body (strict, 400)', async () => {
        const res = await authed('post', '/api/garden/zones').send({
            name: 'X',
            zone_type: 'Pelouse',
            bogus: true,
        });
        expect(res.status).toBe(400);
    });

    it('creates a valid zone (201)', async () => {
        const res = await authed('post', '/api/garden/zones').send({
            name: 'Pelouse devant',
            zone_type: 'Pelouse',
            location: 'Devant',
        });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ success: true, data: { zone_type: 'Pelouse' } });
    });
});
