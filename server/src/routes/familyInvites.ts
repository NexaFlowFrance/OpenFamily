import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query, getClient } from '../db';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';
import { createNotification } from '../lib/notifications';
import { normalizeEmail } from '../lib/normalize';
import { isMailEnabled, sendFamilyInviteEmail } from '../lib/mailer';
import { resolveAppBaseUrl } from '../lib/appUrl';

const router = Router();

// Invite creation can send an email to an arbitrary address, so cap it well
// above family use but low enough to blunt abuse as a spam relay.
const inviteRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many invitations. Please try again later.'
    }
});

// Account roles assignable to family members ('parent' = full access, 'enfant' = read-mostly)
const cleanAccountRole = (value: unknown): 'parent' | 'enfant' =>
    value === 'enfant' ? 'enfant' : 'parent';

// Loose shape check: enough to catch typos before an email is stored/sent,
// without rejecting valid but unusual addresses.
const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

// ── Public endpoint (no auth) ─────────────────────────────────────────────────

// GET /info/:token - get invite preview info for the Join page
router.get('/info/:token', async (req, res) => {
    const { rows } = await query(
        `SELECT fi.id, fi.expires_at, u.name AS owner_name, u.id AS owner_id
         FROM family_invites fi
         JOIN users u ON fi.owner_id = u.id
         WHERE fi.token = $1
           AND fi.status = 'pending'
           AND fi.expires_at > NOW()`,
        [req.params.token]
    );

    if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Invitation invalide ou expirée' });
    }

    const row = rows[0] as { owner_name: string; expires_at: string };
    return res.json({ success: true, data: { ownerName: row.owner_name, expiresAt: row.expires_at } });
});

// ── Authenticated endpoints ───────────────────────────────────────────────────

router.use(authMiddleware);

// GET /members - list all user accounts in this family
router.get('/members', async (req: AuthRequest, res) => {
    const { rows } = await query(
        `SELECT id, name, email, role, (family_owner_id IS NULL) AS is_owner, created_at
         FROM users
         WHERE id = $1
            OR family_owner_id = $1
         ORDER BY created_at ASC`,
        [req.userId]
    );
    return res.json({ success: true, data: rows });
});

// POST / - create an invite link (owner only). When inviteeEmail is provided the
// invitation is ALSO emailed to that address (with the join link), and the invite
// becomes restricted to it at registration time (see auth register).
router.post('/', inviteRateLimiter, async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Seul le propriétaire peut créer des invitations' });
    }

    const { inviteeEmail, expiresInDays = 7, role } = req.body as {
        inviteeEmail?: string;
        expiresInDays?: number;
        role?: string;
    };

    let cleanedInviteeEmail: string | null = null;
    if (typeof inviteeEmail === 'string' && inviteeEmail.trim() !== '') {
        cleanedInviteeEmail = normalizeEmail(inviteeEmail);
        if (!looksLikeEmail(cleanedInviteeEmail)) {
            return res.status(400).json({ success: false, error: 'Adresse e-mail invalide' });
        }
    }

    const days = Math.min(Math.max(Number(expiresInDays) || 7, 1), 30);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const inviteRole = cleanAccountRole(role);

    const { rows } = await query(
        `INSERT INTO family_invites (owner_id, token, invitee_email, expires_at, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, token, invitee_email, status, expires_at, role, created_at`,
        [req.userId, token, cleanedInviteeEmail, expiresAt.toISOString(), inviteRole]
    );

    // Canonical share link, built server-side so the native app never leaks its
    // local shell origin (http://localhost) into a link meant for someone else.
    const inviteUrl = `${resolveAppBaseUrl(req)}/join?invite=${token}`;

    // Email delivery is best-effort: the invite (and its link) exists either way.
    // email_sent: true = handed to SMTP, false = send failed, null = not requested.
    let emailSent: boolean | null = null;
    if (cleanedInviteeEmail) {
        if (!isMailEnabled()) {
            emailSent = false;
        } else {
            const ownerResult = await query('SELECT name, language FROM users WHERE id = $1', [req.userId]);
            const owner = ownerResult.rows[0] as { name: string; language: string | null } | undefined;
            emailSent = await sendFamilyInviteEmail({
                email: cleanedInviteeEmail,
                inviterName: owner?.name || 'Un membre OpenFamily',
                joinUrl: inviteUrl,
                language: owner?.language,
                expiresAt,
            });
        }
    }

    return res.json({ success: true, data: { ...rows[0], invite_url: inviteUrl, email_sent: emailSent } });
});

