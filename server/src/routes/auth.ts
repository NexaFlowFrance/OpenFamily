import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth';
import { normalizeEmail } from '../lib/normalize';

const router = Router();

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
        // Use actualUserId so members see their own profile, not the owner's
        const result = await query(
            'SELECT id, email, name, role, currency, (family_owner_id IS NULL) AS is_owner FROM users WHERE id = $1',
            [req.actualUserId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        return res.json({ success: true, data: { user: result.rows[0] } });
    } catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Register
router.post('/register', async (req, res) => {
    if (process.env.REGISTRATION_ENABLED === 'false') {
        return res.status(403).json({ success: false, error: 'Registration is disabled' });
    }

    try {
        const { email, password, name, inviteToken, role } = req.body;
        const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';
        const cleanedName = typeof name === 'string' ? name.trim() : '';
        const cleanedRole = ['parent', 'enfant'].includes(role) ? role : 'parent';

        if (!normalizedEmail || !password || !cleanedName) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        // Check if user exists
        const existingUser = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'User already exists' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 12);

        // Create user
        const result = await query(
            'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, currency',
            [normalizedEmail, password_hash, cleanedName, cleanedRole]
        );

        const user = result.rows[0];
        let ownerId: string = user.id;

        // Process invite token if provided
        if (typeof inviteToken === 'string' && inviteToken.length > 0) {
            const inviteResult = await query(
                `SELECT id, owner_id FROM family_invites
                 WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
                [inviteToken]
            );
            if (inviteResult.rows.length > 0) {
                const invite = inviteResult.rows[0] as { id: string; owner_id: string };
                ownerId = invite.owner_id;
                await query('UPDATE users SET family_owner_id = $1 WHERE id = $2', [invite.owner_id, user.id]);
                await query("UPDATE family_invites SET status = 'accepted' WHERE id = $1", [invite.id]);
            }
        } else {
            // Auto-join: if a family owner already exists, automatically join that family
            const ownerResult = await query(
                'SELECT id FROM users WHERE family_owner_id IS NULL AND id != $1 ORDER BY created_at ASC LIMIT 1',
                [user.id]
            );
            if (ownerResult.rows.length > 0) {
                const existingOwner = ownerResult.rows[0] as { id: string };
                ownerId = existingOwner.id;
                await query('UPDATE users SET family_owner_id = $1 WHERE id = $2', [existingOwner.id, user.id]);
            }
        }

        const token = generateToken(user.id, ownerId);
        const isOwner = ownerId === user.id;

        res.json({ success: true, data: { user: { ...user, is_owner: isOwner, role: user.role, currency: user.currency || 'EUR' }, token } });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';

        if (!normalizedEmail || !password) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Find user
        const result = await query('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Include family ownerId in JWT so all data queries use the correct user scope
        const ownerId: string = user.family_owner_id ?? user.id;
        const token = generateToken(user.id, ownerId);
        const isOwner = !user.family_owner_id;

        res.json({
            success: true,
            data: {
                user: { id: user.id, email: user.email, name: user.name, role: user.role, is_owner: isOwner, currency: user.currency || 'EUR' },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update user currency
router.put('/currency', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { currency } = req.body;

        if (!currency || typeof currency !== 'string' || currency.length !== 3) {
            return res.status(400).json({ success: false, error: 'Invalid currency code' });
        }

        const result = await query(
            'UPDATE users SET currency = $1 WHERE id = $2 RETURNING id, email, name, role, currency',
            [currency.toUpperCase(), req.actualUserId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        return res.json({ success: true, data: { user: result.rows[0] } });
    } catch (error) {
        console.error('Update currency error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
