import { Router, Response } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';
import { encryptCredentials, decryptCredentials } from '../utils/crypto';
import { assertSafeIntegrationUrl, UnsafeUrlError } from '../utils/urlGuard';
import { aiComplete, AiError, DEFAULT_BASE_URLS, type AiProvider, type AiSettings } from '../services/ai';
import {
    PARSE_SCHEMA,
    MEALS_SCHEMA,
    buildParsePrompt,
    buildMealsPrompt,
    validateParsedItems,
    validateMealProposals,
    type FamilyMemberRef,
    type RecipeRef,
} from '../services/ai/assistant';
import { getFamilyCategories } from './categories';
import logger from '../lib/logger';

const router = Router();
router.use(authMiddleware);

const PROVIDERS: AiProvider[] = ['ollama', 'openai', 'anthropic'];

interface AiSettingsRow {
    provider: AiProvider;
    base_url: string | null;
    encrypted_api_key: string | null;
    model: string;
    enabled: boolean;
}

const loadSettingsRow = async (userId: string): Promise<AiSettingsRow | null> => {
    const result = await query(
        'SELECT provider, base_url, encrypted_api_key, model, enabled FROM ai_settings WHERE user_id = $1',
        [userId]
    );
    return (result.rows[0] as AiSettingsRow) ?? null;
};

const decryptApiKey = (encrypted: string | null): string | null => {
    if (!encrypted) return null;
    try {
        return decryptCredentials(encrypted).api_key ?? null;
    } catch {
        return null;
    }
};

const toAiSettings = (row: AiSettingsRow): AiSettings => ({
    provider: row.provider,
    base_url: row.base_url,
    api_key: decryptApiKey(row.encrypted_api_key),
    model: row.model,
});

const handleAiError = (res: Response, error: unknown, context: string) => {
    if (error instanceof AiError) {
        // The code is machine-readable (the client maps it to a localized message);
        // `message` carries the provider detail for power users.
        return res.status(502).json({ success: false, error: error.code, message: error.message });
    }
    logger.error(`ai.${context}_error`, {
        error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ success: false, error: 'Internal server error' });
};

