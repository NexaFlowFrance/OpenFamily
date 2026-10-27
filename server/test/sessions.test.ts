import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTransaction } from '../src/db';
import { clients } from '../src/lib/broadcaster';
import { revokeUserSessions } from '../src/lib/authTokens';
import { app, createInvite, me, query, registerWithPassword, resetState, sso, startSuite, stopSuite } from './helpers';

beforeAll(startSuite);
afterAll(stopSuite);
beforeEach(() => resetState());

const status = async (token: string) => (await me(token)).status;
const login = async (email: string, password = 'correct-horse-1') =>
    (await request(app).post('/api/auth/login').send({ email, password })).body.data.token as string;

/** An owner and a member of the owner's family. */
const family = async () => {
    const owner = await registerWithPassword('owner@example.org');
    const invite = await createInvite(owner.token);
    const joined = await request(app).post('/api/auth/register')
        .send({ email: 'member@example.org', password: 'correct-horse-1', name: 'Member', inviteToken: invite });
    return { owner, member: joined.body.data as { token: string; user: { id: string } } };
};

describe('token versions', () => {
    it('accepts tokens issued before versions existed, until the first revocation', async () => {
        const bob = await registerWithPassword('bob@example.org');
        const legacy = jwt.sign({ userId: bob.user.id, ownerId: bob.user.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });
        expect(await status(legacy)).toBe(200);
        await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${bob.token}`);
        expect(await status(legacy)).toBe(401);
    });

    it('refuses the token of a deleted account', async () => {
        const bob = await registerWithPassword('bob@example.org');
        await query('DELETE FROM users WHERE id = $1', [bob.user.id]);
        expect(await status(bob.token)).toBe(401);
    });

    it('is not touched by signing in again', async () => {
        const bob = await registerWithPassword('bob@example.org');
        await login('bob@example.org');
        expect(await status(bob.token)).toBe(200);
    });
});

describe('events that sign an account out everywhere', () => {
    it('sign out everywhere, this session included', async () => {
        const bob = await registerWithPassword('bob@example.org');
        const other = await login('bob@example.org');
        const response = await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${bob.token}`);
        expect(response.status).toBe(200);
        expect(await status(bob.token)).toBe(401);
        expect(await status(other)).toBe(401);
    });

    it('a completed password reset', async () => {
        const bob = await registerWithPassword('bob@example.org');
        const resetToken = crypto.randomBytes(32).toString('hex');
        await query(
            "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + interval '1 hour')",
            [bob.user.id, crypto.createHash('sha256').update(resetToken).digest('hex')],
        );
        const reset = await request(app).post('/api/auth/password/reset').send({ token: resetToken, password: 'a-new-password-1' });
        expect(reset.status).toBe(200);
        expect(await status(bob.token)).toBe(401);
        expect(await status(await login('bob@example.org', 'a-new-password-1'))).toBe(200);
    });

    it('unlinking SSO: other sessions end, this one gets a fresh token', async () => {
        const bob = await registerWithPassword('bob@example.org');
        await sso({ link: true, token: bob.token });
        const other = await login('bob@example.org');
        const unlink = await request(app).delete('/api/auth/oidc/link').set('Authorization', `Bearer ${bob.token}`);
        expect(unlink.status).toBe(200);
        expect(await status(other)).toBe(401);
        expect(await status(unlink.body.data.token)).toBe(200);
        expect((await me(unlink.body.data.token)).body.data.user.sso_linked).toBe(false);
    });

    it('unlinking is refused when it would leave no way in', async () => {
        const alice = await sso();
        const unlink = await request(app).delete('/api/auth/oidc/link').set('Authorization', `Bearer ${alice.body.data.token}`);
        expect(unlink.status).toBe(409);
        expect(unlink.body.error).toBe('no_other_sign_in');
        expect(await status(alice.body.data.token)).toBe(200);
    });

    it('removal from the family: the member\'s tokens stop reaching the family', async () => {
        const { owner, member } = await family();
        const removed = await request(app).delete(`/api/invites/members/${member.user.id}`).set('Authorization', `Bearer ${owner.token}`);
        expect(removed.status).toBe(200);
        expect(await status(member.token)).toBe(401);
        expect(await status(owner.token)).toBe(200);
    });

    it('leaving the family: other devices end, this one continues on its own', async () => {
        const { owner, member } = await family();
        const otherDevice = await login('member@example.org');
        const left = await request(app).delete('/api/invites/leave').set('Authorization', `Bearer ${member.token}`);
        expect(left.status).toBe(200);
        expect(await status(otherDevice)).toBe(401);
        const fresh = await me(left.body.data.token);
        expect(fresh.status).toBe(200);
        expect(fresh.body.data.user.is_owner).toBe(true);
        expect(await status(owner.token)).toBe(200);
    });

    it('ownership transfer: everyone is signed out, the caller continues with the returned token', async () => {
        const { owner, member } = await family();
        const transfer = await request(app).post('/api/invites/transfer-ownership')
            .set('Authorization', `Bearer ${owner.token}`)
            .send({ newOwnerId: member.user.id });
        expect(transfer.status).toBe(200);
        expect(await status(owner.token)).toBe(401);
        expect(await status(member.token)).toBe(401);
        const fresh = await me(transfer.body.data.token);
        expect(fresh.status).toBe(200);
        expect(fresh.body.data.user.is_owner).toBe(false);
    });

    it('a role change does not sign anyone out', async () => {
        const { owner, member } = await family();
        const changed = await request(app).put(`/api/invites/members/${member.user.id}/role`)
            .set('Authorization', `Bearer ${owner.token}`).send({ role: 'enfant' });
        expect(changed.status).toBe(200);
        expect(await status(member.token)).toBe(200);
    });
});

describe('revokeUserSessions', () => {
    it('closes the account\'s live connections once the change commits', async () => {
        const bob = await registerWithPassword('bob@example.org');
        const socket = { close: vi.fn() };
        clients.set(bob.user.id, new Set([socket as never]));
        await withTransaction((tx) => revokeUserSessions(tx, [bob.user.id], 'test'));
        expect(socket.close).toHaveBeenCalledWith(4001, 'Session revoked');
        clients.delete(bob.user.id);
    });

    it('changes nothing when the surrounding change rolls back', async () => {
        const bob = await registerWithPassword('bob@example.org');
        const socket = { close: vi.fn() };
        clients.set(bob.user.id, new Set([socket as never]));
        await expect(withTransaction(async (tx) => {
            await revokeUserSessions(tx, [bob.user.id], 'test');
            throw new Error('boom');
        })).rejects.toThrow('boom');
        expect(socket.close).not.toHaveBeenCalled();
        expect(await status(bob.token)).toBe(200);
        clients.delete(bob.user.id);
    });
});
