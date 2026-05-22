import { describe, it, expect, vi } from 'vitest';
import type { Response, Request, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    authMiddleware,
    requireFamilyOwner,
    ACCESS_COOKIE_NAME,
    setAuthCookies,
    clearAuthCookies,
    extractRefreshToken,
    REFRESH_COOKIE_NAME,
    type AuthRequest,
} from '../../src/middleware/auth';
import { getJwtSecret } from '../../src/config/loadEnv';
import { query } from '../../src/db';

// authMiddleware now resolves the family scope with a single users lookup. Mock
// the DB so the middleware sees an owner account (family_owner_id = null) and
// keeps req.userId === the token's userId.
vi.mock('../../src/db', () => ({
    default: {},
    query: vi.fn(async () => ({ rows: [{ family_owner_id: null }] })),
    getClient: vi.fn(),
}));

const USER_ID = 'd1f7a3c8-9b1e-41d4-a716-446655440000';

describe('access vs refresh tokens', () => {
    it('signs distinct tokens with a kind claim', () => {
        const access = generateAccessToken(USER_ID);
        const refresh = generateRefreshToken(USER_ID);
        expect(access).not.toEqual(refresh);

        const accessPayload = jwt.verify(access, getJwtSecret()) as {
            kind: string;
            userId: string;
        };
        const refreshPayload = jwt.verify(refresh, getJwtSecret()) as {
            kind: string;
            userId: string;
        };

        expect(accessPayload.kind).toBe('access');
        expect(refreshPayload.kind).toBe('refresh');
        expect(accessPayload.userId).toBe(USER_ID);
        expect(refreshPayload.userId).toBe(USER_ID);
    });

    it('verifyToken rejects a token of the wrong kind', () => {
        const refresh = generateRefreshToken(USER_ID);
        // Cross-use must throw — the kind check is the whole point of the
        // two-token model.
        expect(() => verifyToken(refresh, 'access')).toThrow();

        const access = generateAccessToken(USER_ID);
        expect(() => verifyToken(access, 'refresh')).toThrow();
    });

    it('verifyToken returns the payload for a matching kind', () => {
        const access = generateAccessToken(USER_ID);
        const payload = verifyToken(access, 'access');
        expect(payload.userId).toBe(USER_ID);
        expect(payload.kind).toBe('access');
    });
});

