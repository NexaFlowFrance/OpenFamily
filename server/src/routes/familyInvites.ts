import crypto from 'node:crypto';
import { Router } from 'express';
import { query, getClient } from '../db';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';
import { createNotification } from '../lib/notifications';
import { normalizeEmail } from '../lib/normalize';

const router = Router();

// ── Public endpoint (no auth) ─────────────────────────────────────────────────

// GET /info/:token — get invite preview info for the Join page
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

// GET /members — list all user accounts in this family
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

// POST / — create an invite link (owner only)
router.post('/', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Seul le propriétaire peut créer des invitations' });
    }

    const { inviteeEmail, expiresInDays = 7 } = req.body as {
        inviteeEmail?: string;
        expiresInDays?: number;
    };

    const days = Math.min(Math.max(Number(expiresInDays) || 7, 1), 30);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const { rows } = await query(
        `INSERT INTO family_invites (owner_id, token, invitee_email, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, token, invitee_email, status, expires_at, created_at`,
        [req.userId, token, inviteeEmail ?? null, expiresAt.toISOString()]
    );

    return res.json({ success: true, data: rows[0] });
});

// GET / — list pending invites (owner only)
router.get('/', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(403).json({ success: false, error: 'Accès réservé au propriétaire' });
    }

    const { rows } = await query(
        `SELECT id, token, invitee_email, status, expires_at, created_at
         FROM family_invites
         WHERE owner_id = $1
           AND status = 'pending'
           AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [req.userId]
    );

    return res.json({ success: true, data: rows });
});

// POST /join — already-logged-in user joins using an invite token (returns new JWT)
router.post('/join', async (req: AuthRequest, res) => {
    const { token } = req.body as { token?: string };

    if (!token) {
        return res.status(400).json({ success: false, error: 'Token requis' });
    }

    const inviteResult = await query(
        `SELECT id, owner_id FROM family_invites
         WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
        [token]
    );

    if (inviteResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Invitation invalide ou expirée' });
    }

    const invite = inviteResult.rows[0] as { id: string; owner_id: string };

    if (invite.owner_id === req.actualUserId) {
        return res.status(400).json({ success: false, error: 'Vous êtes déjà propriétaire de cette famille' });
    }

    // Update family membership
    await query('UPDATE users SET family_owner_id = $1 WHERE id = $2', [invite.owner_id, req.actualUserId]);
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

// DELETE /leave — member leaves the family (returns new standalone JWT)
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

// DELETE /:id — revoke a pending invite (owner only)
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

    await query('UPDATE users SET family_owner_id = NULL WHERE id = $1', [req.params.userId]);
    return res.json({ success: true });
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
] as const;

// POST /transfer-ownership — owner hands the family (and all its data) to a member
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

    // Refresh the (former) owner's JWT — they are now a regular member.
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

// POST /requests — a standalone user asks to join a family identified by the owner's email
router.post('/requests', async (req: AuthRequest, res) => {
    if (!req.isOwner) {
        return res.status(400).json({ success: false, error: 'Vous faites déjà partie d\'une famille' });
    }

    const ownerEmail = typeof req.body?.ownerEmail === 'string' ? normalizeEmail(req.body.ownerEmail) : '';
    if (!ownerEmail) {
        return res.status(400).json({ success: false, error: 'Adresse e-mail requise' });
    }

    // The target must be an existing family owner (standalone account, not a member of another family)
    const ownerResult = await query(
        'SELECT id FROM users WHERE LOWER(email) = $1 AND family_owner_id IS NULL',
        [ownerEmail]
    );
    if (ownerResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Aucune famille trouvée pour cette adresse e-mail' });
    }

    const ownerId = (ownerResult.rows[0] as { id: string }).id;
    if (ownerId === req.actualUserId) {
        return res.status(400).json({ success: false, error: 'Vous ne pouvez pas rejoindre votre propre famille' });
    }

    // Block if the requester already has members attached to them (joining would orphan them)
    const ownMembers = await query('SELECT 1 FROM users WHERE family_owner_id = $1 LIMIT 1', [req.actualUserId]);
    if (ownMembers.rows.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Retirez d\'abord les comptes rattachés au vôtre avant de rejoindre une autre famille',
        });
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

    return res.json({ success: true });
});

// GET /requests/mine — the requester checks the status of their own latest request
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

// DELETE /requests/mine — the requester cancels their own pending request
router.delete('/requests/mine', async (req: AuthRequest, res) => {
    await query(
        "UPDATE family_join_requests SET status = 'cancelled', responded_at = NOW() WHERE requester_id = $1 AND status = 'pending'",
        [req.actualUserId]
    );
    return res.json({ success: true });
});

// GET /requests — owner lists pending requests addressed to their family
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

// POST /requests/:id/approve — owner approves a pending request
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

    await query('UPDATE users SET family_owner_id = $1 WHERE id = $2', [req.userId, request.requester_id]);
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

// POST /requests/:id/reject — owner rejects a pending request
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

// DELETE /:id — revoke invite (owner only) — after /members/:userId to avoid conflict
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
