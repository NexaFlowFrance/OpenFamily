import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { query, withTransaction } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { normalizeEmail } from '../lib/normalize';
import { isMailEnabled, sendPasswordResetEmail } from '../lib/mailer';
import { resolveAppBaseUrl } from '../lib/appUrl';
import { parseDisabledModules } from './userSettings';
import { getAuthConfig } from '../config/authConfig';
import { buildAuthPayload } from '../lib/authPayload';
import { revokeUserSessions } from '../lib/authTokens';
import { acceptInviteForNewUser, checkInvite } from '../lib/invites';
import { isAcceptablePassword, MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';

const router = Router();

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
        // Use actualUserId so members see their own profile, not the owner's
        const result = await query(
            `SELECT id, email, name, role, currency, language, week_start_day, avatar_url,
                    (family_owner_id IS NULL) AS is_owner,
                    (password_hash IS NOT NULL) AS has_password,
                    EXISTS (SELECT 1 FROM user_identities WHERE user_id = users.id) AS sso_linked
             FROM users WHERE id = $1`,
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

// Whether anyone can create an account with a password, read by the login page
// of older clients to show or hide "Sign up". Newer clients read /config.
// Invitations work either way (see the register route), so a closed server is
// an invitation-only server.
router.get('/registration', (_req, res) => {
    res.json({ success: true, data: { open: getAuthConfig().passwordSignup } });
});

// Which sign-in and sign-up options the login page should offer. Public and
// free of secrets: it is the first thing an unauthenticated app asks.
router.get('/config', (_req, res) => {
    const config = getAuthConfig();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        success: true,
        data: {
            passwordLogin: config.passwordLogin,
            passwordSignup: config.passwordSignup,
            passwordReset: config.passwordLogin && isMailEnabled(),
            oidc: config.oidc
                ? { enabled: true, name: config.oidc.providerName, signup: config.oidcSignup }
                : { enabled: false, name: null, signup: false },
        },
    });
});

// Register
router.post('/register', async (req, res) => {
    const { email, password, name, inviteToken } = req.body ?? {};
    const hasInvite = typeof inviteToken === 'string' && inviteToken.length > 0;
    const config = getAuthConfig();

    if (!config.passwordLogin) {
        return res.status(403).json({ success: false, error: 'Password sign-in is disabled' });
    }

    // Closed sign-ups (REGISTRATION_ENABLED=false) still let an invited person
    // in: the invitation was created by a parent of the family, is random, dated
    // and may be bound to an e-mail, which is all the authorisation a self-hosted
    // server needs. Without one, the request is refused before any lookup.
    if (!config.passwordSignup && !hasInvite) {
        return res.status(403).json({ success: false, error: 'Registration is disabled' });
    }

    try {
        const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';
        const cleanedName = typeof name === 'string' ? name.trim() : '';

        if (!normalizedEmail || !password || !cleanedName) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        if (!isAcceptablePassword(password)) {
            return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
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
        const inviteCheck = hasInvite ? await checkInvite(query, inviteToken, normalizedEmail) : null;
        if (inviteCheck && !inviteCheck.ok) {
            return inviteCheck.reason === 'wrong_email'
                ? res.status(403).json({ success: false, error: 'Cette invitation est réservée à une autre adresse e-mail' })
                : res.status(400).json({ success: false, error: 'Invitation invalide ou expirée' });
        }
        const invite = inviteCheck?.ok ? inviteCheck.invite : null;

        // The account role is NEVER taken from the client: an invited member gets the
        // role chosen by the inviter; a standalone account owns its family → 'parent'.
        const cleanedRole = invite ? invite.role : 'parent';

        const password_hash = await bcrypt.hash(password, 12);

        const payload = await withTransaction(async (tx) => {
            const created = await tx.query(
                'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
                [normalizedEmail, password_hash, cleanedName, cleanedRole]
            );
            const userId = created.rows[0].id as string;
            if (invite && !(await acceptInviteForNewUser(tx.query, invite, userId))) {
                throw new InviteNoLongerValidError();
            }
            return buildAuthPayload(tx.query, userId);
        });

        res.json({ success: true, data: payload });
    } catch (error) {
        if (error instanceof InviteNoLongerValidError) {
            return res.status(400).json({ success: false, error: 'Invitation invalide ou expirée' });
        }
        console.error('Register error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

class InviteNoLongerValidError extends Error {}

// Login
router.post('/login', async (req, res) => {
    if (!getAuthConfig().passwordLogin) {
        return res.status(403).json({ success: false, error: 'Password sign-in is disabled' });
    }

    try {
        const { email, password } = req.body;
        const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';

        if (!normalizedEmail || !password) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Find user
        const result = await query('SELECT id, password_hash FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
        const user = result.rows[0] as { id: string; password_hash: string | null } | undefined;

        // An account created through single sign-on has no password: it can
        // never be signed into with one, whatever is sent.
        if (!user || !user.password_hash || typeof password !== 'string') {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const payload = await buildAuthPayload(query, user.id);
        if (!payload) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        res.json({ success: true, data: payload });
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
    if (!getAuthConfig().passwordLogin) {
        return res.status(403).json({ success: false, error: 'Password sign-in is disabled' });
    }
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
        // Deliberately not awaited. A hit would otherwise pay a full SMTP round
        // trip while a miss returns after a single SELECT, and that gap is a
        // timing oracle that undoes the generic answer above. deliver() logs and
        // swallows its own failures, so this never rejects.
        void sendPasswordResetEmail({
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
    if (!getAuthConfig().passwordLogin) {
        return res.status(403).json({ success: false, error: 'Password sign-in is disabled' });
    }
    try {
        const { token, password } = req.body as { token?: unknown; password?: unknown };

        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({ success: false, error: 'invalid_or_expired_token' });
        }
        if (!isAcceptablePassword(password)) {
            return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
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
        const applied = await withTransaction(async (tx) => {
            // Claiming the link and changing the password happen together, so a
            // link can only ever be used once.
            const claimed = await tx.query(
                'UPDATE password_resets SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id',
                [reset.id]
            );
            if (claimed.rows.length === 0) return false;
            await tx.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, reset.user_id]);
            // Burn any other outstanding link for this account too.
            await tx.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [reset.user_id]);
            // Whoever knew the old password may still hold a session: end them all.
            await revokeUserSessions(tx, [reset.user_id], 'password_reset');
            return true;
        });
        if (!applied) {
            return res.status(400).json({ success: false, error: 'invalid_or_expired_token' });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Password reset error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Refresh the JWT to reflect the current family membership (e.g. after a join request was approved)
router.post('/refresh', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const payload = await buildAuthPayload(query, req.actualUserId!);
        if (!payload) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        return res.json({ success: true, data: payload });
    } catch (error) {
        console.error('Refresh token error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Sign out of every device, this one included: every token issued so far stops
// working. Signing out of a single device needs no server call (the app just
// forgets its token).
router.post('/logout-all', authMiddleware, async (req: AuthRequest, res) => {
    try {
        await withTransaction((tx) => revokeUserSessions(tx, [req.actualUserId!], 'logout_all'));
        return res.json({ success: true });
    } catch (error) {
        console.error('Logout everywhere error:', error);
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
            'UPDATE users SET currency = $1 WHERE id = $2 RETURNING id, email, name, role, currency, language, week_start_day, avatar_url',
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
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, name, role, currency, language, week_start_day, avatar_url`,
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
