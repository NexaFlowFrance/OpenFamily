import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../src/lib/logger';
import { app, configure, idp, query, resetState, runCallback, sso, startSuite, stopSuite } from './helpers';

// What openid-client checks for us, as configured by lib/oidcProvider.ts. Each
// broken token must end the sign-in at the callback, before any account exists.

beforeAll(startSuite);
afterAll(stopSuite);
beforeEach(() => resetState());

const expectRefused = async () => {
    const result = await runCallback();
    expect(result.code).toBeNull();
    expect(result.error).toBe('sign_in_failed');
    expect(result.location.startsWith('http://app.test/auth/callback#')).toBe(true);
    const { rows } = await query('SELECT count(*)::int AS n FROM users');
    expect(rows[0].n).toBe(0);
};

describe('ID token validation', () => {
    it('accepts a valid token', async () => {
        const result = await sso();
        expect(result.status).toBe(200);
        expect(result.body.data.user.email).toBe('alice@example.org');
    });

    it('rejects a tampered signature (signature checks are on)', async () => {
        idp.tamper.badSignature = true;
        await expectRefused();
    });

    it('rejects alg "none"', async () => {
        idp.tamper.algNone = true;
        await expectRefused();
    });

    it('rejects another issuer', async () => {
        idp.tamper.issuer = 'https://evil.example';
        await expectRefused();
    });

    it('rejects another audience', async () => {
        idp.tamper.audience = 'someone-else';
        await expectRefused();
    });

    it('rejects an extra audience without azp', async () => {
        idp.tamper.audience = [idp.clientId, 'someone-else'];
        await expectRefused();
    });

    it('rejects an azp naming another client', async () => {
        idp.tamper.audience = [idp.clientId, 'someone-else'];
        idp.tamper.azp = 'someone-else';
        await expectRefused();
    });

    it('rejects an expired token', async () => {
        idp.tamper.expiredSecondsAgo = 120;
        await expectRefused();
    });

    it('rejects a token whose nonce does not match', async () => {
        idp.tamper.wrongNonce = true;
        await expectRefused();
    });

    it('rejects a token without sub', async () => {
        idp.reset({ sub: undefined });
        await expectRefused();
    });
});

describe('UserInfo', () => {
    it('reads the email from UserInfo when the ID token has none', async () => {
        idp.reset({ email: undefined, email_verified: undefined });
        idp.userinfo = { email: 'alice@example.org', email_verified: true };
        const result = await sso();
        expect(result.status).toBe(200);
        expect(result.body.data.user.email).toBe('alice@example.org');
    });

    it('refuses a UserInfo answer about another subject', async () => {
        idp.reset({ email: undefined, email_verified: undefined });
        idp.userinfo = { email: 'mallory@example.org', email_verified: true };
        idp.tamper.userinfoSub = 'mallory-sub';
        await expectRefused();
    });

    it('never mixes email and email_verified from two sources', async () => {
        idp.reset({ email: undefined, email_verified: true });
        idp.userinfo = { email: 'alice@example.org' };
        const result = await sso();
        expect(result.status).toBe(409);
        expect(result.body.error).toBe('email_unverified');
    });
});

describe('provider connection', () => {
    it('refuses a plain-http provider unless explicitly allowed', async () => {
        configure({ OIDC_ALLOW_INSECURE_HTTP: undefined });
        const response = await request(app).post('/api/auth/oidc/start').send({ clientChallenge: 'a'.repeat(43) });
        expect(response.status).toBe(503);
        expect(response.body.error).toBe('provider_unavailable');
    });

    it('logs why the provider refused the code, without its free-text description', async () => {
        const warn = vi.spyOn(logger, 'warn');
        idp.tamper.tokenError = 'invalid_client';
        await expectRefused();
        const logged = JSON.stringify(warn.mock.calls.filter(([event]) => event === 'auth.oidc_callback_failed'));
        warn.mockRestore();
        expect(logged).toContain('error=invalid_client');
        expect(logged).toContain('status=400');
        expect(logged).not.toContain('SECRET-DESCRIPTION');
    });
});
