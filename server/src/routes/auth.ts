import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db';
import {
    authMiddleware,
    AuthRequest,
    setAuthCookies,
    clearAuthCookies,
    extractRefreshToken,
    verifyToken,
} from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
    changePasswordBodySchema,
    loginBodySchema,
    registerBodySchema,
    updateCurrencyBodySchema,
    updateEmailPreferencesBodySchema,
    updateLocationBodySchema,
} from '../schemas/auth';
import { normalizeEmail } from '../lib/normalize';
import { geocodeCity } from '../weather/WeatherService';
import { WeatherError } from '../weather/errors';
import logger from '../lib/logger';

// Columns returned to the client across /me, /login, /register, PATCH /me/*.
// Centralising the projection avoids drift between endpoints.
const USER_PUBLIC_COLUMNS =
    'id, email, name, currency, city, country_code, latitude, longitude, ' +
    'email_notifications_enabled, email_digest_mode, family_owner_id, must_change_password';

// The list of supported currencies now lives in schemas/auth.ts as a zod
// enum (single source of truth) and remains synchronized with
// shared/src/constants.ts SUPPORTED_CURRENCIES.

const router = Router();

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const result = await query(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`, [
            req.accountId,
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        return res.json({ success: true, data: { user: result.rows[0] } });
    } catch (error) {
        logger.error('auth.get_current_user_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update the authenticated user's preferred currency.
router.patch(
    '/me/currency',
    authMiddleware,
    validate({ body: updateCurrencyBodySchema }),
    async (req: AuthRequest, res) => {
        try {
            const { currency } = req.body;

            const result = await query(
                `UPDATE users SET currency = $1 WHERE id = $2 RETURNING ${USER_PUBLIC_COLUMNS}`,
                [currency, req.accountId],
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            return res.json({ success: true, data: { user: result.rows[0] } });
        } catch (error) {
            logger.error('auth.update_currency_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },
);

// Update the authenticated user's saved location. The client sends a free-text
// city; we geocode it via Open-Meteo and persist city + country + lat/lon.
// Returning the full user lets the client refresh its AuthContext atomically.
router.patch(
    '/me/location',
    authMiddleware,
    validate({ body: updateLocationBodySchema }),
    async (req: AuthRequest, res) => {
        try {
            const { city } = req.body as { city: string };
            const geocoded = await geocodeCity(city);
            const result = await query(
                `UPDATE users
                 SET city = $1, country_code = $2, latitude = $3, longitude = $4
                 WHERE id = $5
                 RETURNING ${USER_PUBLIC_COLUMNS}`,
                [
                    geocoded.city,
                    geocoded.country_code,
                    geocoded.latitude,
                    geocoded.longitude,
                    req.accountId,
                ],
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            return res.json({ success: true, data: { user: result.rows[0] } });
        } catch (error) {
            if (error instanceof WeatherError) {
                logger.warn('auth.update_location_failed', {
                    code: error.code,
                    message: error.message,
                });
                return res.status(error.status).json({ success: false, error: error.toJSON() });
            }
            logger.error('auth.update_location_unexpected', {
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },
);

// Update email-notification preferences. Two switches:
//   - enabled:    master kill switch
//   - digestMode: 'immediate' (one email per notif) or 'daily' (8h recap)
// We always persist both so the user can toggle the master back on without
// losing their previously chosen mode.
router.patch(
    '/me/email-preferences',
    authMiddleware,
    validate({ body: updateEmailPreferencesBodySchema }),
    async (req: AuthRequest, res) => {
        try {
            const { enabled, digestMode } = req.body as {
                enabled: boolean;
                digestMode: 'immediate' | 'daily';
            };
            const result = await query(
                `UPDATE users
                 SET email_notifications_enabled = $1, email_digest_mode = $2
                 WHERE id = $3
                 RETURNING ${USER_PUBLIC_COLUMNS}`,
                [enabled, digestMode, req.accountId],
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            return res.json({ success: true, data: { user: result.rows[0] } });
        } catch (error) {
            logger.error('auth.update_email_preferences_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },
);

// Register
router.post('/register', validate({ body: registerBodySchema }), async (req, res) => {
    if (process.env.REGISTRATION_ENABLED === 'false') {
        return res.status(403).json({ success: false, error: 'Registration is disabled' });
    }

    try {
        // Body shape and basic constraints (length, email format) are already
        // enforced by the zod schema; we only re-normalize the email for
        // case-insensitive lookups.
        const { email, password, name } = req.body;
        const normalizedEmail = normalizeEmail(email);

        // Check if user exists
        const existingUser = await query('SELECT id FROM users WHERE LOWER(email) = $1', [
            normalizedEmail,
        ]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'User already exists' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Create user. `currency` and location columns are left NULL so the
        // client prompts on first login (currency dialog) and the dashboard
        // widget shows its empty state until a city is set.
        const result = await query(
            `INSERT INTO users (email, password_hash, name)
             VALUES ($1, $2, $3)
             RETURNING ${USER_PUBLIC_COLUMNS}`,
            [normalizedEmail, password_hash, name],
        );

        const user = result.rows[0];
        setAuthCookies(res, user.id);

        // We intentionally do NOT return the JWT in the body anymore — the
        // tokens live in httpOnly cookies so they can never be exfiltrated by
        // JavaScript (XSS). The client gets only non-sensitive user info.
        res.json({ success: true, data: { user } });
    } catch (error) {
        logger.error('auth.register_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Login
router.post('/login', validate({ body: loginBodySchema }), async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);

        // Find user
        const result = await query('SELECT * FROM users WHERE LOWER(email) = $1', [
            normalizedEmail,
        ]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        setAuthCookies(res, user.id);

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    currency: user.currency ?? null,
                    city: user.city ?? null,
                    country_code: user.country_code ?? null,
                    latitude: user.latitude ?? null,
                    longitude: user.longitude ?? null,
                    email_notifications_enabled: user.email_notifications_enabled ?? true,
                    email_digest_mode: user.email_digest_mode ?? 'immediate',
                    family_owner_id: user.family_owner_id ?? null,
                    must_change_password: user.must_change_password ?? false,
                },
            },
        });
    } catch (error) {
        logger.error('auth.login_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Change the authenticated account's password. Used both for a normal password
// change and for the forced change after a member's first login with the
// temporary password emailed to them (clears must_change_password).
router.post(
    '/change-password',
    authMiddleware,
    validate({ body: changePasswordBodySchema }),
    async (req: AuthRequest, res) => {
        try {
            const { currentPassword, newPassword } = req.body as {
                currentPassword: string;
                newPassword: string;
            };

            // Operate on the logged-in account (accountId), never the family scope.
            const result = await query('SELECT password_hash FROM users WHERE id = $1', [
                req.accountId,
            ]);
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
            if (!isValid) {
                return res
                    .status(400)
                    .json({ success: false, error: 'Current password is incorrect' });
            }

            const password_hash = await bcrypt.hash(newPassword, 10);
            await query(
                'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
                [password_hash, req.accountId],
            );

            return res.json({ success: true });
        } catch (error) {
            logger.error('auth.change_password_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },
);

// Issue a fresh access (and refresh) token from a valid refresh cookie.
// Returns 401 if the refresh cookie is missing, invalid, expired, or has the
// wrong `kind` — the client should then send the user back to login.
router.post('/refresh', async (req, res) => {
    try {
        const token = extractRefreshToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'No refresh token' });
        }

        const payload = verifyToken(token, 'refresh');
        // Confirm the user still exists before rotating the session — covers
        // the case where the account was deleted while a refresh token was
        // still in circulation.
        const result = await query('SELECT id FROM users WHERE id = $1', [payload.userId]);
        if (result.rows.length === 0) {
            clearAuthCookies(res);
            return res.status(401).json({ success: false, error: 'User no longer exists' });
        }

        setAuthCookies(res, payload.userId);
        res.json({ success: true });
    } catch {
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }
});

// Clear auth cookies. Always returns 200 — logout should be idempotent and
// safe to call even when the user has no session.
router.post('/logout', (_req, res) => {
    clearAuthCookies(res);
    res.json({ success: true });
});

export default router;
