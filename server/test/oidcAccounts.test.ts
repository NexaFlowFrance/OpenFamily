import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    configure, createInvite, exchange, idp, me, query, registerWithPassword, resetState, runCallback, sso, startSuite, stopSuite,
} from './helpers';

beforeAll(startSuite);
afterAll(stopSuite);
beforeEach(() => resetState());

const countUsers = async () => (await query('SELECT count(*)::int AS n FROM users')).rows[0].n as number;

describe('a returning identity', () => {
    it('signs in by (issuer, subject), without needing an email', async () => {
        const first = await sso();
        idp.reset({ email: undefined, email_verified: undefined });
        idp.tamper.userinfoStatus = 500;
        const again = await sso();
        expect(again.status).toBe(200);
        expect(again.body.data.created).toBe(false);
        expect(again.body.data.user.id).toBe(first.body.data.user.id);
    });

    it('keeps its account when the email changes at the provider', async () => {
        const first = await sso();
        idp.reset({ email: 'alice.new@example.org' });
        const again = await sso();
        expect(again.body.data.user.id).toBe(first.body.data.user.id);
        expect(again.body.data.user.email).toBe('alice@example.org');
        const identity = await query('SELECT email FROM user_identities');
        expect(identity.rows[0].email).toBe('alice.new@example.org');

        // An unverified address is not recorded.
        idp.reset({ email: 'unverified@example.org', email_verified: false });
        await sso();
        expect((await query('SELECT email FROM user_identities')).rows[0].email).toBe('alice.new@example.org');
    });
});

describe('an existing account with the same email', () => {
    it.each([
        ['verified by the provider', {}],
        ['not verified', { email_verified: false }],
    ])('is never opened by SSO (%s): its holder links from Settings', async (_label, claims) => {
        const alice = await registerWithPassword('alice@example.org');
        idp.reset(claims);
        const result = await sso();
        expect(result.status).toBe(409);
        expect(result.body.error).toBe('account_conflict');
        expect(result.body.data).toBeUndefined();
        expect((await query('SELECT count(*)::int AS n FROM user_identities')).rows[0].n).toBe(0);
        expect(await countUsers()).toBe(1);

        // Once linked from Settings, the same provider account signs in to it.
        idp.reset();
        await sso({ link: true, token: alice.token });
        const again = await sso();
        expect(again.status).toBe(200);
        expect(again.body.data.user.id).toBe(alice.user.id);
    });

    it('is refused when it was created through SSO by another identity (recycled address)', async () => {
        await sso();
        idp.reset({ sub: 'someone-new-with-the-same-address' });
        const result = await sso();
        expect(result.status).toBe(409);
        expect(result.body.error).toBe('account_conflict');
        expect(await countUsers()).toBe(1);
    });

    it('is refused when the address matches accounts differing only by case', async () => {
        await query(`INSERT INTO users (email, password_hash, name) VALUES ('Alice@example.org', 'x', 'A'), ('alice@example.org', 'x', 'B')`);
        const result = await sso();
        expect(result.body.error).toBe('account_conflict');
    });
});