// GET / - list pending invites (owner only)
router.get('/', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Accès réservé au propriétaire' });
    }

    const { rows } = await query(
        `SELECT id, token, invitee_email, status, expires_at, role, created_at
         FROM family_invites
         WHERE owner_id = $1
           AND status = 'pending'
           AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [req.userId]
    );

    return res.json({ success: true, data: rows });
});

// POST /join - already-logged-in user joins using an invite token (returns new JWT)
router.post('/join', async (req: AuthRequest, res) => {
    const { token } = req.body as { token?: string };

    if (!token) {
        return res.status(400).json({ success: false, error: 'Token requis' });
    }

    const inviteResult = await query(
        `SELECT id, owner_id, role FROM family_invites
         WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
        [token]
    );

    if (inviteResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Invitation invalide ou expirée' });
    }

    const invite = inviteResult.rows[0] as { id: string; owner_id: string; role: string | null };

    if (invite.owner_id === req.actualUserId) {
        return res.status(400).json({ success: false, error: 'Vous êtes déjà propriétaire de cette famille' });
    }

    // Same rule as POST /requests: an owner who still has members attached
    // cannot join another family (their members would be orphaned).
    const ownMembers = await query('SELECT 1 FROM users WHERE family_owner_id = $1 LIMIT 1', [req.actualUserId]);
    if (ownMembers.rows.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Retirez d\'abord les comptes rattachés au vôtre avant de rejoindre une autre famille',
        });
    }

    // Update family membership; the account role is set from the invite (chosen by the inviter)
    await query(
        'UPDATE users SET family_owner_id = $1, role = $2 WHERE id = $3',
        [invite.owner_id, cleanAccountRole(invite.role), req.actualUserId]
    );
    await query("UPDATE family_invites SET status = 'accepted' WHERE id = $1", [invite.id]);

    const userResult = await query('SELECT name, email FROM users WHERE id = $1', [req.actualUserId]);
    const user = userResult.rows[0] as { name: string; email: string };

    const newToken = generateToken(req.actualUserId!, invite.owner_id);

    return res.json({
        success: true,
        data: {
            token: newToken,
            user: { id: req.actualUserId, name: user.name, email: user.email, is_owner: false },
        },
    });
});

// DELETE /leave - member leaves the family (returns new standalone JWT)
router.delete('/leave', async (req: AuthRequest, res) => {
    if (req.isOwner) {
        return res.status(400).json({
            success: false,
            error: 'Le propriétaire ne peut pas quitter sa propre famille',
        });
    }

    await query('UPDATE users SET family_owner_id = NULL WHERE id = $1', [req.actualUserId]);

    const userResult = await query('SELECT name, email FROM users WHERE id = $1', [req.actualUserId]);
    const user = userResult.rows[0] as { name: string; email: string };

    const newToken = generateToken(req.actualUserId!, req.actualUserId!);

    return res.json({
        success: true,
        data: {
            token: newToken,
            user: { id: req.actualUserId, name: user.name, email: user.email, is_owner: true },
        },
    });
});

// DELETE /:id - revoke a pending invite (owner only)
router.delete('/members/:userId', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Accès réservé au propriétaire' });
    }

    const memberCheck = await query(
        'SELECT id FROM users WHERE id = $1 AND family_owner_id = $2',
        [req.params.userId, req.userId]
    );

    if (memberCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Membre introuvable' });
    }

    // Defence in depth: re-scope the mutation itself so it can never detach a
    // user who is not (or no longer) a member of this owner's family.
    await query(
        'UPDATE users SET family_owner_id = NULL WHERE id = $1 AND family_owner_id = $2',
        [req.params.userId, req.userId]
    );
    return res.json({ success: true });
});

