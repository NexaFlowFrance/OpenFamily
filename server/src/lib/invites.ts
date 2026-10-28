import { QueryFn } from '../db';
import { normalizeEmail } from './normalize';

export interface PendingInvite {
    id: string;
    ownerId: string;
    role: 'parent' | 'enfant';
}

export type InviteCheck =
    | { ok: true; invite: PendingInvite }
    | { ok: false; reason: 'invalid' | 'wrong_email' };

/**
 * Validates an invitation for a new account with the given (normalized) email.
 * The invite decides the family and the role; nothing the client sends does.
 */
export const checkInvite = async (db: QueryFn, token: string, email: string): Promise<InviteCheck> => {
    const result = await db(
        `SELECT id, owner_id, invitee_email, role FROM family_invites
         WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
        [token],
    );
    const row = result.rows[0] as
        | { id: string; owner_id: string; invitee_email: string | null; role: string | null }
        | undefined;
    if (!row) return { ok: false, reason: 'invalid' };

    // An invite addressed to a specific email can only be used by that address.
    if (row.invitee_email && normalizeEmail(row.invitee_email) !== email) {
        return { ok: false, reason: 'wrong_email' };
    }

    return { ok: true, invite: { id: row.id, ownerId: row.owner_id, role: row.role === 'enfant' ? 'enfant' : 'parent' } };
};

/**
 * Attaches a freshly created account to the inviting family and marks the
 * invite used. The owner's row is locked first, so a concurrent ownership
 * transfer cannot leave the new member pointing at a former owner.
 * Returns false when the inviter is no longer a family owner or the invite was
 * used in the meantime; the caller then rolls back.
 */
export const acceptInviteForNewUser = async (db: QueryFn, invite: PendingInvite, userId: string): Promise<boolean> => {
    const owner = await db(
        'SELECT id FROM users WHERE id = $1 AND family_owner_id IS NULL FOR UPDATE',
        [invite.ownerId],
    );
    if (owner.rows.length === 0) return false;

    const claimed = await db(
        "UPDATE family_invites SET status = 'accepted' WHERE id = $1 AND status = 'pending' RETURNING id",
        [invite.id],
    );
    if (claimed.rows.length === 0) return false;

    await db('UPDATE users SET family_owner_id = $1 WHERE id = $2', [invite.ownerId, userId]);
    return true;
};
