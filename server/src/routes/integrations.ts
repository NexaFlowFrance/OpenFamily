import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, requireParent, AuthRequest } from '../middleware/auth';
import { encryptCredentials, decryptCredentials } from '../utils/crypto';
import { testMealieConnection, syncMealie } from '../services/integrations/mealie';
import { testTandoorConnection, syncTandoor } from '../services/integrations/tandoor';
import { testHomeAssistantConnection, syncHomeAssistant } from '../services/integrations/homeassistant';
import { testGrocyConnection, syncGrocy } from '../services/integrations/grocy';
import { testNextcloudConnection, syncNextcloud } from '../services/integrations/nextcloud';
import { broadcast } from '../lib/broadcaster';

const router = Router();
router.use(authMiddleware);

// GET /api/integrations
router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            `SELECT id, type, display_name, base_url, config, status, last_synced_at, last_error, created_at
             FROM integrations WHERE family_id = $1 ORDER BY type`,
            [req.userId]
        );
        res.json({ success: true, data: result.rows });
    } catch {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/integrations/test - test without saving
router.post('/test', requireParent, async (req: AuthRequest, res) => {
    const { type, base_url, apiKey, token } = req.body as Record<string, string>;
    const cleanUrl = (base_url || '').replace(/\/$/, '');

    try {
        let result: { success: boolean; message: string };
        switch (type) {
            case 'mealie':        result = await testMealieConnection(cleanUrl, apiKey); break;
            case 'tandoor':       result = await testTandoorConnection(cleanUrl, apiKey); break;
            case 'homeassistant': result = await testHomeAssistantConnection(cleanUrl, token); break;
            case 'grocy':         result = await testGrocyConnection(cleanUrl, apiKey); break;
            case 'nextcloud':     result = await testNextcloudConnection(cleanUrl, (req.body as Record<string, string>).username, (req.body as Record<string, string>).password); break;
            default:              result = { success: false, message: "Type d'integration inconnu" };
        }
        res.json(result);
    } catch (e) {
        res.json({ success: false, message: e instanceof Error ? e.message : 'Erreur inconnue' });
    }
});

// POST /api/integrations - connect
router.post('/', requireParent, async (req: AuthRequest, res) => {
    const { type, base_url, display_name, config: configFromBody, apiKey, token, username, password, ha_entity_id } = req.body as Record<string, string> & { config?: object };

    if (!type || !base_url) {
        return res.status(400).json({ success: false, error: 'type et base_url sont requis' });
    }

    const credentials: Record<string, string> = {};
    if (apiKey) credentials.apiKey = apiKey;
    if (token) credentials.token = token;
    if (username) credentials.username = username;
    if (password) credentials.password = password;

    // Merge any integration-specific config fields
    const extraConfig: Record<string, string> = {};
    if (ha_entity_id) extraConfig.ha_entity_id = ha_entity_id;
    const config = Object.keys(extraConfig).length > 0 ? { ...(configFromBody || {}), ...extraConfig } : (configFromBody || {});

    const cleanUrl = base_url.replace(/\/$/, '');
    const encrypted = Object.keys(credentials).length > 0 ? encryptCredentials(credentials) : null;

    try {
        const result = await query(
            `INSERT INTO integrations (family_id, type, display_name, base_url, encrypted_credentials, config, status)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'connected')
             ON CONFLICT (family_id, type) DO UPDATE SET
               display_name = EXCLUDED.display_name,
               base_url = EXCLUDED.base_url,
               encrypted_credentials = COALESCE(EXCLUDED.encrypted_credentials, integrations.encrypted_credentials),
               config = EXCLUDED.config,
               status = 'connected',
               last_error = NULL,
               updated_at = NOW()
             RETURNING id, type, display_name, base_url, config, status, last_synced_at, created_at`,
            [req.userId, type, display_name || type, cleanUrl, encrypted, JSON.stringify(config || {})]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/integrations/:id/sync
router.post('/:id/sync', requireParent, async (req: AuthRequest, res) => {
    try {
        const integResult = await query(
            'SELECT * FROM integrations WHERE id = $1 AND family_id = $2',
            [req.params.id, req.userId]
        );
        if (integResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Integration introuvable' });
        }

        const integ = integResult.rows[0] as {
            id: string; type: string; base_url: string;
            encrypted_credentials: string; config: Record<string, unknown>;
        };

        await query("UPDATE integrations SET status = 'syncing', updated_at = NOW() WHERE id = $1", [integ.id]);

        try {
            let syncResult: { imported: number; errors: number };

            switch (integ.type) {
                case 'mealie':        syncResult = await syncMealie(integ.id, req.userId!, integ.base_url, integ.encrypted_credentials); break;
                case 'tandoor':       syncResult = await syncTandoor(integ.id, req.userId!, integ.base_url, integ.encrypted_credentials); break;
                case 'homeassistant': syncResult = await syncHomeAssistant(integ.id, req.userId!, integ.base_url, integ.encrypted_credentials, integ.config || {}); break;
                case 'grocy':         syncResult = await syncGrocy(integ.id, req.userId!, integ.base_url, integ.encrypted_credentials); break;
                case 'nextcloud':     syncResult = await syncNextcloud(integ.id, req.userId!, integ.base_url, integ.encrypted_credentials, integ.config || {}); break;
                default: throw new Error('Type inconnu');
            }

            await query(
                "UPDATE integrations SET status = 'connected', last_synced_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1",
                [integ.id]
            );

            broadcast(req.userId!, { type: 'update', entity: 'integrations', action: 'synced' });
            res.json({ success: true, data: syncResult });
        } catch (syncError) {
            const msg = syncError instanceof Error ? syncError.message : 'Sync error';
            await query("UPDATE integrations SET status = 'error', last_error = $2, updated_at = NOW() WHERE id = $1", [integ.id, msg]);
            res.status(500).json({ success: false, error: msg });
        }
    } catch {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// DELETE /api/integrations/:id
router.delete('/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'DELETE FROM integrations WHERE id = $1 AND family_id = $2 RETURNING id',
            [req.params.id, req.userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Integration introuvable' });
        }
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
