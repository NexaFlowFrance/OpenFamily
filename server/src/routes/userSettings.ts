import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';

const router = Router();

const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;

// Single source of truth for the optional modules a family may hide.
// Always-on modules (dashboard, shopping, tasks, calendar, family, settings)
// are deliberately NOT in this list and can never be disabled.
export const TOGGLEABLE_MODULES = [
    'budget',
    'rewards',
    'meals',
    'recipes',
    'planning',
    'integrations',
    'kiosk',
    'notes',
    'ai',
] as const;

// Parse the JSON text stored in users.disabled_modules into a clean string array.
// Tolerates legacy/empty values so existing accounts never break.
export const parseDisabledModules = (raw: unknown): string[] => {
    if (typeof raw !== 'string' || raw.trim() === '') return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (v): v is string => typeof v === 'string' && (TOGGLEABLE_MODULES as readonly string[]).includes(v)
        );
    } catch {
        return [];
    }
};

// Update the authenticated user's preferred language (used for the UI and for
// server-generated notifications such as appointment reminders).
// PUT /api/auth/language — body: { "language": "fr" | "en" }
router.put('/language', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { language } = req.body as { language?: unknown };

        if (typeof language !== 'string' || !SUPPORTED_LANGUAGES.includes(language as typeof SUPPORTED_LANGUAGES[number])) {
            return res.status(400).json({ success: false, error: 'Invalid language. Supported values: fr, en' });
        }

        // actualUserId: the preference belongs to the logged-in member, not the family owner.
        const result = await query(
            'UPDATE users SET language = $1 WHERE id = $2 RETURNING id, email, name, role, currency, language, avatar_url',
            [language, req.actualUserId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        return res.json({ success: true, data: { user: result.rows[0] } });
    } catch (error) {
        console.error('Update language error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Read the family's optional-modules setting. Any member sees the same effective
// value, which lives on the family owner's row (req.userId is the owner id).
// GET /api/auth/modules → { disabled_modules: string[] }
router.get('/modules', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const result = await query('SELECT disabled_modules FROM users WHERE id = $1', [req.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        return res.json({
            success: true,
            data: { disabled_modules: parseDisabledModules(result.rows[0].disabled_modules) },
        });
    } catch (error) {
        console.error('Get modules error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update the family's optional-modules setting (parents only). The value is
// family-wide and stored on the owner's row.
// PUT /api/auth/modules — body: { disabled_modules: string[] }
router.put('/modules', authMiddleware, requireParent, async (req: AuthRequest, res) => {
    try {
        const { disabled_modules } = req.body as { disabled_modules?: unknown };

        if (!Array.isArray(disabled_modules)) {
            return res.status(400).json({ success: false, error: 'disabled_modules must be an array' });
        }

        const allowed = TOGGLEABLE_MODULES as readonly string[];
        for (const key of disabled_modules) {
            if (typeof key !== 'string' || !allowed.includes(key)) {
                return res.status(400).json({ success: false, error: `Invalid module key: ${String(key)}` });
            }
        }

        // Dedupe and store as JSON text on the owner's row.
        const cleaned = Array.from(new Set(disabled_modules as string[]));
        const result = await query(
            'UPDATE users SET disabled_modules = $1 WHERE id = $2 RETURNING disabled_modules',
            [JSON.stringify(cleaned), req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        return res.json({
            success: true,
            data: { disabled_modules: parseDisabledModules(result.rows[0].disabled_modules) },
        });
    } catch (error) {
        console.error('Update modules error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
