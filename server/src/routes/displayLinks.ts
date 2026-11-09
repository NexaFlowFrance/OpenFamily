import crypto from 'node:crypto';
import { Router, Response } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';
import { displayOptions, normalizeDisplayLocale, renderDisplayNotFound, renderDisplayPage } from '../lib/displayPage';
import { loadDisplaySnapshot } from '../lib/displaySnapshot';
import { isLanguage } from '../lib/languages';
import logger from '../lib/logger';

// Display links: a stable address that shows the family's day without signing
// in, for a screen that cannot (e-paper frame, e-reader, wall display). Issue #135.
//
//   GET    /api/display-links        the family's links (parents)
//   POST   /api/display-links        creates one (parents)
//   DELETE /api/display-links/:id    revokes one (parents)
//   GET    /api/display/:token       the page itself, no session: the token is the key
//
// The token is kept as it is, like the calendar feed's, so that Settings can
// show the address again: a screen is often set up days after the link was made.
// It opens one read-only page and nothing else in the API.

const MAX_LINKS_PER_FAMILY = 10;
const MAX_NAME_LENGTH = 80;
// 32 random bytes in base64url.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const LINK_COLUMNS = 'id, name, token, locale, created_at, last_used_at';

// ─── Management (signed in, parents only) ────────────────────────────────────

const router = Router();
router.use(authMiddleware, requireParent);

router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            `SELECT ${LINK_COLUMNS} FROM display_links WHERE user_id = $1 ORDER BY created_at, id`,
            [req.userId],
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('display_links.list_failed', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    const body = (req.body ?? {}) as { name?: unknown; locale?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ success: false, error: 'invalid_name' });
    }

    try {
        // The page speaks the language of whoever made the link, in their region's
        // date and time style when the app sent it.
        const creator = await query('SELECT language FROM users WHERE id = $1', [req.actualUserId]);
        const language = String(creator.rows[0]?.language ?? '').toLowerCase().split(/[-_]/)[0];
        const locale = normalizeDisplayLocale(body.locale, isLanguage(language) ? language : 'en');

        // The count and the insert are one statement: two requests at once
        // cannot both take the last free slot.
        const created = await query(
            `INSERT INTO display_links (user_id, name, token, locale, created_by)
             SELECT $1, $2, $3, $4, $5
             WHERE (SELECT count(*) FROM display_links WHERE user_id = $1) < $6
             RETURNING ${LINK_COLUMNS}`,
            [req.userId, name, crypto.randomBytes(32).toString('base64url'), locale, req.actualUserId, MAX_LINKS_PER_FAMILY],
        );
        if (created.rows.length === 0) {
            return res.status(409).json({ success: false, error: 'limit_reached', max: MAX_LINKS_PER_FAMILY });
        }
        logger.info('display_links.created', { familyId: req.userId, linkId: created.rows[0].id });
        return res.status(201).json({ success: true, data: created.rows[0] });
    } catch (error) {
        logger.error('display_links.create_failed', { error: error instanceof Error ? error.message : String(error) });
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    // A malformed id would make PostgreSQL raise: answer like an unknown one.
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
        return res.status(404).json({ success: false, error: 'not_found' });
    }
    try {
        const removed = await query(
            'DELETE FROM display_links WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId],
        );
        if (removed.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'not_found' });
        }
        logger.info('display_links.revoked', { familyId: req.userId, linkId: req.params.id });
        return res.json({ success: true });
    } catch (error) {
        logger.error('display_links.revoke_failed', { error: error instanceof Error ? error.message : String(error) });
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ─── The page (no session) ───────────────────────────────────────────────────

export const displayPageRouter = Router();

const sendPage = (res: Response, status: number, html: string): void => {
    // The page shows a family's day to whoever holds its address: nothing may
    // keep a copy, list it or learn the address from it. It runs no script and
    // loads nothing, and says so, which also replaces the app's own policy.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    );
    res.status(status).type('html').send(html);
};

displayPageRouter.get('/:token', async (req, res) => {
    const token = req.params.token;
    if (!TOKEN_PATTERN.test(token)) {
        return sendPage(res, 404, renderDisplayNotFound());
    }

    try {
        const found = await query('SELECT id, user_id, locale FROM display_links WHERE token = $1', [token]);
        const link = found.rows[0] as { id: string; user_id: string; locale: string } | undefined;
        if (!link) {
            return sendPage(res, 404, renderDisplayNotFound());
        }

        // "Last used" in Settings tells a screen that is still in use from a
        // forgotten link. A minute's precision is plenty, and saves a write on
        // every refresh.
        query(
            `UPDATE display_links SET last_used_at = now()
             WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
            [link.id],
        ).catch(() => undefined);

        const snapshot = await loadDisplaySnapshot(link.user_id);
        return sendPage(res, 200, renderDisplayPage(snapshot, displayOptions(req.query, link.locale)));
    } catch (error) {
        logger.error('display_links.page_failed', { error: error instanceof Error ? error.message : String(error) });
        return res.status(500).type('text').send('Internal server error');
    }
});

export default router;
