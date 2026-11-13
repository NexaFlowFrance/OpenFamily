import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';
import { API_TOKEN_MAX_NAME_LENGTH, API_TOKEN_MAX_PER_FAMILY, generateApiToken, isApiTokenScope } from '../lib/apiTokens';
import { closeApiTokenSockets } from '../lib/broadcaster';
import logger from '../lib/logger';

// Personal API tokens (see lib/apiTokens), for parents, with a session: an
// API token cannot reach these routes (apiTokenRefusal).
//
//   GET    /api/api-tokens       the family's tokens, without their secrets
//   POST   /api/api-tokens       makes one and returns the secret, this once
//   DELETE /api/api-tokens/:id   revokes one, closing its WebSockets

const TOKEN_COLUMNS = 'id, name, token_prefix, scope, created_at, last_used_at';

const router = Router();
router.use(authMiddleware, requireParent);

router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            `SELECT t.id, t.name, t.token_prefix, t.scope, t.created_at, t.last_used_at, u.name AS created_by
             FROM api_tokens t LEFT JOIN users u ON u.id = t.created_by
             WHERE t.user_id = $1 ORDER BY t.created_at, t.id`,
            [req.userId],
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('api_tokens.list_failed', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    const body = (req.body ?? {}) as { name?: unknown; scope?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > API_TOKEN_MAX_NAME_LENGTH) {
        return res.status(400).json({ success: false, error: 'invalid_name' });
    }
    if (!isApiTokenScope(body.scope)) {
        return res.status(400).json({ success: false, error: 'invalid_scope' });
    }

    try {
        const generated = generateApiToken();
        // The count and the insert are one statement: two requests at once
        // cannot both take the last free slot.
        const created = await query(
            `INSERT INTO api_tokens (user_id, created_by, name, token_hash, token_prefix, scope)
             SELECT $1, $2, $3, $4, $5, $6
             WHERE (SELECT count(*) FROM api_tokens WHERE user_id = $1) < $7
             RETURNING ${TOKEN_COLUMNS}, (SELECT name FROM users WHERE id = $2) AS created_by`,
            [req.userId, req.actualUserId, name, generated.hash, generated.prefix, body.scope, API_TOKEN_MAX_PER_FAMILY],
        );
        if (created.rows.length === 0) {
            return res.status(409).json({ success: false, error: 'limit_reached', max: API_TOKEN_MAX_PER_FAMILY });
        }
        logger.info('api_tokens.created', { familyId: req.userId, id: created.rows[0].id, scope: body.scope });
        // The secret leaves the server here and never again.
        return res.status(201).json({ success: true, data: { ...created.rows[0], token: generated.token } });
    } catch (error) {
        logger.error('api_tokens.create_failed', { error: error instanceof Error ? error.message : String(error) });
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
            'DELETE FROM api_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId],
        );
        if (removed.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'not_found' });
        }
        closeApiTokenSockets(req.params.id);
        logger.info('api_tokens.revoked', { familyId: req.userId, id: req.params.id });
        return res.json({ success: true });
    } catch (error) {
        logger.error('api_tokens.revoke_failed', { error: error instanceof Error ? error.message : String(error) });
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