// PUT /members/:userId/role - owner changes a member's account role (parent / enfant)
router.put('/members/:userId/role', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Accès réservé au propriétaire' });
    }

    const role = (req.body as { role?: string } | undefined)?.role;
    if (role !== 'parent' && role !== 'enfant') {
        return res.status(400).json({ success: false, error: 'Rôle invalide' });
    }

    // The owner cannot change their own role (they always have full rights).
    if (req.params.userId === req.actualUserId) {
        return res.status(400).json({ success: false, error: 'Le propriétaire ne peut pas modifier son propre rôle' });
    }

    // The target must be a member of the owner's family.
    const { rows } = await query(
        'UPDATE users SET role = $1 WHERE id = $2 AND family_owner_id = $3 RETURNING id, role',
        [role, req.params.userId, req.userId]
    );
    if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Membre introuvable' });
    }

    broadcast(req.userId!, { type: 'update', entity: 'family', action: 'updated' });
    return res.json({ success: true, data: rows[0] });
});

// Family-scoped tables whose user_id points to the family owner.
const FAMILY_SCOPED_TABLES = [
    'family_members',
    'shopping_items',
    'shopping_list_templates',
    'tasks',
    'appointments',
    'schedule_entries',
    'recipes',
    'meal_plans',
    'budget_entries',
    'budget_limits',
    'recurring_expenses',
    'recurring_expense_logs',
    'reward_transactions',
    'reward_settings',
    'reward_goals',
] as const;

// POST /transfer-ownership - owner hands the family (and all its data) to a member
router.post('/transfer-ownership', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Seul le propriétaire peut transférer la famille' });
    }

    const newOwnerId = typeof req.body?.newOwnerId === 'string' ? req.body.newOwnerId : '';
    if (!newOwnerId) {
        return res.status(400).json({ success: false, error: 'newOwnerId requis' });
    }
    if (newOwnerId === req.userId) {
        return res.status(400).json({ success: false, error: 'Vous êtes déjà propriétaire' });
    }

    // The target must currently be a member of this family.
    const memberCheck = await query(
        'SELECT id FROM users WHERE id = $1 AND family_owner_id = $2',
        [newOwnerId, req.userId]
    );
    if (memberCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Membre introuvable dans votre famille' });
    }

    const oldOwnerId = req.userId!;
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Re-key every family-scoped table from the old owner to the new owner.
        // The new owner's pre-join standalone rows (if any) are orphaned and inaccessible,
        // so we drop them first to avoid unique-constraint clashes.
        for (const table of FAMILY_SCOPED_TABLES) {
            await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [newOwnerId]);
            await client.query(`UPDATE ${table} SET user_id = $1 WHERE user_id = $2`, [newOwnerId, oldOwnerId]);
        }

        // Swap ownership pointers.
        await client.query('UPDATE users SET family_owner_id = NULL WHERE id = $1', [newOwnerId]);
        await client.query(
            'UPDATE users SET family_owner_id = $1 WHERE family_owner_id = $2 AND id <> $1',
            [newOwnerId, oldOwnerId]
        );
        await client.query('UPDATE users SET family_owner_id = $1 WHERE id = $2', [newOwnerId, oldOwnerId]);

        // Move invites and pending requests to the new owner.
        await client.query('UPDATE family_invites SET owner_id = $1 WHERE owner_id = $2', [newOwnerId, oldOwnerId]);
        await client.query('UPDATE family_join_requests SET owner_id = $1 WHERE owner_id = $2', [newOwnerId, oldOwnerId]);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, error: 'Le transfert a échoué' });
    } finally {
        client.release();
    }

    // Refresh the (former) owner's JWT - they are now a regular member.
    const newToken = generateToken(oldOwnerId, newOwnerId);
    const userResult = await query('SELECT name, email, role, currency FROM users WHERE id = $1', [oldOwnerId]);
    const user = userResult.rows[0] as { name: string; email: string; role: string; currency: string };

    broadcast(newOwnerId, { type: 'update', entity: 'family', action: 'updated' });
    broadcast(oldOwnerId, { type: 'update', entity: 'family', action: 'updated' });
    await createNotification({
        userId: newOwnerId,
        title: '👑 Vous êtes propriétaire',
        message: 'La propriété de la famille vous a été transférée.',
        type: 'family_ownership_transferred',
        url: '/family',
    });

    return res.json({
        success: true,
        data: {
            token: newToken,
            user: {
                id: oldOwnerId,
                name: user.name,
                email: user.email,
                role: user.role,
                is_owner: false,
                currency: user.currency || 'EUR',
            },
        },
    });
});

