import crypto from 'node:crypto';
import { query } from '../db';

/**
 * Personal API tokens: a long-lived credential a parent makes in Settings so
 * that another program (Home Assistant, Gladys Assistant, n8n, a script) can
 * read or add to the family's data. Unlike a session it never expires and is
 * revoked on its own; unlike a display link it is a real credential for the
 * REST API and the WebSocket, so the database keeps only its hash and the
 * secret is shown once.
 *
 * A token acts as the account that made it, in the family that account was
 * in at the time, with the scope chosen then. Whatever the scope, it cannot
 * reach the routes that manage the account, the family's accounts or other
 * credentials (apiTokenRefusal): a leaked token gives up the family's data,
 * never the account.
 */

export const API_TOKEN_PREFIX = 'ofk_';
export const API_TOKEN_MAX_PER_FAMILY = 20;
export const API_TOKEN_MAX_NAME_LENGTH = 80;

export type ApiTokenScope = 'read' | 'write';

export const isApiTokenScope = (value: unknown): value is ApiTokenScope => value === 'read' || value === 'write';

/** True for a bearer token that is an API token rather than a session. */
export const isApiToken = (token: string): boolean => token.startsWith(API_TOKEN_PREFIX);

export const hashApiToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export interface GeneratedApiToken {
    /** The secret, shown once. */
    token: string;
    /** What the database keeps. */
    hash: string;
    /** How the secret starts, so that a list can tell tokens apart. */
    prefix: string;
}

/** 256 random bits behind the prefix. */
export const generateApiToken = (): GeneratedApiToken => {
    const token = API_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
    return { token, hash: hashApiToken(token), prefix: token.slice(0, API_TOKEN_PREFIX.length + 8) };
};

// Routes an API token may never use, whatever its scope: they manage the
// account itself, the family's accounts or other credentials. Matched on the
// request's full path, by whole segments, ignoring case like Express does.
const RESERVED_PATHS = [
    '/api/auth', // profile, password, sessions, SSO (GET /api/auth/me excepted below)
    '/api/api-tokens', // a token cannot make or revoke tokens
    '/api/invites', // the family's accounts
    '/api/integrations', // other services' credentials
    '/api/calendar', // the feed's token and the subscriptions (the feed itself needs no token)
    '/api/display-links', // other credentials
    '/api/data', // export and import of everything
    '/api/notifications', // the account's own inbox and push subscriptions
    '/api/ai/settings', // the AI provider's key
    '/api/ai/test',
];
// Links an account to a member profile.
const RESERVED_PATTERNS = [/^\/api\/family\/[^/]+\/link$/];
// Says which account the token stands for: how a program checks its setup.
const ALLOWED_PATHS = ['/api/auth/me'];

const underPath = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type ApiTokenRefusal = 'api_token_forbidden' | 'read_only_token';

/**
 * Why an API token may not make this request, or null when it may. `path` is
 * the request's path without its query string, taken from req.originalUrl:
 * inside a router, req.path is relative to the router.
 */
export const apiTokenRefusal = (method: string, path: string, scope: ApiTokenScope): ApiTokenRefusal | null => {
    const normalized = (path.replace(/\/+$/, '') || '/').toLowerCase();
    if (!ALLOWED_PATHS.includes(normalized)) {
        if (RESERVED_PATHS.some((prefix) => underPath(normalized, prefix))) return 'api_token_forbidden';
        if (RESERVED_PATTERNS.some((pattern) => pattern.test(normalized))) return 'api_token_forbidden';
    }
    if (scope === 'read' && !READ_METHODS.has(method.toUpperCase())) return 'read_only_token';
    return null;
};

/**
 * Records that the token was just used. "Last used" in Settings tells a
 * forgotten program from one still running; a minute's precision is plenty
 * and saves a write on every request. Never throws: it must not fail the
 * request.
 */
export const touchApiToken = (id: string): void => {
    query(
        `UPDATE api_tokens SET last_used_at = now()
         WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
        [id],
    ).catch(() => undefined);
};
