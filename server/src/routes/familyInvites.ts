import crypto from 'node:crypto';
import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth';

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
