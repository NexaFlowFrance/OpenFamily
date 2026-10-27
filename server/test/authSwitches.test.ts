import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuthConfig } from '../src/config/authConfig';
import { app, configure, createInvite, registerWithPassword, resetState, sso, startSuite, stopSuite } from './helpers';

beforeAll(startSuite);
afterAll(stopSuite);
beforeEach(() => resetState());

const config = () => request(app).get('/api/auth/config');

describe('effective configuration', () => {
    it('keeps today\'s behaviour with every switch unset, plus SSO', async () => {
        const response = await config();
        expect(response.body.data).toEqual({
            passwordLogin: true,
            passwordSignup: true,
            passwordReset: false,
            oidc: { enabled: true, name: 'TestIdP', signup: true },
        });
    });

    it.each([
        // PASSWORD_LOGIN, REGISTRATION, OIDC_REGISTRATION -> passwordLogin, passwordSignup, oidcSignup
        [undefined, undefined, undefined, true, true, true],
        ['false', 'false', 'true', false, false, true],
        ['true', 'false', 'true', true, false, true],
        ['true', 'false', 'false', true, false, false],
        ['true', 'false', undefined, true, false, false],
        ['true', 'true', 'false', true, true, false],
        ['false', 'true', 'true', false, false, true],
        ['false', undefined, undefined, false, false, true],
    ])('PASSWORD_LOGIN=%s REGISTRATION=%s OIDC_REGISTRATION=%s', (pl, reg, oreg, login, signup, oidcSignup) => {
        configure({ PASSWORD_LOGIN_ENABLED: pl, REGISTRATION_ENABLED: reg, OIDC_REGISTRATION_ENABLED: oreg });
        expect(getAuthConfig()).toMatchObject({ passwordLogin: login, passwordSignup: signup, oidcSignup });
    });

    it('never turns password login off when SSO is not configured (lockout guard)', () => {
        configure({ PASSWORD_LOGIN_ENABLED: 'false', OIDC_CLIENT_SECRET: undefined });
        expect(getAuthConfig()).toMatchObject({ passwordLogin: true, oidc: null });
    });

    it.each([
        ['without a redirect URI either', undefined],
        // The redirect URI is the API's address, which may not be the app's.
        ['even with a redirect URI', 'https://api.example.org/api/auth/oidc/callback'],
    ])('keeps SSO off without the app\'s public address (%s)', (_label, redirectUri) => {
        const publicUrl = process.env.APP_PUBLIC_URL;
        delete process.env.APP_PUBLIC_URL;
        try {
            configure({ OIDC_REDIRECT_URI: redirectUri });
            expect(getAuthConfig().oidc).toBeNull();
        } finally {
            process.env.APP_PUBLIC_URL = publicUrl;
        }
    });

    it('keeps the older /registration endpoint working', async () => {
        configure({ REGISTRATION_ENABLED: 'false' });
        const response = await request(app).get('/api/auth/registration');
        expect(response.body.data).toEqual({ open: false });
    });
});

describe('password sign-in', () => {
    it('cannot sign into an SSO-only account with any password', async () => {
        await sso();
        const response = await request(app).post('/api/auth/login').send({ email: 'alice@example.org', password: 'anything-at-all' });
        expect(response.status).toBe(401);
    });

    it('is refused everywhere once turned off', async () => {
        await registerWithPassword('bob@example.org', 'correct-horse-1');
        configure({ PASSWORD_LOGIN_ENABLED: 'false', REGISTRATION_ENABLED: 'false', OIDC_REGISTRATION_ENABLED: 'true' });

        const login = await request(app).post('/api/auth/login').send({ email: 'bob@example.org', password: 'correct-horse-1' });
        expect(login.status).toBe(403);
        const register = await request(app).post('/api/auth/register').send({ email: 'x@example.org', password: 'correct-horse-1', name: 'X' });
        expect(register.status).toBe(403);
        const forgot = await request(app).post('/api/auth/password/forgot').send({ email: 'bob@example.org' });
        expect(forgot.status).toBe(403);
        // ...while SSO sign-up still works.
        expect((await sso()).status).toBe(200);
    });

    it('still accepts an invitation when sign-up is closed', async () => {
        const owner = await registerWithPassword('owner@example.org');
        const invite = await createInvite(owner.token);
        configure({ REGISTRATION_ENABLED: 'false' });
        const closed = await request(app).post('/api/auth/register').send({ email: 'new@example.org', password: 'correct-horse-1', name: 'N' });
        expect(closed.status).toBe(403);
        const invited = await request(app).post('/api/auth/register')
            .send({ email: 'new@example.org', password: 'correct-horse-1', name: 'N', inviteToken: invite });
        expect(invited.status).toBe(200);
        expect(invited.body.data.user.is_owner).toBe(false);
    });
});
