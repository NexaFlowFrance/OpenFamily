import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { query } from '../db';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth';
import { normalizeEmail } from '../lib/normalize';
import { isMailEnabled, sendPasswordResetEmail } from '../lib/mailer';
import { resolveAppBaseUrl } from '../lib/appUrl';
import { parseDisabledModules } from './userSettings';

const router = Router();

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
        // Use actualUserId so members see their own profile, not the owner's
        const result = await query(
            'SELECT id, email, name, role, currency, language, avatar_url, (family_owner_id IS NULL) AS is_owner FROM users WHERE id = $1',
            [req.actualUserId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // disabled_modules is family-wide: always read it from the owner's row.
        const ownerModules = await query('SELECT disabled_modules FROM users WHERE id = $1', [req.userId]);
        const disabled_modules = parseDisabledModules(ownerModules.rows[0]?.disabled_modules);

        return res.json({ success: true, data: { user: { ...result.rows[0], disabled_modules } } });
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
        const { email, password, name, inviteToken } = req.body;
        const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';
        const cleanedName = typeof name === 'string' ? name.trim() : '';

        if (!normalizedEmail || !password || !cleanedName) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        // Check if user exists. Keep the error generic so the endpoint
        // cannot be used to enumerate registered email addresses.
        const existingUser = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Registration failed' });
        }

        // A new account joins an existing family ONLY via an explicit, valid invite token.
        // Validate the invite BEFORE creating the account so an invalid token never leaves an orphan user.
        // Without a token the user becomes their own family owner (standalone account).
        let invite: { id: string; owner_id: string; role: string } | null = null;
        if (typeof inviteToken === 'string' && inviteToken.length > 0) {
            const inviteResult = await query(
                `SELECT id, owner_id, invitee_email, role FROM family_invites
                 WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
                [inviteToken]
            );
            if (inviteResult.rows.length === 0) {
                return res.status(400).json({ success: false, error: 'Invitation invalide ou expirée' });
            }

            const row = inviteResult.rows[0] as { id: string; owner_id: string; invitee_email: string | null; role: string | null };

            // If the invite targets a specific email, enforce it matches the registering account.
            if (row.invitee_email && normalizeEmail(row.invitee_email) !== normalizedEmail) {
                return res.status(403).json({ success: false, error: 'Cette invitation est réservée à une autre adresse e-mail' });
            }

            invite = { id: row.id, owner_id: row.owner_id, role: row.role === 'enfant' ? 'enfant' : 'parent' };
        }

        // The account role is NEVER taken from the client: an invited member gets the
        // role chosen by the inviter; a standalone account owns its family → 'parent'.
        const cleanedRole = invite ? invite.role : 'parent';

        // Hash password
        const password_hash = await bcrypt.hash(password, 12);

        // Create user
        const result = await query(
            'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, currency, language, avatar_url',
            [normalizedEmail, password_hash, cleanedName, cleanedRole]
        );

        const user = result.rows[0];
        let ownerId: string = user.id;

        if (invite) {
            ownerId = invite.owner_id;
            await query('UPDATE users SET family_owner_id = $1 WHERE id = $2', [invite.owner_id, user.id]);
            await query("UPDATE family_invites SET status = 'accepted' WHERE id = $1", [invite.id]);
        }

        const token = generateToken(user.id, ownerId);
        const isOwner = ownerId === user.id;

        // disabled_modules is family-wide: a brand-new owner has none; an invited
        // member inherits the owner's current setting.
        let disabled_modules: string[] = [];
        if (!isOwner) {
            const ownerModules = await query('SELECT disabled_modules FROM users WHERE id = $1', [ownerId]);
            disabled_modules = parseDisabledModules(ownerModules.rows[0]?.disabled_modules);
        }

        res.json({ success: true, data: { user: { ...user, is_owner: isOwner, role: user.role, currency: user.currency || 'EUR', disabled_modules }, token } });
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

        // disabled_modules is family-wide: read it from the owner's row (own row if owner).
        const disabled_modules = isOwner
            ? parseDisabledModules(user.disabled_modules)
            : parseDisabledModules((await query('SELECT disabled_modules FROM users WHERE id = $1', [ownerId])).rows[0]?.disabled_modules);

        res.json({
            success: true,
            data: {
                user: { id: user.id, email: user.email, name: user.name, role: user.role, is_owner: isOwner, currency: user.currency || 'EUR', language: user.language || 'fr', avatar_url: user.avatar_url ?? null, disabled_modules },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ── Password reset (email link) ──────────────────────────────────────────────

// Stricter than the login limiter and WITHOUT skipSuccessfulRequests: forgot
// always answers 200 (anti-enumeration), so successful requests must count or
// the limiter would never engage and the endpoint could be used to spam inboxes.
const passwordResetWindowMs = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10);
const passwordResetRateLimiter = rateLimit({
    windowMs: Number.isNaN(passwordResetWindowMs) ? 900000 : passwordResetWindowMs,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many password reset attempts. Please try again later.'
    }
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const hashResetToken = (token: string): string =>
    crypto.createHash('sha256').update(token).digest('hex');

// Request a reset link. Always answers the same success message whether or not
// the address matches an account, so it cannot be used to enumerate emails.
// Only the token's SHA-256 is stored; the raw token exists only in the email.
router.post('/password/forgot', passwordResetRateLimiter, async (req, res) => {
    try {
        const { email } = req.body as { email?: unknown };
        const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';
        if (!normalizedEmail) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Without SMTP there is nothing we can ever send: say so honestly (this
        // reveals server configuration, not account existence). Self-hosted
        // installs then point the user to their administrator.
        if (!isMailEnabled()) {
            return res.status(501).json({ success: false, error: 'mail_not_configured' });
        }

        const generic = { success: true, message: 'If this address matches an account, a reset email has been sent.' };

        const userResult = await query(
            'SELECT id, email, name, language FROM users WHERE LOWER(email) = $1',
            [normalizedEmail]
        );
        const user = userResult.rows[0] as { id: string; email: string; name: string | null; language: string | null } | undefined;
        if (!user) {
            return res.json(generic);
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        // One outstanding link per account: a new request replaces the old one.
        await query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]);
        await query(
            'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, hashResetToken(token), expiresAt.toISOString()]
        );

        const resetUrl = `${resolveAppBaseUrl(req)}/reset-password?token=${token}`;
        await sendPasswordResetEmail({
            email: user.email,
            name: user.name,
            language: user.language,
            resetUrl,
        });

        return res.json(generic);
    } catch (error) {
        console.error('Password forgot error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Consume a reset link: set the new password and burn the token.
router.post('/password/reset', passwordResetRateLimiter, async (req, res) => {
    try {
        const { token, password } = req.body as { token?: unknown; password?: unknown };

        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({ success: false, error: 'invalid_or_expired_token' });
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const resetResult = await query(
            `SELECT id, user_id FROM password_resets
             WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
            [hashResetToken(token)]
        );
        const reset = resetResult.rows[0] as { id: string; user_id: string } | undefined;
        if (!reset) {
            return res.status(400).json({ success: false, error: 'invalid_or_expired_token' });
        }

        const password_hash = await bcrypt.hash(password, 12);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, reset.user_id]);
        await query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.id]);
        // Burn any other outstanding link for this account too.
        await query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [reset.user_id]);

        return res.json({ success: true });
    } catch (error) {
        console.error('Password reset error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Refresh the JWT to reflect the current family membership (e.g. after a join request was approved)
router.post('/refresh', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT id, email, name, role, currency, language, avatar_url, disabled_modules, family_owner_id FROM users WHERE id = $1',
            [req.actualUserId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const user = result.rows[0];
        const ownerId: string = user.family_owner_id ?? user.id;
        const token = generateToken(user.id, ownerId);
        const isOwner = !user.family_owner_id;

        // disabled_modules is family-wide: read it from the owner's row (own row if owner).
        const disabled_modules = isOwner
            ? parseDisabledModules(user.disabled_modules)
            : parseDisabledModules((await query('SELECT disabled_modules FROM users WHERE id = $1', [ownerId])).rows[0]?.disabled_modules);

        return res.json({
            success: true,
            data: {
                token,
                user: { id: user.id, email: user.email, name: user.name, role: user.role, is_owner: isOwner, currency: user.currency || 'EUR', language: user.language || 'fr', avatar_url: user.avatar_url ?? null, disabled_modules },
            },
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
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
            'UPDATE users SET currency = $1 WHERE id = $2 RETURNING id, email, name, role, currency, language, avatar_url',
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

// Update user profile (display name and/or avatar). The avatar is stored as a
// compact data URL (the client resizes/compresses the image before upload).
router.put('/profile', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { name, avatar_url } = req.body as { name?: unknown; avatar_url?: unknown };

        const fields: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (typeof name === 'string') {
            const cleaned = name.trim();
            if (cleaned.length === 0 || cleaned.length > 255) {
                return res.status(400).json({ success: false, error: 'Invalid name' });
            }
            fields.push(`name = $${idx++}`);
            values.push(cleaned);
        }

        if (avatar_url === null) {
            fields.push(`avatar_url = $${idx++}`);
            values.push(null);
        } else if (typeof avatar_url === 'string') {
            // Accept only data-URL images and cap the size (~1.5 MB of base64).
            if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(avatar_url)) {
                return res.status(400).json({ success: false, error: 'Invalid image format' });
            }
            if (avatar_url.length > 1_500_000) {
                return res.status(400).json({ success: false, error: 'Image trop volumineuse' });
            }
            fields.push(`avatar_url = $${idx++}`);
            values.push(avatar_url);
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, error: 'No changes provided' });
        }

        values.push(req.actualUserId);
        const result = await query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, name, role, currency, language, avatar_url`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        return res.json({ success: true, data: { user: result.rows[0] } });
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