// ── Join requests (ask an owner for access) ───────────────────────────────────

// POST /requests - a standalone user asks to join a family identified by the owner's email
router.post('/requests', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(400).json({ success: false, error: 'Vous faites déjà partie d\'une famille' });
    }

    const ownerEmail = typeof req.body?.ownerEmail === 'string' ? normalizeEmail(req.body.ownerEmail) : '';
    if (!ownerEmail) {
        return res.status(400).json({ success: false, error: 'Adresse e-mail requise' });
    }

    // Requester-side checks first, so the response never depends on whether the
    // target email exists (anti-enumeration): block if the requester already has
    // members attached to them (joining would orphan them).
    const ownMembers = await query('SELECT 1 FROM users WHERE family_owner_id = $1 LIMIT 1', [req.actualUserId]);
    if (ownMembers.rows.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Retirez d\'abord les comptes rattachés au vôtre avant de rejoindre une autre famille',
        });
    }

    // Generic response whether or not the email matches a family owner, so this
    // endpoint cannot be used to enumerate registered email addresses.
    const genericResponse = {
        success: true,
        message: 'Si cette adresse correspond à une famille, une demande a été envoyée.',
    };

    // The target must be an existing family owner (standalone account, not a member
    // of another family). If not found - or if it's the requester's own address -
    // no request is created but the response stays identical.
    const ownerResult = await query(
        'SELECT id FROM users WHERE LOWER(email) = $1 AND family_owner_id IS NULL',
        [ownerEmail]
    );
    if (ownerResult.rows.length === 0) {
        return res.json(genericResponse);
    }

    const ownerId = (ownerResult.rows[0] as { id: string }).id;
    if (ownerId === req.actualUserId) {
        return res.json(genericResponse);
    }

    // Only one pending request at a time per requester
    await query("DELETE FROM family_join_requests WHERE requester_id = $1 AND status = 'pending'", [req.actualUserId]);
    await query(
        'INSERT INTO family_join_requests (owner_id, requester_id) VALUES ($1, $2)',
        [ownerId, req.actualUserId]
    );

    const requesterRes = await query('SELECT name, email FROM users WHERE id = $1', [req.actualUserId]);
    const requester = requesterRes.rows[0] as { name: string; email: string };

    broadcast(ownerId, { type: 'update', entity: 'family', action: 'created' });
    await createNotification({
        userId: ownerId,
        title: '👪 Nouvelle demande d\'accès',
        message: `${requester.name} (${requester.email}) souhaite rejoindre votre famille.`,
        type: 'family_join_request',
        url: '/family',
    });

    return res.json(genericResponse);
});

// GET /requests/mine - the requester checks the status of their own latest request
router.get('/requests/mine', async (req: AuthRequest, res) => {
    const { rows } = await query(
        `SELECT jr.id, jr.status, jr.created_at, u.name AS owner_name, u.email AS owner_email
         FROM family_join_requests jr
         JOIN users u ON jr.owner_id = u.id
         WHERE jr.requester_id = $1
         ORDER BY jr.created_at DESC
         LIMIT 1`,
        [req.actualUserId]
    );
    return res.json({ success: true, data: rows[0] ?? null });
});

