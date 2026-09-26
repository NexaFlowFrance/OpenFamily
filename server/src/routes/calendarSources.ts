import express, { Router } from 'express';
import { getClient, query } from '../db';
import { authMiddleware, requireParent, AuthRequest } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';
import logger from '../lib/logger';
import { encryptCredentials } from '../utils/crypto';
import {
    CalendarSourceError,
    MAX_ICS_BYTES,
    MAX_SUBSCRIPTIONS,
    fetchIcs,
    normalizeCalendarUrl,
    parseForStorage,
    storeEvents,
    syncSubscription,
} from '../lib/calendarSources';

const router = Router();
router.use(authMiddleware);

const normalizeColor = (value: unknown, fallback: string): string => {
    const color = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
};

/** Only this family's members; anything else is dropped. */
const familyMemberIds = async (value: unknown, userId: string): Promise<string[]> => {
    const wanted = (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
        .map((id) => String(id).trim())
        .filter(Boolean);
    if (wanted.length === 0) return [];
    const found = await query(
        'SELECT id FROM family_members WHERE user_id = $1 AND id::text = ANY($2::text[])',
        [userId, wanted]
    );
    const valid = new Set(found.rows.map((r: any) => String(r.id)));
    return wanted.filter((id) => valid.has(id));
};

const sourceErrorResponse = (res: express.Response, error: unknown, context: string) => {
    if (error instanceof CalendarSourceError) {
        return res.status(400).json({ success: false, error: error.code });
    }
    logger.error(context, { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Internal server error' });
};

const publicSubscription = (row: any) => ({
    id: row.id,
    name: row.name,
    url_host: row.url_host,
    color: row.color,
    family_member_ids: Array.isArray(row.family_member_ids) ? row.family_member_ids : [],
    last_synced_at: row.last_synced_at,
    last_error: row.last_error,
    event_count: row.event_count,
    created_at: row.created_at,
});

const userLanguage = async (req: AuthRequest) => {
    const r = await query('SELECT language FROM users WHERE id = $1', [req.actualUserId ?? req.userId]);
    return r.rows[0]?.language ?? 'fr';
};

// ─── one-off .ics file import ───────────────────────────────────────────────
// The file is the raw request body (text/calendar), read here after the login
// and parent checks, with its own size limit.
router.post(
    '/import',
    requireParent,
    express.text({ type: () => true, limit: MAX_ICS_BYTES }),
    async (req: AuthRequest, res) => {
        try {
            const ics = typeof req.body === 'string' ? req.body : '';
            const parsed = parseForStorage(ics, await userLanguage(req), false);
            const client = await getClient();
            try {
                await client.query('BEGIN');
                const stored = await storeEvents(client, {
                    userId: req.userId!,
                    subscriptionId: null,
                    color: normalizeColor(req.query.color, '#3B82F6'),
                    memberIds: await familyMemberIds(req.query.member_ids, req.userId!),
                    events: parsed.events,
                    removeMissing: false,
                });
                await client.query('COMMIT');
                broadcast(req.userId!, { type: 'update', entity: 'appointments', action: 'created' });
                res.json({
                    success: true,
                    data: { ...stored, total: parsed.events.length, truncated: parsed.truncated, name: parsed.name },
                });
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            return sourceErrorResponse(res, error, 'calendar_import.failed');
        }
    }
);

// ─── followed calendars ─────────────────────────────────────────────────────
router.get('/subscriptions', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM calendar_subscriptions WHERE user_id = $1 ORDER BY created_at ASC',
            [req.userId]
        );
        res.json({ success: true, data: result.rows.map(publicSubscription) });
    } catch (error) {
        return sourceErrorResponse(res, error, 'calendar_subscriptions.list_failed');
    }
});

router.post('/subscriptions', requireParent, async (req: AuthRequest, res) => {
    try {
        const count = await query('SELECT COUNT(*)::int AS n FROM calendar_subscriptions WHERE user_id = $1', [req.userId]);
        if (count.rows[0].n >= MAX_SUBSCRIPTIONS) {
            return res.status(400).json({ success: false, error: 'TOO_MANY' });
        }
        const url = normalizeCalendarUrl(req.body?.url);
        // Read it once before saving: a wrong address is refused right away.
        const parsed = parseForStorage(await fetchIcs(url.toString()), await userLanguage(req), true);
        const name = (typeof req.body?.name === 'string' && req.body.name.trim()
            ? req.body.name.trim()
            : parsed.name ?? url.hostname).slice(0, 100);
        const color = normalizeColor(req.body?.color, '#3B82F6');
        const memberIds = await familyMemberIds(req.body?.family_member_ids, req.userId!);

        const client = await getClient();
        let subscription: any;
        try {
            await client.query('BEGIN');
            const inserted = await client.query(
                `INSERT INTO calendar_subscriptions
                    (user_id, name, encrypted_url, url_host, color, family_member_ids, last_synced_at, event_count)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), $7)
                 RETURNING *`,
                [req.userId, name, encryptCredentials({ url: url.toString() }), url.hostname.slice(0, 255),
                    color, JSON.stringify(memberIds), parsed.events.length]
            );
            subscription = inserted.rows[0];
            await storeEvents(client, {
                userId: req.userId!,
                subscriptionId: subscription.id,
                color,
                memberIds,
                events: parsed.events,
                removeMissing: false,
            });
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
        broadcast(req.userId!, { type: 'update', entity: 'appointments', action: 'created' });
        res.json({ success: true, data: { ...publicSubscription(subscription), truncated: parsed.truncated } });
    } catch (error) {
        return sourceErrorResponse(res, error, 'calendar_subscriptions.create_failed');
    }
});

// Name, colour and members; the colour and members apply to its events too.
router.put('/subscriptions/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        const current = await query(
            'SELECT * FROM calendar_subscriptions WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );
        const sub = current.rows[0];
        if (!sub) return res.status(404).json({ success: false, error: 'Not found' });

        const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 100) : sub.name;
        const color = req.body?.color !== undefined ? normalizeColor(req.body.color, sub.color) : sub.color;
        const memberIds = req.body?.family_member_ids !== undefined
            ? await familyMemberIds(req.body.family_member_ids, req.userId!)
            : sub.family_member_ids;

        const updated = await query(
            `UPDATE calendar_subscriptions SET name = $2, color = $3, family_member_ids = $4::jsonb, updated_at = now()
             WHERE id = $1 RETURNING *`,
            [sub.id, name, color, JSON.stringify(memberIds)]
        );
        if (color !== sub.color) {
            await query('UPDATE appointments SET color = $2 WHERE subscription_id = $1', [sub.id, color]);
        }
        if (req.body?.family_member_ids !== undefined) {
            await query('UPDATE appointments SET family_member_ids = $2::jsonb WHERE subscription_id = $1', [sub.id, JSON.stringify(memberIds)]);
        }
        broadcast(req.userId!, { type: 'update', entity: 'appointments', action: 'updated' });
        res.json({ success: true, data: publicSubscription(updated.rows[0]) });
    } catch (error) {
        return sourceErrorResponse(res, error, 'calendar_subscriptions.update_failed');
    }
});

router.post('/subscriptions/:id/sync', requireParent, async (req: AuthRequest, res) => {
    try {
        const owned = await query('SELECT 1 FROM calendar_subscriptions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        if (owned.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        const result = await syncSubscription(req.params.id);
        const row = await query('SELECT * FROM calendar_subscriptions WHERE id = $1', [req.params.id]);
        res.json({ success: true, data: { ...publicSubscription(row.rows[0]), result } });
    } catch (error) {
        return sourceErrorResponse(res, error, 'calendar_subscriptions.sync_failed');
    }
});

// Unfollowing removes its events (they belong to the source).
router.delete('/subscriptions/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        const removed = await query(
            'DELETE FROM calendar_subscriptions WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId]
        );
        if (removed.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        broadcast(req.userId!, { type: 'update', entity: 'appointments', action: 'deleted' });
        res.json({ success: true });
    } catch (error) {
        return sourceErrorResponse(res, error, 'calendar_subscriptions.delete_failed');
    }
});

export default router;