describe('authMiddleware token extraction', () => {
    const makeRes = () => {
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        return { status, json } as unknown as Response & {
            status: ReturnType<typeof vi.fn>;
            json: ReturnType<typeof vi.fn>;
        };
    };

    it('accepts a valid access token via cookie', async () => {
        const token = generateAccessToken(USER_ID);
        const req = {
            headers: {},
            cookies: { [ACCESS_COOKIE_NAME]: token },
        } as unknown as Request & { userId?: string };
        const res = makeRes();
        const next: NextFunction = vi.fn();

        await authMiddleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(req.userId).toBe(USER_ID);
    });

    it('accepts a valid access token via Authorization header (fallback)', async () => {
        const token = generateAccessToken(USER_ID);
        const req = {
            headers: { authorization: `Bearer ${token}` },
            cookies: {},
        } as unknown as Request & { userId?: string };
        const res = makeRes();
        const next: NextFunction = vi.fn();

        await authMiddleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(req.userId).toBe(USER_ID);
    });

    it('rejects a refresh token used as an access token', () => {
        const refresh = generateRefreshToken(USER_ID);
        const req = {
            headers: {},
            cookies: { [ACCESS_COOKIE_NAME]: refresh },
        } as unknown as Request;
        const res = makeRes();
        const next: NextFunction = vi.fn();

        authMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects when no token is present', () => {
        const req = { headers: {}, cookies: {} } as unknown as Request;
        const res = makeRes();
        const next: NextFunction = vi.fn();

        authMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects a token signed with a different secret', () => {
        const evil = jwt.sign(
            { userId: USER_ID, kind: 'access' },
            'some-other-secret-with-32-chars-min!!!',
        );
        const req = {
            headers: {},
            cookies: { [ACCESS_COOKIE_NAME]: evil },
        } as unknown as Request;
        const res = makeRes();
        const next: NextFunction = vi.fn();

        authMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

describe('authMiddleware family scope resolution', () => {
    const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

    const makeRes = () => {
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        return { status, json } as unknown as Response & {
            status: ReturnType<typeof vi.fn>;
            json: ReturnType<typeof vi.fn>;
        };
    };

    const reqWithToken = (userId: string) =>
        ({
            headers: {},
            cookies: { [ACCESS_COOKIE_NAME]: generateAccessToken(userId) },
        }) as unknown as AuthRequest;

    it('owner account: userId and accountId both equal the token user', async () => {
        vi.mocked(query).mockResolvedValueOnce({ rows: [{ family_owner_id: null }] } as never);
        const req = reqWithToken(OWNER_ID);
        const res = makeRes();
        const next = vi.fn();

        await authMiddleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(req.accountId).toBe(OWNER_ID);
        expect(req.userId).toBe(OWNER_ID);
    });

    it('member account: userId resolves to the owner, accountId stays the member', async () => {
        vi.mocked(query).mockResolvedValueOnce({
            rows: [{ family_owner_id: OWNER_ID }],
        } as never);
        const req = reqWithToken(MEMBER_ID);
        const res = makeRes();
        const next = vi.fn();

        await authMiddleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(req.accountId).toBe(MEMBER_ID);
        expect(req.userId).toBe(OWNER_ID);
    });

    it('deleted account (no user row): rejects with 401', async () => {
        vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
        const req = reqWithToken(MEMBER_ID);
        const res = makeRes();
        const next = vi.fn();

        await authMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

describe('requireFamilyOwner', () => {
    const makeRes = () => {
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        return { status, json } as unknown as Response & {
            status: ReturnType<typeof vi.fn>;
            json: ReturnType<typeof vi.fn>;
        };
    };

    it('passes when the account is the family owner (accountId === userId)', () => {
        const req = { accountId: 'x', userId: 'x' } as AuthRequest;
        const res = makeRes();
        const next = vi.fn();
        requireFamilyOwner(req, res, next);
        expect(next).toHaveBeenCalledOnce();
    });

    it('blocks an invited member (accountId !== userId) with 403', () => {
        const req = { accountId: 'member', userId: 'owner' } as AuthRequest;
        const res = makeRes();
        const next = vi.fn();
        requireFamilyOwner(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe('cookie helpers', () => {
    const makeRes = () => {
        const cookieCalls: Array<{ name: string; value: string; opts: Record<string, unknown> }> =
            [];
        const clearCalls: Array<{ name: string; opts: Record<string, unknown> }> = [];
        const res = {
            cookie: vi.fn((name: string, value: string, opts: Record<string, unknown>) => {
                cookieCalls.push({ name, value, opts });
                return res;
            }),
            clearCookie: vi.fn((name: string, opts: Record<string, unknown>) => {
                clearCalls.push({ name, opts });
                return res;
            }),
        } as unknown as Response & {
            cookie: ReturnType<typeof vi.fn>;
            clearCookie: ReturnType<typeof vi.fn>;
        };
        return { res, cookieCalls, clearCalls };
    };

    it('setAuthCookies sets httpOnly cookies with correct paths and sameSite', () => {
        const { res, cookieCalls } = makeRes();
        setAuthCookies(res, USER_ID);

        expect(cookieCalls).toHaveLength(2);
        const access = cookieCalls.find((c) => c.name === ACCESS_COOKIE_NAME)!;
        const refresh = cookieCalls.find((c) => c.name === REFRESH_COOKIE_NAME)!;

        expect(access.opts.httpOnly).toBe(true);
        expect(access.opts.sameSite).toBe('lax');
        expect(access.opts.path).toBe('/');

        expect(refresh.opts.httpOnly).toBe(true);
        expect(refresh.opts.sameSite).toBe('strict');
        expect(refresh.opts.path).toBe('/api/auth');

        // The set values are actual JWTs of the expected kind.
        const accessPayload = jwt.verify(access.value, getJwtSecret()) as { kind: string };
        const refreshPayload = jwt.verify(refresh.value, getJwtSecret()) as { kind: string };
        expect(accessPayload.kind).toBe('access');
        expect(refreshPayload.kind).toBe('refresh');
    });

    it('clearAuthCookies clears both cookies with matching paths', () => {
        const { res, clearCalls } = makeRes();
        clearAuthCookies(res);
        expect(clearCalls).toEqual([
            { name: ACCESS_COOKIE_NAME, opts: { path: '/' } },
            { name: REFRESH_COOKIE_NAME, opts: { path: '/api/auth' } },
        ]);
    });

    it('extractRefreshToken returns the refresh cookie value when present', () => {
        const req = { cookies: { [REFRESH_COOKIE_NAME]: 'tok' } } as unknown as Request;
        expect(extractRefreshToken(req)).toBe('tok');
    });

    it('extractRefreshToken returns null when missing or empty', () => {
        expect(extractRefreshToken({ cookies: {} } as unknown as Request)).toBeNull();
        expect(extractRefreshToken({} as unknown as Request)).toBeNull();
        expect(
            extractRefreshToken({ cookies: { [REFRESH_COOKIE_NAME]: '' } } as unknown as Request),
        ).toBeNull();
    });
});