// DELETE /requests/mine - the requester cancels their own pending request
router.delete('/requests/mine', async (req: AuthRequest, res) => {
    await query(
        "UPDATE family_join_requests SET status = 'cancelled', responded_at = NOW() WHERE requester_id = $1 AND status = 'pending'",
        [req.actualUserId]
    );
    return res.json({ success: true });
});

// GET /requests - owner lists pending requests addressed to their family
router.get('/requests', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Accès réservé au propriétaire' });
    }

    const { rows } = await query(
        `SELECT jr.id, jr.created_at, u.id AS requester_id, u.name AS requester_name, u.email AS requester_email
         FROM family_join_requests jr
         JOIN users u ON jr.requester_id = u.id
         WHERE jr.owner_id = $1 AND jr.status = 'pending'
         ORDER BY jr.created_at ASC`,
        [req.userId]
    );
    return res.json({ success: true, data: rows });
});

// POST /requests/:id/approve - owner approves a pending request
router.post('/requests/:id/approve', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Accès réservé au propriétaire' });
    }

    const requestResult = await query(
        "SELECT id, requester_id FROM family_join_requests WHERE id = $1 AND owner_id = $2 AND status = 'pending'",
        [req.params.id, req.userId]
    );
    if (requestResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Demande introuvable' });
    }

    const request = requestResult.rows[0] as { id: string; requester_id: string };

    // Guard: requester must still be a standalone owner
    const requesterCheck = await query(
        'SELECT id FROM users WHERE id = $1 AND family_owner_id IS NULL',
        [request.requester_id]
    );
    if (requesterCheck.rows.length === 0) {
        await query("UPDATE family_join_requests SET status = 'cancelled', responded_at = NOW() WHERE id = $1", [request.id]);
        return res.status(409).json({ success: false, error: 'Ce compte fait déjà partie d\'une famille' });
    }

    // The approver picks the new member's role (defaults to 'parent')
    const memberRole = cleanAccountRole((req.body as { role?: string } | undefined)?.role);
    await query(
        'UPDATE users SET family_owner_id = $1, role = $2 WHERE id = $3',
        [req.userId, memberRole, request.requester_id]
    );
    await query("UPDATE family_join_requests SET status = 'approved', responded_at = NOW() WHERE id = $1", [request.id]);

    // Notify both sides so their UI refreshes
    broadcast(request.requester_id, { type: 'update', entity: 'family', action: 'updated' });
    broadcast(req.userId!, { type: 'update', entity: 'family', action: 'updated' });
    await createNotification({
        userId: request.requester_id,
        title: '✅ Demande acceptée',
        message: 'Votre demande d\'accès à la famille a été acceptée.',
        type: 'family_join_approved',
        url: '/family',
    });

    return res.json({ success: true });
});

// POST /requests/:id/reject - owner rejects a pending request
router.post('/requests/:id/reject', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Accès réservé au propriétaire' });
    }

    const requestResult = await query(
        "SELECT id, requester_id FROM family_join_requests WHERE id = $1 AND owner_id = $2 AND status = 'pending'",
        [req.params.id, req.userId]
    );
    if (requestResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Demande introuvable' });
    }

    const request = requestResult.rows[0] as { id: string; requester_id: string };
    await query("UPDATE family_join_requests SET status = 'rejected', responded_at = NOW() WHERE id = $1", [request.id]);

    broadcast(request.requester_id, { type: 'update', entity: 'family', action: 'updated' });
    await createNotification({
        userId: request.requester_id,
        title: 'Demande refusée',
        message: 'Votre demande d\'accès à la famille a été refusée.',
        type: 'family_join_rejected',
        url: '/family',
    });

    return res.json({ success: true });
});

// DELETE /:id - revoke invite (owner only) - after /members/:userId to avoid conflict
router.delete('/:id', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Accès réservé au propriétaire' });
    }

    await query(
        "UPDATE family_invites SET status = 'revoked' WHERE id = $1 AND owner_id = $2",
        [req.params.id, req.userId]
    );

    return res.json({ success: true });
});

export default router;
