import crypto from 'node:crypto';
import type { Configuration } from 'openid-client';
import { getAuthConfig, OidcSettings } from '../config/authConfig';
import { loadOpenIdClient, OpenIdClientModule } from './openidClient';
import logger from './logger';

/**
 * The connection to the configured identity provider: discovery, cached once it
 * succeeds. A provider that is down never stops the server from starting; the
 * next sign-in attempt tries again, at most every 30 seconds.
 */

export class ProviderUnavailableError extends Error {}

const DISCOVERY_RETRY_MS = 30_000;

let configuration: Configuration | null = null;
let pending: Promise<Configuration> | null = null;
let lastFailureAt = 0;

const discover = async (client: OpenIdClientModule, settings: OidcSettings): Promise<Configuration> => {
    const config = await client.discovery(
        new URL(settings.issuerUrl),
        settings.clientId,
        settings.clientSecret,
        undefined,
        settings.allowInsecureHttp ? { execute: [client.allowInsecureRequests] } : undefined,
    );
    // ID tokens received from the token endpoint are only trusted on the
    // strength of TLS by default. Also check their signature against the
    // provider's published keys.
    client.enableNonRepudiationChecks(config);
    return config;
};

export const getProvider = async (): Promise<{ client: OpenIdClientModule; config: Configuration; settings: OidcSettings }> => {
    const settings = getAuthConfig().oidc;
    if (!settings) throw new ProviderUnavailableError('SSO is not configured');
    const client = await loadOpenIdClient();

    if (configuration) return { client, config: configuration, settings };
    if (!pending) {
        if (Date.now() - lastFailureAt < DISCOVERY_RETRY_MS) {
            throw new ProviderUnavailableError('Identity provider unreachable');
        }
        pending = discover(client, settings)
            .then((config) => {
                configuration = config;
                return config;
            })
            .catch((error: unknown) => {
                lastFailureAt = Date.now();
                logger.warn('auth.oidc_discovery_failed', { error: describeOidcError(error) });
                throw new ProviderUnavailableError('Identity provider unreachable');
            })
            .finally(() => {
                pending = null;
            });
    }
    return { client, config: await pending, settings };
};

/**
 * Errors from openid-client can quote the provider's response, tokens or
 * claims in their message. Only their name and code are ever logged.
 */
export const describeOidcError = (error: unknown): string => {
    if (error && typeof error === 'object') {
        const { name, code, error: oauthError, status } = error as {
            name?: unknown; code?: unknown; error?: unknown; status?: unknown;
        };
        return [
            [typeof name === 'string' ? name : 'Error', typeof code === 'string' ? code : ''].filter(Boolean).join(':'),
            // The provider's OAuth error code (invalid_grant, invalid_client...)
            // and HTTP status say what went wrong. Its free-text description is
            // left out, like the message: both may carry anything.
            typeof oauthError === 'string' && OAUTH_ERROR_CODE.test(oauthError) ? `error=${oauthError}` : '',
            typeof status === 'number' ? `status=${status}` : '',
        ].filter(Boolean).join(' ');
    }
    return 'unknown';
};

const OAUTH_ERROR_CODE = /^[a-z0-9_.-]{1,64}$/i;

// Values derived from random secrets are stored hashed, so a database dump
// never contains a usable state or handoff code.
export const sha256Hex = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

/** The browser proves it started the flow: base64url(SHA-256(verifier)) must match. */
export const challengeMatches = (verifier: string, challenge: string): boolean => {
    const computed = Buffer.from(crypto.createHash('sha256').update(verifier).digest('base64url'));
    const expected = Buffer.from(challenge);
    return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
};

/** For tests that switch providers between cases. */
export const resetProviderForTests = (): void => {
    configuration = null;
    pending = null;
    lastFailureAt = 0;
};
