import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { query, withTransaction } from '../db';
import { getAuthConfig } from '../config/authConfig';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { InvalidTokenError, issueAccessToken, revokeUserSessions, verifyAccessToken } from '../lib/authTokens';
import {
    appOrigin,
    challengeMatches,
    describeOidcError,
    getProvider,
    ProviderUnavailableError,
    sha256Hex,
} from '../lib/oidcProvider';
import { OidcClaims, resolveIdentity } from '../lib/oidcResolve';
import logger from '../lib/logger';

/**
 * Single sign-on through the configured OpenID Connect provider.
 *
 *   POST /start     the app asks for the provider's sign-in address
 *   GET  /callback  the provider sends the browser back here
 *   POST /exchange  the app trades the one-time code from the callback for a session
 *   DELETE /link    unlinks the provider account from the signed-in account
 *
 * The server keeps no sessions, so a sign-in in progress is a row in
 * oidc_flows. The app's own tokens live in localStorage, which a redirect cannot
 * reach: the callback hands the app a one-time code in the URL fragment, and the
 * app redeems it with a secret only the tab that started the flow holds
 * (clientVerifier). A code copied from a log, a history entry or a crafted link
 * is useless without that secret, which also blocks login CSRF.
 */

const router = Router();

const FLOW_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 60 * 1000;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HANDOFF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// The callback is reached by the provider's redirect, often several times while
// someone retries, and skipSuccessfulRequests would never count it (it always
// answers with a redirect): a separate, per-IP limit.
const callbackRateLimitMax = Number.parseInt(process.env.OIDC_CALLBACK_RATE_LIMIT_MAX || '60', 10);
const callbackRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number.isNaN(callbackRateLimitMax) ? 60 : callbackRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
});

