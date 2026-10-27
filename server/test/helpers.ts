import crypto from 'node:crypto';
import request from 'supertest';
import app from '../src/app';
import pool, { query, runMigrations } from '../src/db';
import { resetAuthConfigForTests } from '../src/config/authConfig';
import { resetProviderForTests } from '../src/lib/oidcProvider';
import { provideOpenIdClientForTests } from '../src/lib/openidClient';
import { FakeIdp } from './fakeIdp';

export { app, query };
export const idp = new FakeIdp();

const SSO_ENV = ['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_ALLOW_INSECURE_HTTP', 'OIDC_PROVIDER_NAME',
    'OIDC_REGISTRATION_ENABLED', 'REGISTRATION_ENABLED', 'PASSWORD_LOGIN_ENABLED', 'OIDC_REDIRECT_URI'];

/** Applies a sign-in configuration (unset variables fall back to their defaults). */
export const configure = (env: Record<string, string | undefined> = {}): void => {
    for (const name of SSO_ENV) delete process.env[name];
    Object.assign(process.env, {
        OIDC_ISSUER_URL: idp.issuer,
        OIDC_CLIENT_ID: idp.clientId,
        OIDC_CLIENT_SECRET: idp.clientSecret,
        OIDC_ALLOW_INSECURE_HTTP: 'true',
        OIDC_PROVIDER_NAME: 'TestIdP',
    });
    for (const [name, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
    resetAuthConfigForTests();
    resetProviderForTests();
};

export const startSuite = async (): Promise<void> => {
    provideOpenIdClientForTests(await import('openid-client'));
    await idp.start();
    await runMigrations();
};

export const stopSuite = async (): Promise<void> => {
    await idp.stop();
    await pool.end();
};

export const resetState = async (claims: Record<string, unknown> = {}): Promise<void> => {
    await query('TRUNCATE users, oidc_flows RESTART IDENTITY CASCADE');
    idp.reset(claims);
    configure();
};

const randomVerifier = (): string => crypto.randomBytes(32).toString('base64url');
const challengeOf = (verifier: string): string => crypto.createHash('sha256').update(verifier).digest('base64url');

export interface CallbackResult {
    /** Where the callback sent the browser (app origin + /auth/callback#...). */
    location: string;
    code: string | null;
    error: string | null;
    verifier: string;
}

/** Runs /start, the provider round trip and /callback; stops before /exchange. */
export const runCallback = async (
    options: { link?: boolean; token?: string; invite?: string } = {},
): Promise<CallbackResult> => {
    const verifier = randomVerifier();
    let start = request(app).post('/api/auth/oidc/start');
    if (options.token) start = start.set('Authorization', `Bearer ${options.token}`);
    const started = await start.send({ clientChallenge: challengeOf(verifier), link: options.link === true, inviteToken: options.invite });
    if (started.status !== 200) throw new Error(`start failed: ${started.status} ${JSON.stringify(started.body)}`);

    const atProvider = await fetch(started.body.data.authorizationUrl, { redirect: 'manual' });
    const backTo = new URL(atProvider.headers.get('location')!);
    const callback = await request(app).get(`/api/auth/oidc/callback${backTo.search}`);
    const location = callback.headers.location as string;
    const fragment = new URLSearchParams(new URL(location).hash.slice(1));
    return { location, code: fragment.get('code'), error: fragment.get('error'), verifier };
};

export const exchange = (code: string, verifier: string, token?: string) => {
    let req = request(app).post('/api/auth/oidc/exchange');
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return req.send({ code, clientVerifier: verifier });
};

/** A full SSO sign-in (or link, with `link` and `token`): returns the exchange response. */
export const sso = async (options: { link?: boolean; token?: string; invite?: string } = {}) => {
    const result = await runCallback(options);
    if (!result.code) return { status: 0, callbackError: result.error, body: null as any };
    const response = await exchange(result.code, result.verifier, options.token);
    return { status: response.status, callbackError: null, body: response.body };
};

export const registerWithPassword = async (email: string, password = 'correct-horse-1', name = 'Someone') => {
    const response = await request(app).post('/api/auth/register').send({ email, password, name });
    if (response.status !== 200) throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
    return response.body.data as { token: string; user: { id: string } };
};

export const me = (token: string) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

export const createInvite = async (ownerToken: string, inviteeEmail?: string) => {
    const response = await request(app)
        .post('/api/invites')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(inviteeEmail ? { inviteeEmail } : {});
    if (response.status !== 200 && response.status !== 201) {
        throw new Error(`invite failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body.data.token as string;
};
