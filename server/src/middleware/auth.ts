import { Request, Response, NextFunction } from 'express';
import jwt, { JsonWebTokenError } from 'jsonwebtoken';
import { getJwtSecret } from '../config/loadEnv';
import { query } from '../db';

// =============================================================================
// Auth tokens — two-token model
//
// Before: a single 7-day JWT was returned in the JSON body of /login and stored
// by the client in localStorage. Any successful XSS would exfiltrate it and
// have a full week to abuse it.
//
// After: two separate tokens, both delivered as httpOnly cookies so client
// JavaScript can no longer read them.
//   - Access token  : 1h, cookie `of_at`, path "/"
//     Used to authenticate every API request.
//   - Refresh token : 7d, cookie `of_rt`, path "/api/auth"
//     Used only to obtain a new access token; never sent to other routes.
//
// Tokens are JWTs signed with the same secret but distinguished by a `kind`
// claim. A future iteration should rotate refresh tokens and persist a
// revocation list (see #29 follow-up) — left out of this pass to keep the
// migration tight.
//
// For compatibility with non-browser callers (curl, mobile, internal tooling),
// `authMiddleware` still accepts a Bearer token in the Authorization header
// as a fallback when no cookie is present.
// =============================================================================

export interface AuthRequest extends Request {
    // Family scope id: the owner of the family this request operates on. Equals
    // the logged-in account for owners; equals the owner for invited members.
    // All data tables are scoped by this, so existing `WHERE user_id = req.userId`
    // queries keep working unchanged.
    userId?: string;
    // The actual logged-in account id. Use this for identity-specific actions
    // (own profile, password change, "am I the owner?" checks).
    accountId?: string;
}

type TokenKind = 'access' | 'refresh';

interface TokenPayload {
    userId: string;
    kind: TokenKind;
}

export const ACCESS_COOKIE_NAME = 'of_at';
export const REFRESH_COOKIE_NAME = 'of_rt';

const ACCESS_TTL_SEC = parseTtl(process.env.JWT_ACCESS_TTL_SEC, 60 * 60); // 1 hour
const REFRESH_TTL_SEC = parseTtl(process.env.JWT_REFRESH_TTL_SEC, 7 * 24 * 60 * 60); // 7 days

function parseTtl(raw: string | undefined, fallback: number): number {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

const sign = (userId: string, kind: TokenKind, ttlSec: number): string =>
    jwt.sign({ userId, kind } satisfies TokenPayload, getJwtSecret(), {
        expiresIn: ttlSec,
    });

export const generateAccessToken = (userId: string): string =>
    sign(userId, 'access', ACCESS_TTL_SEC);

export const generateRefreshToken = (userId: string): string =>
    sign(userId, 'refresh', REFRESH_TTL_SEC);

/**
 * Legacy alias kept so older code paths still compile while we migrate them.
 * New code should call `generateAccessToken` directly.
 * @deprecated use generateAccessToken
 */
export const generateToken = (userId: string): string => generateAccessToken(userId);

export const verifyToken = (token: string, expectedKind: TokenKind): TokenPayload => {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    if (decoded.kind !== expectedKind) {
        // Treat as invalid signature — never let an access token be used as a
        // refresh token or vice versa.
        throw new JsonWebTokenError('invalid token kind');
    }
    return decoded;
};

interface CookieAttrs {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    path: string;
    maxAge: number;
}

const isProd = (): boolean => process.env.NODE_ENV === 'production';

const cookieSecure = (): boolean => {
    const raw = process.env.COOKIE_SECURE?.toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return isProd();
};

const cookieSameSite = (): 'lax' | 'strict' | 'none' => {
    const raw = process.env.COOKIE_SAMESITE?.toLowerCase();
    if (raw === 'lax' || raw === 'strict' || raw === 'none') return raw;
    return 'lax';
};

const accessCookieAttrs = (): CookieAttrs => ({
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path: '/',
    maxAge: ACCESS_TTL_SEC * 1000,
});

const refreshCookieAttrs = (): CookieAttrs => ({
    httpOnly: true,
    secure: cookieSecure(),
    // Refresh cookie is only ever sent to the auth routes — narrow exposure.
    // Strict samesite is safe because the refresh exchange happens via
    // same-origin fetch from the already-loaded SPA.
    sameSite: cookieSameSite() === 'none' ? 'none' : 'strict',
    path: '/api/auth',
    maxAge: REFRESH_TTL_SEC * 1000,
});

export const setAuthCookies = (res: Response, userId: string): void => {
    res.cookie(ACCESS_COOKIE_NAME, generateAccessToken(userId), accessCookieAttrs());
    res.cookie(REFRESH_COOKIE_NAME, generateRefreshToken(userId), refreshCookieAttrs());
};

export const clearAuthCookies = (res: Response): void => {
    res.clearCookie(ACCESS_COOKIE_NAME, { path: '/' });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
};

/**
 * Extract an access token from the request. The cookie is the primary source
 * (set on login by setAuthCookies). The Authorization: Bearer header remains
 * supported as a fallback for non-browser clients (curl in scripts, mobile
 * apps that pre-date the cookie migration, internal tooling).
 */
const extractAccessToken = (req: Request): string | null => {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const fromCookie = cookies?.[ACCESS_COOKIE_NAME];
    if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;

    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const value = authHeader.slice(7).trim();
        if (value.length > 0) return value;
    }

    return null;
};

export const extractRefreshToken = (req: Request): string | null => {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const fromCookie = cookies?.[REFRESH_COOKIE_NAME];
    if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;
    return null;
};

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const token = extractAccessToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }

        const decoded = verifyToken(token, 'access');

        // Resolve the family scope. A single indexed PK lookup per request: cheap,
        // and it means a member who is removed loses access immediately rather
        // than after the access token expires (we don't bake the scope into the JWT).
        const result = await query('SELECT family_owner_id FROM users WHERE id = $1', [
            decoded.userId,
        ]);
        if (result.rows.length === 0) {
            // Account was deleted while a token was still valid.
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        req.accountId = decoded.userId;
        req.userId = result.rows[0].family_owner_id ?? decoded.userId;
        next();
    } catch {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

/**
 * Guard for actions only the family owner may perform (managing members,
 * inviting accounts). An owner has no `family_owner_id`, so the auth middleware
 * resolves `req.userId === req.accountId`. Invited members fail this check.
 * Must run after `authMiddleware`.
 */
export const requireFamilyOwner = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.accountId || req.accountId !== req.userId) {
        return res
            .status(403)
            .json({ success: false, error: 'Only the family owner can perform this action' });
    }
    next();
};