const bearerToken = (req: Request): string => {
    const header = req.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

// Error codes the provider may send back in the redirect (RFC 6749 and OpenID
// Connect). Anything else is attacker-controlled text and is never logged.
const KNOWN_PROVIDER_ERRORS = new Set([
    'access_denied', 'invalid_request', 'unauthorized_client', 'unsupported_response_type', 'invalid_scope',
    'server_error', 'temporarily_unavailable', 'interaction_required', 'login_required',
    'account_selection_required', 'consent_required', 'invalid_request_uri', 'invalid_request_object',
    'request_not_supported', 'request_uri_not_supported', 'registration_not_supported',
]);

router.post('/start', async (req: Request, res: Response) => {
    const { clientChallenge, inviteToken, link } = (req.body ?? {}) as {
        clientChallenge?: unknown; inviteToken?: unknown; link?: unknown;
    };
    if (typeof clientChallenge !== 'string' || !CHALLENGE_PATTERN.test(clientChallenge)) {
        return res.status(400).json({ success: false, error: 'invalid_request' });
    }
    const invite = typeof inviteToken === 'string' && inviteToken.length > 0 && inviteToken.length <= 255 ? inviteToken : null;

    let linkUserId: string | null = null;
    if (link === true) {
        try {
            linkUserId = (await verifyAccessToken(bearerToken(req))).userId;
        } catch (error) {
            const status = error instanceof InvalidTokenError ? 401 : 503;
            return res.status(status).json({ success: false, error: status === 401 ? 'Invalid token' : 'Service unavailable' });
        }
    }

    try {
        const { client, config, settings } = await getProvider();
        const state = client.randomState();
        const nonce = client.randomNonce();
        const codeVerifier = client.randomPKCECodeVerifier();
        const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

        await query('DELETE FROM oidc_flows WHERE expires_at < NOW()');
        await query(
            `INSERT INTO oidc_flows (state_hash, code_verifier, nonce, client_challenge, mode, link_user_id, invite_token, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [sha256Hex(state), codeVerifier, nonce, clientChallenge, linkUserId ? 'link' : 'login', linkUserId,
                linkUserId ? null : invite, new Date(Date.now() + FLOW_TTL_MS).toISOString()],
        );

        const authorizationUrl = client.buildAuthorizationUrl(config, {
            redirect_uri: settings.redirectUri,
            scope: settings.scopes,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state,
            nonce,
        });
        return res.json({ success: true, data: { authorizationUrl: authorizationUrl.href } });
    } catch (error) {
        if (error instanceof ProviderUnavailableError) {
            return res.status(503).json({ success: false, error: 'provider_unavailable' });
        }
        logger.error('auth.oidc_start_failed', { error: describeOidcError(error) });
        return res.status(500).json({ success: false, error: 'server_error' });
    }
});

router.get('/callback', callbackRateLimiter, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const settings = getAuthConfig().oidc;
    if (!settings) return res.status(404).end();

    const backToApp = (fragment: string) => res.redirect(302, `${appOrigin(settings)}/auth/callback#${fragment}`);
    const fail = (code: string) => backToApp(`error=${code}`);

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!state) return fail('invalid_request');

    // Claim the flow: a state works once, and only before it expires.
    const claimed = await query(
        `UPDATE oidc_flows SET state_hash = NULL
         WHERE state_hash = $1 AND expires_at > NOW() AND handoff_hash IS NULL
         RETURNING id, code_verifier, nonce`,
        [sha256Hex(state)],
    );
    const flow = claimed.rows[0] as { id: string; code_verifier: string; nonce: string } | undefined;
    if (!flow) return fail('expired');

    if (typeof req.query.error === 'string') {
        const providerError = KNOWN_PROVIDER_ERRORS.has(req.query.error) ? req.query.error : 'other';
        logger.info('auth.oidc_provider_error', { flowId: flow.id, error: providerError });
        await query('DELETE FROM oidc_flows WHERE id = $1', [flow.id]);
        return fail('cancelled');
    }

    try {
        const { client, config } = await getProvider();
        // Rebuild the address the provider redirected to from the configured
        // one: the token request must name exactly the registered redirect URI.
        const currentUrl = new URL(settings.redirectUri);
        currentUrl.search = new URL(req.originalUrl, 'http://placeholder').search;

        const tokens = await client.authorizationCodeGrant(config, currentUrl, {
            pkceCodeVerifier: flow.code_verifier,
            expectedState: state,
            expectedNonce: flow.nonce,
            idTokenExpected: true,
        });
        const idClaims = tokens.claims();
        if (!idClaims) throw new Error('missing ID token');

        // The email and whether it is verified always come from the same source.
        let emailSource: Record<string, unknown> = idClaims;
        if (typeof idClaims.email !== 'string') {
            try {
                emailSource = await client.fetchUserInfo(config, tokens.access_token, idClaims.sub) as Record<string, unknown>;
            } catch (error) {
                // A UserInfo answer about someone else is an attack, not an outage.
                if ((error as { code?: unknown }).code === 'OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED') throw error;
                logger.warn('auth.oidc_userinfo_failed', { flowId: flow.id, error: describeOidcError(error) });
            }
        }

        const text = (value: unknown): string | undefined =>
            typeof value === 'string' && value.trim() ? value.trim().slice(0, 255) : undefined;
        const claims: OidcClaims = {
            iss: idClaims.iss,
            sub: idClaims.sub,
            email: text(emailSource.email),
            emailVerified: typeof emailSource.email === 'string' && emailSource.email_verified === true,
            name: text(idClaims.name ?? emailSource.name),
            givenName: text(idClaims.given_name ?? emailSource.given_name),
            familyName: text(idClaims.family_name ?? emailSource.family_name),
            preferredUsername: text(idClaims.preferred_username ?? emailSource.preferred_username),
            locale: text(idClaims.locale ?? emailSource.locale),
        };

        const handoff = crypto.randomBytes(32).toString('base64url');
        await query(
            'UPDATE oidc_flows SET claims = $1, handoff_hash = $2, expires_at = $3 WHERE id = $4',
            [JSON.stringify(claims), sha256Hex(handoff), new Date(Date.now() + HANDOFF_TTL_MS).toISOString(), flow.id],
        );
        return backToApp(`code=${handoff}`);
    } catch (error) {
        await query('DELETE FROM oidc_flows WHERE id = $1', [flow.id]).catch(() => undefined);
        if (error instanceof ProviderUnavailableError) return fail('provider_unavailable');
        logger.warn('auth.oidc_callback_failed', { flowId: flow.id, error: describeOidcError(error) });
        return fail('sign_in_failed');
    }
});

router.post('/exchange', async (req: Request, res: Response) => {
    const { code, clientVerifier } = (req.body ?? {}) as { code?: unknown; clientVerifier?: unknown };
    if (typeof code !== 'string' || !HANDOFF_PATTERN.test(code) || typeof clientVerifier !== 'string' || clientVerifier.length > 128) {
        return res.status(400).json({ success: false, error: 'invalid_code' });
    }

    // Burn the code before anything else: of two concurrent exchanges only one
    // gets the row, and a failed exchange cannot be retried.
    const consumed = await query(
        `DELETE FROM oidc_flows WHERE handoff_hash = $1 AND expires_at > NOW()
         RETURNING client_challenge, mode, link_user_id, invite_token, claims`,
        [sha256Hex(code)],
    );
    const flow = consumed.rows[0] as {
        client_challenge: string; mode: 'login' | 'link'; link_user_id: string | null;
        invite_token: string | null; claims: OidcClaims;
    } | undefined;
    if (!flow || !challengeMatches(clientVerifier, flow.client_challenge)) {
        return res.status(400).json({ success: false, error: 'invalid_code' });
    }

    if (flow.mode === 'link') {
        let sessionUserId: string;
        try {
            sessionUserId = (await verifyAccessToken(bearerToken(req))).userId;
        } catch {
            return res.status(401).json({ success: false, error: 'session_mismatch' });
        }
        if (sessionUserId !== flow.link_user_id) {
            return res.status(403).json({ success: false, error: 'session_mismatch' });
        }
    }

    try {
        const outcome = await resolveIdentity(flow.claims, {
            linkUserId: flow.mode === 'link' ? flow.link_user_id : null,
            inviteToken: flow.invite_token,
        });
        if (outcome.kind === 'error') {
            logger.info('auth.oidc_resolve_refused', { mode: flow.mode, code: outcome.code });
            return res.status(409).json({ success: false, error: outcome.code });
        }
        if (outcome.kind === 'linked') {
            return res.json({ success: true, data: { mode: 'link', email: outcome.email } });
        }
        return res.json({ success: true, data: { mode: 'login', created: outcome.created, ...outcome.payload } });
    } catch (error) {
        logger.error('auth.oidc_exchange_failed', { mode: flow.mode, error: describeOidcError(error) });
        return res.status(500).json({ success: false, error: 'server_error' });
    }
});

// Unlinking leaves the account with its password as the only way in, so it is
// refused when there is none or password sign-in is off. Every other session
// ends (they may have been opened through the provider); this one continues
// with a fresh token.
router.delete('/link', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const user = await query('SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1', [req.actualUserId]);
        if (!user.rows[0]?.has_password || !getAuthConfig().passwordLogin) {
            return res.status(409).json({ success: false, error: 'no_other_sign_in' });
        }

        const token = await withTransaction(async (tx) => {
            const removed = await tx.query('DELETE FROM user_identities WHERE user_id = $1 RETURNING id', [req.actualUserId]);
            if (removed.rows.length === 0) return null;
            await revokeUserSessions(tx, [req.actualUserId!], 'sso_unlinked');
            const { rows } = await tx.query('SELECT id, family_owner_id, token_version FROM users WHERE id = $1', [req.actualUserId]);
            return issueAccessToken(rows[0]);
        });
        if (!token) {
            return res.status(404).json({ success: false, error: 'not_linked' });
        }
        return res.json({ success: true, data: { token } });
    } catch (error) {
        logger.error('auth.oidc_unlink_failed', { error: describeOidcError(error) });
        return res.status(500).json({ success: false, error: 'server_error' });
    }
});

export default router;