// GET /api/ai/settings — visible to every family member; the key NEVER leaves the server.
router.get('/settings', async (req: AuthRequest, res) => {
    try {
        const row = await loadSettingsRow(req.userId!);
        if (!row) {
            return res.json({ success: true, data: { configured: false, enabled: false } });
        }
        res.json({
            success: true,
            data: {
                configured: Boolean(row.model),
                enabled: row.enabled,
                provider: row.provider,
                base_url: row.base_url,
                model: row.model,
                has_api_key: Boolean(row.encrypted_api_key),
            },
        });
    } catch (error) {
        console.error('Get AI settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/ai/settings — parents only. Empty api_key keeps the stored one,
// explicit null clears it; the key is encrypted at rest (AES-256-GCM).
router.put('/settings', requireParent, async (req: AuthRequest, res) => {
    try {
        const { provider, base_url, api_key, model, enabled } = req.body as {
            provider?: string;
            base_url?: string | null;
            api_key?: string | null;
            model?: string;
            enabled?: boolean;
        };

        if (!provider || !PROVIDERS.includes(provider as AiProvider)) {
            return res.status(400).json({ success: false, error: 'provider invalide' });
        }
        const cleanedModel = typeof model === 'string' ? model.trim().slice(0, 100) : '';
        if (!cleanedModel) {
            return res.status(400).json({ success: false, error: 'model est requis' });
        }

        // Anthropic uses the official endpoint — no base URL to store.
        let cleanedBaseUrl: string | null = null;
        if (provider !== 'anthropic') {
            const rawUrl = typeof base_url === 'string' ? base_url.trim().replace(/\/+$/, '') : '';
            if (rawUrl) {
                try {
                    await assertSafeIntegrationUrl(rawUrl);
                } catch (e) {
                    return res.status(400).json({
                        success: false,
                        error: e instanceof UnsafeUrlError ? e.message : 'URL invalide',
                    });
                }
                cleanedBaseUrl = rawUrl;
            }
        }

        // api_key: undefined/'' → keep existing; explicit null → clear; string → replace.
        let encryptedKeyExpr: string | null | undefined;
        if (api_key === null) {
            encryptedKeyExpr = null;
        } else if (typeof api_key === 'string' && api_key.trim()) {
            encryptedKeyExpr = encryptCredentials({ api_key: api_key.trim() });
        } else {
            encryptedKeyExpr = undefined; // keep
        }

        const result = await query(
            `INSERT INTO ai_settings (user_id, provider, base_url, encrypted_api_key, model, enabled)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id) DO UPDATE SET
               provider = EXCLUDED.provider,
               base_url = EXCLUDED.base_url,
               encrypted_api_key = CASE WHEN $7 THEN EXCLUDED.encrypted_api_key ELSE ai_settings.encrypted_api_key END,
               model = EXCLUDED.model,
               enabled = EXCLUDED.enabled,
               updated_at = NOW()
             RETURNING provider, base_url, encrypted_api_key, model, enabled`,
            [
                req.userId,
                provider,
                cleanedBaseUrl,
                encryptedKeyExpr === undefined ? null : encryptedKeyExpr,
                cleanedModel,
                enabled === undefined ? true : Boolean(enabled),
                encryptedKeyExpr !== undefined, // $7: replace/clear the key?
            ]
        );

        const row = result.rows[0] as AiSettingsRow;
        res.json({
            success: true,
            data: {
                configured: Boolean(row.model),
                enabled: row.enabled,
                provider: row.provider,
                base_url: row.base_url,
                model: row.model,
                has_api_key: Boolean(row.encrypted_api_key),
            },
        });
    } catch (error) {
        console.error('Update AI settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/ai/test — parents only: trivial completion through the abstraction.
// Body fields override the saved settings so "Tester" works before saving;
// an empty api_key falls back to the stored (decrypted) one.
router.post('/test', requireParent, async (req: AuthRequest, res) => {
    try {
        const row = await loadSettingsRow(req.userId!);
        const body = req.body as { provider?: string; base_url?: string; api_key?: string; model?: string };

        const provider = (PROVIDERS.includes(body.provider as AiProvider) ? body.provider : row?.provider) as
            | AiProvider
            | undefined;
        const model = (typeof body.model === 'string' && body.model.trim()) || row?.model || '';
        if (!provider || !model) {
            return res.status(400).json({ success: false, error: 'AI_NOT_CONFIGURED' });
        }

        const settings: AiSettings = {
            provider,
            base_url:
                (typeof body.base_url === 'string' && body.base_url.trim().replace(/\/+$/, '')) ||
                row?.base_url ||
                DEFAULT_BASE_URLS[provider],
            api_key:
                (typeof body.api_key === 'string' && body.api_key.trim()) ||
                decryptApiKey(row?.encrypted_api_key ?? null),
            model: model.trim().slice(0, 100),
        };

        const result = await aiComplete(settings, {
            system: 'Tu es un test de connexion. Réponds uniquement en JSON.',
            user: 'Réponds avec {"ok":true}',
            jsonSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['ok'],
                properties: { ok: { type: 'boolean' } },
            },
        });

        if (result.ok !== true) {
            return res.status(502).json({
                success: false,
                error: 'AI_INVALID_RESPONSE',
                message: 'Le modèle a répondu, mais pas le JSON attendu',
            });
        }
        res.json({ success: true, message: 'OK' });
    } catch (error) {
        handleAiError(res, error, 'test');
    }
});

/** Loads + checks configured & enabled settings, or sends the 4xx response. */
const requireConfiguredAi = async (req: AuthRequest, res: Response): Promise<AiSettings | null> => {
    const row = await loadSettingsRow(req.userId!);
    if (!row || !row.model) {
        res.status(400).json({ success: false, error: 'AI_NOT_CONFIGURED' });
        return null;
    }
    if (!row.enabled) {
        res.status(400).json({ success: false, error: 'AI_DISABLED' });
        return null;
    }
    return toAiSettings(row);
};

// POST /api/ai/parse — any member: natural-language note → validated proposals.
// Nothing is saved: the client confirms then POSTs to the existing endpoints.
router.post('/parse', async (req: AuthRequest, res) => {
    try {
        const settings = await requireConfiguredAi(req, res);
        if (!settings) return;

        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (!text) {
            return res.status(400).json({ success: false, error: 'text est requis' });
        }

        const membersResult = await query(
            'SELECT id, name FROM family_members WHERE user_id = $1 ORDER BY name',
            [req.userId]
        );
        const members = membersResult.rows as FamilyMemberRef[];
        // Offer the family's own (possibly customized) category lists to the model.
        const familyCategories = await getFamilyCategories(req.userId!);

        const raw = await aiComplete(settings, {
            system: buildParsePrompt(members, familyCategories.shopping, familyCategories.budget),
            user: text.slice(0, 2000),
            jsonSchema: PARSE_SCHEMA,
        });

        const items = validateParsedItems(raw, members, familyCategories.shopping, familyCategories.budget);
        res.json({ success: true, data: { items } });
    } catch (error) {
        handleAiError(res, error, 'parse');
    }
});

// POST /api/ai/suggest-meals — any member: propose dinners for the week's empty
// 'Dîner' slots, using only the family's own recipes. Nothing is saved.
router.post('/suggest-meals', async (req: AuthRequest, res) => {
    try {
        const settings = await requireConfiguredAi(req, res);
        if (!settings) return;

        const weekStart = typeof req.body?.week_start === 'string' ? req.body.week_start.trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
            return res.status(400).json({ success: false, error: 'week_start (YYYY-MM-DD) est requis' });
        }

        const recipesResult = await query(
            'SELECT id, name, category FROM recipes WHERE user_id = $1 ORDER BY name',
            [req.userId]
        );
        const recipes = recipesResult.rows as RecipeRef[];
        if (recipes.length < 5) {
            return res.status(422).json({ success: false, error: 'AI_NOT_ENOUGH_RECIPES' });
        }

        // The 7 days of the requested week (noon avoids DST edge cases).
        const start = new Date(`${weekStart}T12:00:00`);
        if (Number.isNaN(start.getTime())) {
            return res.status(400).json({ success: false, error: 'week_start invalide' });
        }
        const pad2 = (n: number) => String(n).padStart(2, '0');
        const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const weekDates: string[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            weekDates.push(isoOf(d));
        }
        const weekEnd = weekDates[6];

        // Dinners already planned that week (any slot with a recipe or custom meal counts).
        const plannedResult = await query(
            `SELECT mp.date, mp.recipe_id, mp.custom_meal, r.name AS recipe_name
             FROM meal_plans mp
             LEFT JOIN recipes r ON mp.recipe_id = r.id
             WHERE mp.user_id = $1 AND mp.meal_type = 'Dîner' AND mp.date >= $2 AND mp.date <= $3`,
            [req.userId, weekStart, weekEnd]
        );
        const plannedDates = new Set(plannedResult.rows.map((r: any) => r.date as string));
        const plannedDinners = plannedResult.rows.map((r: any) => ({
            date: r.date as string,
            name: (r.recipe_name as string) || (r.custom_meal as string) || '—',
        }));
        const missingDates = weekDates.filter((d) => !plannedDates.has(d));
        if (missingDates.length === 0) {
            return res.json({ success: true, data: { proposals: [] } });
        }

        // Recipes used during the previous 2 weeks → avoid repeats.
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 14);
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const recentResult = await query(
            `SELECT DISTINCT recipe_id FROM meal_plans
             WHERE user_id = $1 AND recipe_id IS NOT NULL AND date >= $2 AND date <= $3`,
            [req.userId, isoOf(prevStart), isoOf(prevEnd)]
        );
        const recentRecipeIds = recentResult.rows.map((r: any) => r.recipe_id as string);

        const { system, user } = buildMealsPrompt({ recipes, missingDates, plannedDinners, recentRecipeIds });
        const raw = await aiComplete(settings, { system, user, jsonSchema: MEALS_SCHEMA });

        const proposals = validateMealProposals(raw, missingDates, recipes);
        res.json({ success: true, data: { proposals } });
    } catch (error) {
        handleAiError(res, error, 'suggest_meals');
    }
});

export default router;
