import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { vapidPublicKey } from '../lib/pushService';

const router = Router();

// Public: no auth needed — client fetches this before registering SW
router.get('/vapid-public-key', (_req, res) => {
    res.json({ success: true, data: vapidPublicKey });
});

// All other routes require authentication
router.use(authMiddleware);

// POST /subscribe — register a push subscription from the browser
router.post('/subscribe', async (req: AuthRequest, res) => {
    const { endpoint, keys } = req.body as {
        endpoint?: string;
        keys?: { auth?: string; p256dh?: string };
    };

    if (!endpoint || !keys?.auth || !keys?.p256dh) {
        return res.status(400).json({ success: false, error: 'Invalid subscription data' });
    }

    await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, keys)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, endpoint) DO UPDATE SET keys = EXCLUDED.keys`,
        [req.userId, endpoint, JSON.stringify({ auth: keys.auth, p256dh: keys.p256dh })]
    );

    return res.json({ success: true });
});

// DELETE /subscribe?endpoint=... — remove a specific subscription
router.delete('/subscribe', async (req: AuthRequest, res) => {
    const endpoint = req.query.endpoint as string | undefined;

    if (endpoint) {
        await query(
            'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
            [req.userId, endpoint]
        );
    } else {
        // Remove all subscriptions for this user (unsubscribe all devices)
        await query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.userId]);
    }

    return res.json({ success: true });
});

// GET / — list last 50 notifications for the user
router.get('/', async (req: AuthRequest, res) => {
    const { rows } = await query(
        'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [req.userId]
    );
    return res.json({ success: true, data: rows });
});

// GET /unread-count
router.get('/unread-count', async (req: AuthRequest, res) => {
    const { rows } = await query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
        [req.userId]
    );
    return res.json({ success: true, data: { count: rows[0]?.count ?? 0 } });
});

// PUT /read-all — mark all notifications as read
router.put('/read-all', async (req: AuthRequest, res) => {
    await query(
        'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
        [req.userId]
    );
    return res.json({ success: true });
});

// PUT /:id/read — mark one notification as read
router.put('/:id/read', async (req: AuthRequest, res) => {
    await query(
        'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
        [req.params.id, req.userId]
    );
    return res.json({ success: true });
});

export default router;
