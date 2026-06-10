import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;

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

export default router;
