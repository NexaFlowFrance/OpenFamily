import { loadEnv } from './loadEnv';
import { isMailEnabled } from '../lib/mailer';
import logger from '../lib/logger';

/**
 * How people may sign in and create accounts on this server, decided once from
 * the environment and read through getAuthConfig() everywhere else:
 *
 *   PASSWORD_LOGIN_ENABLED     email + password sign-in (and password reset)
 *   REGISTRATION_ENABLED       creating an account with a password, without an invite
 *   OIDC_REGISTRATION_ENABLED  creating an account through SSO, without an invite
 *                              (follows REGISTRATION_ENABLED when unset)
 *
 * Invitations bypass both sign-up switches, as they always have, but never a
 * sign-in method that is turned off. Password login cannot be turned off unless
 * SSO is fully configured, so a server can never lock everyone out.
 */

export interface OidcSettings {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    /** Where the app is served (APP_PUBLIC_URL), where the callback sends the browser back to. */
    appUrl: string;
    redirectUri: string;
    providerName: string;
    scopes: string;
    allowInsecureHttp: boolean;
}

export interface AuthConfig {
    passwordLogin: boolean;
    passwordSignup: boolean;
    oidcSignup: boolean;
    /** Null when SSO is not configured. */
    oidc: OidcSettings | null;
}

const flag = (value: string | undefined, fallback: boolean): boolean => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
};

const trimmed = (value: string | undefined): string => value?.trim() ?? '';

const readOidcSettings = (): OidcSettings | null => {
    const issuerUrl = trimmed(process.env.OIDC_ISSUER_URL);
    const clientId = trimmed(process.env.OIDC_CLIENT_ID);
    const clientSecret = trimmed(process.env.OIDC_CLIENT_SECRET);

    if (!issuerUrl && !clientId && !clientSecret) {
        return null;
    }
    const missing = [
        !issuerUrl && 'OIDC_ISSUER_URL',
        !clientId && 'OIDC_CLIENT_ID',
        !clientSecret && 'OIDC_CLIENT_SECRET',
    ].filter(Boolean);
    if (missing.length > 0) {
        logger.error('auth.oidc_disabled', { reason: `missing ${missing.join(', ')}` });
        return null;
    }

    // The provider redirects to the API and the API then sends the browser to
    // the app, so both public addresses must be known. They are never guessed
    // from the request's Host header, nor from each other: the API may be
    // served from another host than the app (VITE_API_URL).
    const publicUrl = trimmed(process.env.APP_PUBLIC_URL).replace(/\/+$/, '');
    if (!publicUrl) {
        logger.error('auth.oidc_disabled', { reason: 'set APP_PUBLIC_URL' });
        return null;
    }
    const redirectUri = trimmed(process.env.OIDC_REDIRECT_URI) || `${publicUrl}/api/auth/oidc/callback`;

    return {
        issuerUrl,
        clientId,
        clientSecret,
        appUrl: publicUrl,
        redirectUri,
        providerName: trimmed(process.env.OIDC_PROVIDER_NAME) || 'SSO',
        scopes: trimmed(process.env.OIDC_SCOPES) || 'openid email profile',
        allowInsecureHttp: flag(process.env.OIDC_ALLOW_INSECURE_HTTP, false),
    };
};

const computeAuthConfig = (): AuthConfig => {
    loadEnv();
    const oidc = readOidcSettings();

    let passwordLogin = flag(process.env.PASSWORD_LOGIN_ENABLED, true);
    if (!passwordLogin && !oidc) {
        logger.warn('auth.password_login_forced_on', {
            reason: 'PASSWORD_LOGIN_ENABLED=false ignored: single sign-on is not configured',
        });
        passwordLogin = true;
    }

    const registration = flag(process.env.REGISTRATION_ENABLED, true);
    const config: AuthConfig = {
        passwordLogin,
        passwordSignup: passwordLogin && registration,
        oidcSignup: Boolean(oidc) && flag(process.env.OIDC_REGISTRATION_ENABLED, registration),
        oidc,
    };

    // The logger masks any field whose name mentions a password, hence these names.
    logger.info('auth.config', {
        localLogin: config.passwordLogin,
        localSignup: config.passwordSignup,
        oidc: Boolean(oidc),
        issuer: oidc?.issuerUrl,
        oidcSignup: config.oidcSignup,
    });
    return config;
};

let cached: AuthConfig | null = null;

export const getAuthConfig = (): AuthConfig => {
    if (!cached) cached = computeAuthConfig();
    return cached;
};

/** Password reset also needs outgoing mail; checked live like the mailer does. */
export const passwordResetEnabled = (): boolean => getAuthConfig().passwordLogin && isMailEnabled();

/** For tests that change the environment between cases. */
export const resetAuthConfigForTests = (): void => {
    cached = null;
};
