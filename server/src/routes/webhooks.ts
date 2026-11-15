import { Response, Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';
import {
    deliverWebhook, generateWebhookSecret, isWebhookEntity, parseWebhookEvents, sealWebhookTarget,
    WEBHOOK_ENTITIES, WEBHOOK_MAX_NAME_LENGTH, WEBHOOK_MAX_PER_FAMILY, WEBHOOK_MAX_URL_LENGTH, WEBHOOK_TEST_EVENT,
} from '../lib/webhooks';
import { assertSafeIntegrationUrl, UnsafeUrlError } from '../utils/urlGuard';
import logger from '../lib/logger';

// Outgoing webhooks (see lib/webhooks), for parents, with a session: an API
// token cannot reach these routes (apiTokenRefusal).
//
//   GET    /api/webhooks            the family's webhooks, without address path or secret
//   POST   /api/webhooks            registers one and returns its secret, this once
//   PUT    /api/webhooks/:id        renames it, changes what it is told, switches it on or off
//   DELETE /api/webhooks/:id        removes it
//   POST   /api/webhooks/:id/test   sends a test call now and says how it went

const COLUMNS = 'id, name, url_host, events, enabled, created_at, last_delivery_at, last_status, last_error, failure_count';

interface WebhookRow { events: string; [key: string]: unknown }
const present = (row: WebhookRow) => ({ ...row, events: parseWebhookEvents(row.events) });

const isId = (value: string): boolean => /^[0-9a-f-]{36}$/i.test(value);

/** The entities asked for, or null when the list is not one. An empty list means all. */
const readEvents = (raw: unknown): string[] | null => {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || !raw.every(isWebhookEntity)) return null;
    return WEBHOOK_ENTITIES.filter((entity) => raw.includes(entity));
};

const failed = (res: Response, code: string, error: unknown) => {
    logger.error(code, { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Internal server error' });
};

const router = Router();
router.use(authMiddleware, requireParent);

router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(`SELECT ${COLUMNS} FROM webhooks WHERE user_id = $1 ORDER BY created_at, id`, [req.userId]);
        return res.json({ success: true, data: result.rows.map(present), entities: WEBHOOK_ENTITIES });
    } catch (error) {
        return failed(res, 'webhooks.list_failed', error);
    }
});

router.post('/', async (req: AuthRequest, res) => {
    const body = (req.body ?? {}) as { name?: unknown; url?: unknown; events?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > WEBHOOK_MAX_NAME_LENGTH) {
        return res.status(400).json({ success: false, error: 'invalid_name' });
    }
    const events = readEvents(body.events);
    if (!events) {
        return res.status(400).json({ success: false, error: 'invalid_events' });
    }
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
    let url: URL;
    try {
        url = new URL(rawUrl);
        if (rawUrl.length > WEBHOOK_MAX_URL_LENGTH || url.username || url.password) throw new Error('refused');
        // Read once before saving: an address that must not be called is refused right away.
        await assertSafeIntegrationUrl(rawUrl);
    } catch (error) {
        return res.status(400).json({ success: false, error: error instanceof UnsafeUrlError ? 'unsafe_url' : 'invalid_url' });
    }

    try {
        const secret = generateWebhookSecret();
        // The count and the insert are one statement: two requests at once
        // cannot both take the last free slot.
        const created = await query(
            `INSERT INTO webhooks (user_id, created_by, name, url_host, encrypted_target, events)
             SELECT $1, $2, $3, $4, $5, $6
             WHERE (SELECT count(*) FROM webhooks WHERE user_id = $1) < $7
             RETURNING ${COLUMNS}`,
            [req.userId, req.actualUserId, name, url.host.slice(0, 255), sealWebhookTarget(rawUrl, secret), JSON.stringify(events), WEBHOOK_MAX_PER_FAMILY],
        );
        if (created.rows.length === 0) {
            return res.status(409).json({ success: false, error: 'limit_reached', max: WEBHOOK_MAX_PER_FAMILY });
        }
        logger.info('webhooks.created', { familyId: req.userId, id: created.rows[0].id });
        // The secret leaves the server here and never again.
        return res.status(201).json({ success: true, data: { ...present(created.rows[0]), secret } });
    } catch (error) {
        return failed(res, 'webhooks.create_failed', error);
    }
});

router.put('/:id', async (req: AuthRequest, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, error: 'not_found' });
    const body = (req.body ?? {}) as { name?: unknown; events?: unknown; enabled?: unknown };
    const updates: string[] = [];
    const values: unknown[] = [req.params.id, req.userId];
    const set = (column: string, value: unknown) => {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
    };

    if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > WEBHOOK_MAX_NAME_LENGTH) {
            return res.status(400).json({ success: false, error: 'invalid_name' });
        }
        set('name', name);
    }
    if (body.events !== undefined) {
        const events = readEvents(body.events);
        if (!events) return res.status(400).json({ success: false, error: 'invalid_events' });
        set('events', JSON.stringify(events));
    }
    if (body.enabled !== undefined) {
        if (typeof body.enabled !== 'boolean') return res.status(400).json({ success: false, error: 'invalid_enabled' });
        set('enabled', body.enabled);
        // Switched back on by hand: it starts again with a clean record.
        if (body.enabled) updates.push('failure_count = 0');
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'nothing_to_update' });

    try {
        const updated = await query(
            `UPDATE webhooks SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
            values,
        );
        if (updated.rows.length === 0) return res.status(404).json({ success: false, error: 'not_found' });
        return res.json({ success: true, data: present(updated.rows[0]) });
    } catch (error) {
        return failed(res, 'webhooks.update_failed', error);
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, error: 'not_found' });
    try {
        const removed = await query('DELETE FROM webhooks WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.userId]);
        if (removed.rows.length === 0) return res.status(404).json({ success: false, error: 'not_found' });
        logger.info('webhooks.deleted', { familyId: req.userId, id: req.params.id });
        return res.json({ success: true });
    } catch (error) {
        return failed(res, 'webhooks.delete_failed', error);
    }
});

router.post('/:id/test', async (req: AuthRequest, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, error: 'not_found' });
    try {
        const found = await query('SELECT id, encrypted_target FROM webhooks WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        const webhook = found.rows[0] as { id: string; encrypted_target: string } | undefined;
        if (!webhook) return res.status(404).json({ success: false, error: 'not_found' });
        const delivery = await deliverWebhook(webhook, WEBHOOK_TEST_EVENT, null, null);
        const current = await query(`SELECT ${COLUMNS} FROM webhooks WHERE id = $1`, [webhook.id]);
        return res.json({ success: true, data: { delivery, webhook: present(current.rows[0]) } });
    } catch (error) {
        return failed(res, 'webhooks.test_failed', error);
    }
});

export default router;