describe('creating an account', () => {
    it('creates one from the claims when sign-up is open', async () => {
        idp.reset({ name: undefined, given_name: 'Alice', family_name: 'Martin', locale: 'de-CH' });
        const result = await sso();
        expect(result.status).toBe(200);
        expect(result.body.data.created).toBe(true);
        expect(result.body.data.user).toMatchObject({ email: 'alice@example.org', name: 'Alice Martin', language: 'de', is_owner: true, role: 'parent' });
        const profile = await me(result.body.data.token);
        expect(profile.body.data.user).toMatchObject({ has_password: false, sso_linked: true });
    });

    it('needs a verified email', async () => {
        idp.reset({ email_verified: false });
        const result = await sso();
        expect(result.body.error).toBe('email_unverified');
        expect(await countUsers()).toBe(0);
    });

    it('needs an email', async () => {
        idp.reset({ email: undefined, email_verified: undefined });
        const result = await sso();
        expect(result.body.error).toBe('email_required');
    });

    it('is refused when SSO sign-up is closed', async () => {
        configure({ OIDC_REGISTRATION_ENABLED: 'false' });
        expect((await sso()).body.error).toBe('registration_closed');
    });

    it('follows REGISTRATION_ENABLED when OIDC_REGISTRATION_ENABLED is unset', async () => {
        configure({ REGISTRATION_ENABLED: 'false' });
        expect((await sso()).body.error).toBe('registration_closed');
        configure({ REGISTRATION_ENABLED: 'false', OIDC_REGISTRATION_ENABLED: 'true' });
        expect((await sso()).status).toBe(200);
    });

    it('accepts an invitation when sign-up is closed, with the inviter\'s family and role', async () => {
        const owner = await registerWithPassword('owner@example.org');
        const invite = await createInvite(owner.token);
        configure({ REGISTRATION_ENABLED: 'false' });
        const result = await sso({ invite });
        expect(result.status).toBe(200);
        expect(result.body.data.user.is_owner).toBe(false);
        const row = await query('SELECT family_owner_id FROM users WHERE id = $1', [result.body.data.user.id]);
        expect(row.rows[0].family_owner_id).toBe(owner.user.id);
        expect((await query("SELECT status FROM family_invites")).rows[0].status).toBe('accepted');
    });

    it('refuses an invitation addressed to someone else', async () => {
        const owner = await registerWithPassword('owner@example.org');
        const invite = await createInvite(owner.token, 'bob@example.org');
        const result = await sso({ invite });
        expect(result.body.error).toBe('invite_invalid');
        expect(await countUsers()).toBe(1);
    });

    it('creates a single account when two first sign-ins race', async () => {
        const [a, b] = await Promise.all([runCallback(), runCallback()]);
        const [ra, rb] = await Promise.all([exchange(a.code!, a.verifier), exchange(b.code!, b.verifier)]);
        expect(ra.status).toBe(200);
        expect(rb.status).toBe(200);
        expect(ra.body.data.user.id).toBe(rb.body.data.user.id);
        expect(await countUsers()).toBe(1);
        expect((await query('SELECT count(*)::int AS n FROM user_identities')).rows[0].n).toBe(1);
    });
});

describe('explicit linking from Settings', () => {
    it('links the signed-in account, even without an email claim', async () => {
        const bob = await registerWithPassword('bob@example.org');
        idp.reset({ sub: 'bob-sub', email: undefined, email_verified: undefined });
        const result = await sso({ link: true, token: bob.token });
        expect(result.status).toBe(200);
        expect((await me(bob.token)).body.data.user.sso_linked).toBe(true);
    });

    it('refuses an identity that belongs to another account, changing nothing (user B links user A\'s identity)', async () => {
        const alice = await sso();
        const bob = await registerWithPassword('bob@example.org');
        const result = await sso({ link: true, token: bob.token });
        expect(result.status).toBe(409);
        expect(result.body.error).toBe('identity_in_use');
        expect(result.body.data).toBeUndefined();
        expect(JSON.stringify(result.body)).not.toContain(alice.body.data.user.id);

        const bobNow = await me(bob.token);
        expect(bobNow.body.data.user).toMatchObject({ email: 'bob@example.org', sso_linked: false });
        const identities = await query('SELECT user_id FROM user_identities');
        expect(identities.rows).toEqual([{ user_id: alice.body.data.user.id }]);
    });

    it('reports an identity the account already has', async () => {
        const bob = await registerWithPassword('bob@example.org');
        idp.reset({ sub: 'bob-sub', email: 'bob@example.org' });
        await sso({ link: true, token: bob.token });
        const again = await sso({ link: true, token: bob.token });
        expect(again.body.error).toBe('already_linked');
    });
});
