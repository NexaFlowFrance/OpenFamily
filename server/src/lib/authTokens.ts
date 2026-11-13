import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/loadEnv';
import { query, Transaction } from '../db';
import { clients, WS_SESSION_REVOKED } from './broadcaster';
import logger from './logger';
import { ApiTokenScope, hashApiToken, isApiToken, touchApiToken } from './apiTokens';

export { WS_SESSION_REVOKED };

/**
 * The only place login tokens are signed and checked. Every sign-in method
 * (password, SSO) and every route that hands out a fresh token goes through
 * issueAccessToken; every authenticated request and WebSocket goes through
 * verifyAccessToken.
 *
 * A token carries the account's token_version (tv). Raising the version in the
 * database, with revokeUserSessions, invalidates every token issued before, on
 * every device. Tokens from before versions existed have no tv and count as 0.
 *
 * A personal API token (lib/apiTokens) is checked here too, so that every
 * route and the WebSocket take it like a session.
 */

export interface TokenUser {
    id: string;
    family_owner_id: string | null;
    token_version: number;
}

export interface VerifiedToken {
    /** The signed-in account, or the account whose API token this is. */
    userId: string;
    /** The family owner whose data the account works on (itself when standalone). */
    ownerId: string;
    /** A signed-in app, or a personal API token (see lib/apiTokens). */
    kind: 'session' | 'api';
    /** API tokens only: what the token may do. */
    scope?: ApiTokenScope;
    /** API tokens only: its row in api_tokens, so that revoking it closes its sockets. */
    apiTokenId?: string;
}

interface TokenClaims {
    userId: string;
    ownerId?: string;
    tv?: number;
}

export const issueAccessToken = (user: TokenUser): string => {
    const claims: TokenClaims = {
        userId: user.id,
        ownerId: user.family_owner_id ?? user.id,
        tv: user.token_version,
    };
    return jwt.sign(claims, getJwtSecret(), { expiresIn: '7d' });
};

export class InvalidTokenError extends Error {}

/**
 * An API token is looked up by its hash and acts as the account that made
 * it, in the family that account was in at the time: a token whose account
 * has since left the family or been deleted is refused, and so is a revoked
 * (deleted) token. Signing the account out everywhere does not touch it: a
 * token is not a session.
 */
const verifyApiToken = async (token: string): Promise<VerifiedToken> => {
    const result = await query(
        `SELECT t.id, t.scope, t.user_id AS family_id, u.id AS user_id, COALESCE(u.family_owner_id, u.id) AS owner_id
         FROM api_tokens t JOIN users u ON u.id = t.created_by
         WHERE t.token_hash = $1`,
        [hashApiToken(token)],
    );
    const row = result.rows[0] as
        | { id: string; scope: ApiTokenScope; family_id: string; user_id: string; owner_id: string }
        | undefined;
    if (!row) {
        throw new InvalidTokenError('Invalid token');
    }
    if (row.owner_id !== row.family_id) {
        logger.warn('auth.api_token_left_family', { id: row.id });
        throw new InvalidTokenError('Invalid token');
    }
    touchApiToken(row.id);
    return { userId: row.user_id, ownerId: row.owner_id, kind: 'api', scope: row.scope, apiTokenId: row.id };
};

/**
 * Checks the signature and expiry, then that the account still exists and has
 * not been signed out since the token was issued. Throws InvalidTokenError for
 * a token that must be refused; database errors propagate as they are, so the
 * caller can answer 503 instead of letting the request through.
 */
export const verifyAccessToken = async (token: string): Promise<VerifiedToken> => {
    if (isApiToken(token)) return verifyApiToken(token);

    let claims: TokenClaims;
    try {
        claims = jwt.verify(token, getJwtSecret()) as TokenClaims;
    } catch {
        throw new InvalidTokenError('Invalid token');
    }
    if (typeof claims.userId !== 'string') {
        throw new InvalidTokenError('Invalid token');
    }

    const result = await query('SELECT token_version FROM users WHERE id = $1', [claims.userId]);
    const row = result.rows[0] as { token_version: number } | undefined;
    if (!row || (claims.tv ?? 0) !== row.token_version) {
        throw new InvalidTokenError('Invalid token');
    }

    return { userId: claims.userId, ownerId: claims.ownerId ?? claims.userId, kind: 'session' };
};

/**
 * Signs the given accounts out everywhere. Runs inside the caller's
 * transaction, so the revocation commits or rolls back with the change that
 * caused it. Returns each account's new version, for a token that the caller
 * re-issues to the current session.
 */
export const revokeUserSessions = async (
    tx: Transaction,
    userIds: string[],
    reason: string,
): Promise<Map<string, number>> => {
    const versions = new Map<string, number>();
    if (userIds.length === 0) return versions;

    const result = await tx.query(
        'UPDATE users SET token_version = token_version + 1 WHERE id = ANY($1::uuid[]) RETURNING id, token_version',
        [userIds],
    );
    for (const row of result.rows as Array<{ id: string; token_version: number }>) {
        versions.set(row.id, row.token_version);
    }

    tx.afterCommit(() => {
        for (const userId of versions.keys()) {
            clients.get(userId)?.forEach((socket) => socket.close(WS_SESSION_REVOKED, 'Session revoked'));
            logger.info('auth.sessions_revoked', { userId, reason });
        }
    });

    return versions;
};
