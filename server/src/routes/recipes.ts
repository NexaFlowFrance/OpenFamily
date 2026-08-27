import { Router } from 'express';
import { query } from '../db';
import { aiCompleteWithUsage, AiError, type AiSettings } from '../services/ai';
import { decryptCredentials } from '../utils/crypto';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';
import { broadcast } from '../lib/broadcaster';
import { assertSafeIntegrationUrl, UnsafeUrlError } from '../utils/urlGuard';
import { fetchHtmlPage, findRecipeJsonLd, normalizeJsonLdRecipe } from '../lib/recipeImport';

const router = Router();
router.use(authMiddleware);

// Refine and format recipe text using configured AI chef prompt (Ollama / OpenAI / Anthropic)
router.post('/refine-ai', async (req: AuthRequest, res) => {
    try {
        const { rawText, name, category, description, ingredients, instructions } = req.body as {
            rawText?: string;
            name?: string;
            category?: string;
            description?: string;
            ingredients?: string[] | string;
            instructions?: string[] | string;
        };

        const settingsRow = await query(
            'SELECT provider, base_url, encrypted_api_key, model, enabled FROM ai_settings WHERE user_id = $1',
            [req.userId]
        );

        const row = settingsRow.rows[0];
        if (!row || !row.enabled || !row.model) {
            return res.status(400).json({
                success: false,
                error: 'AI_NOT_CONFIGURED',
                message: 'AI assistant is disabled or not configured in Settings > AI Assistant',
            });
        }

        let apiKey: string | null = null;
        if (row.encrypted_api_key) {
            try {
                apiKey = decryptCredentials(row.encrypted_api_key).api_key ?? null;
            } catch {}
        }

        const aiSettings: AiSettings = {
            provider: row.provider,
            base_url: row.base_url,
            api_key: apiKey,
            model: row.model,
        };

        const RECIPE_SCHEMA = {
            type: 'object',
            properties: {
                name: { type: 'string' },
                category: { type: 'string', enum: ['Entrée', 'Plat', 'Dessert', 'Snack'] },
                description: { type: 'string' },
                ingredients: { type: 'array', items: { type: 'string' } },
                instructions: { type: 'array', items: { type: 'string' } },
                prep_time: { type: 'number' },
                cook_time: { type: 'number' },
                servings: { type: 'number' },
            },
            required: ['name', 'category', 'ingredients', 'instructions'],
            additionalProperties: false,
        };

        const contentToRefine = rawText || `
Title: ${name || ''}
Category: ${category || ''}
Description: ${description || ''}
Ingredients:
${Array.isArray(ingredients) ? ingredients.join('\n') : (ingredients || '')}
Instructions:
${Array.isArray(instructions) ? instructions.join('\n') : (instructions || '')}
        `.trim();

        const { data: parsed, usage } = await aiCompleteWithUsage(aiSettings, {
            system: `You are a professional chef and gastronomy expert for the OpenFamily application.
Your mission is to review, organize, and structure the provided recipe IN ITS ORIGINAL LANGUAGE (French, English, Portuguese, Spanish, etc.). Do not translate the ingredients or instructions to another language: preserve the original language of the recipe.

STRICT STRUCTURING AND ORGANIZATION RULES:
1. "name": Clean, concise, and appetizing recipe title in its original language.
2. "category": Strictly choose the best option from:
   - "Entrée"
   - "Plat"
   - "Dessert"
   - "Snack"
3. "description": Appetizing 1 to 2 sentence summary in its original language.
4. "ingredients":
   - Keep each ingredient clean with its exact quantities.
   - IF THE RECIPE HAS DISTINCT SECTIONS (e.g., Dough / Pâte / Massa, Frosting / Nappage / Cobertura, Filling / Garniture / Recheio), add the section prefix in square brackets for each item! Examples:
     "[Dough] 4 eggs" / "[Pâte] 4 œufs" / "[Massa] 4 ovos"
     "[Frosting] 1 cup sugar" / "[Nappage] 1 tasse de sucre" / "[Cobertura] 1 xícara de açúcar"
5. "instructions":
   - Organize steps in chronological order in the original language.
   - IF THE RECIPE HAS DISTINCT SECTIONS, identify the section in square brackets!
6. Fill prep_time, cook_time, and servings if identified.`,
            user: `Refine the following recipe:\n\n${contentToRefine}`,
            jsonSchema: RECIPE_SCHEMA,
        });

        res.json({
            success: true,
            data: parsed,
            usage,
            provider: row.provider,
            model: row.model,
        });
    } catch (error) {
        if (error instanceof AiError) {
            return res.status(502).json({ success: false, error: error.code, message: error.message });
        }
        console.error('Refine recipe AI error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Import a recipe from a public URL (schema.org/Recipe JSON-LD).
// Parses and returns the recipe WITHOUT saving: the client prefills the
// create form so the user reviews/edits, then saves via POST /api/recipes.
// Error contract (the client maps these to localized toasts):
//   400 → invalid/unsafe URL, 502 'FETCH_FAILED' → page unreachable,
//   422 'NO_RECIPE_FOUND' → no Recipe JSON-LD on the page.

router.post('/import-url', async (req: AuthRequest, res) => {
    const { url } = req.body as { url?: unknown };
    const cleanUrl = typeof url === 'string' ? url.trim() : '';
    if (!cleanUrl) {
        return res.status(400).json({ success: false, error: 'url is required' });
    }

    let html: string;
    try {
        // Unlike LAN integrations, this route fetches the public internet:
        // private/loopback targets are ALWAYS blocked (checked on every redirect hop).
        html = await fetchHtmlPage(cleanUrl, (target) =>
            assertSafeIntegrationUrl(target, { blockPrivate: true })
        );
    } catch (error) {
        if (error instanceof UnsafeUrlError) {
            return res.status(400).json({ success: false, error: error.message });
        }
        console.error('Recipe import fetch error:', error instanceof Error ? error.message : error);
        return res.status(502).json({ success: false, error: 'FETCH_FAILED' });
    }

    const node = findRecipeJsonLd(html);
    if (!node) {
        return res.status(422).json({ success: false, error: 'NO_RECIPE_FOUND' });
    }

    res.json({ success: true, data: normalizeJsonLdRecipe(node) });
});

// Get all recipes
router.get('/', async (req: AuthRequest, res) => {
    try {
        const { category, difficulty } = req.query;

        let queryText = 'SELECT * FROM recipes WHERE user_id = $1';
        const params: any[] = [req.userId];

        if (category) {
            params.push(category);
            queryText += ` AND category = $${params.length}`;
        }

        if (difficulty) {
            params.push(difficulty);
            queryText += ` AND difficulty = $${params.length}`;
        }

        queryText += ' ORDER BY name ASC';

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get recipes error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get single recipe
router.get('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'SELECT * FROM recipes WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recipe not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Get recipe error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create recipe
router.post('/', async (req: AuthRequest, res) => {
    try {
        const { name, category, description, ingredients, instructions, prep_time, cook_time, servings, difficulty, tags, image_url } = req.body;
        const cleanedName = typeof name === 'string' ? name.trim() : '';
        const cleanedCategory = typeof category === 'string' ? category.trim() : '';
        const cleanedIngredients = Array.isArray(ingredients) ? ingredients.filter(Boolean) : [];
        const cleanedInstructions = Array.isArray(instructions) ? instructions.filter(Boolean) : [];

        if (!cleanedName || !cleanedCategory || cleanedIngredients.length === 0 || cleanedInstructions.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'name, category, ingredients and instructions are required',
            });
        }

        const result = await query(
            `INSERT INTO recipes (user_id, name, category, description, ingredients, instructions, prep_time, cook_time, servings, difficulty, tags, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
                req.userId,
                cleanedName,
                cleanedCategory,
                toNullIfEmpty(description),
                JSON.stringify(cleanedIngredients),
                JSON.stringify(cleanedInstructions),
                toOptionalNumber(prep_time),
                toOptionalNumber(cook_time),
                toOptionalNumber(servings),
                toNullIfEmpty(difficulty),
                JSON.stringify(Array.isArray(tags) ? tags.filter(Boolean) : []),
                toNullIfEmpty(image_url),
            ]
        );

        broadcast(req.userId!, { type: 'update', entity: 'recipes', action: 'created' });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Create recipe error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update recipe
router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { name, category, description, ingredients, instructions, prep_time, cook_time, servings, difficulty, tags, image_url } = req.body;
        const parsedPrepTime = prep_time !== undefined ? toOptionalNumber(prep_time) : undefined;
        const parsedCookTime = cook_time !== undefined ? toOptionalNumber(cook_time) : undefined;
        const parsedServings = servings !== undefined ? toOptionalNumber(servings) : undefined;

        if ((prep_time !== undefined && parsedPrepTime === null)
            || (cook_time !== undefined && parsedCookTime === null)
            || (servings !== undefined && parsedServings === null)) {
            return res.status(400).json({ success: false, error: 'Invalid numeric value' });
        }

        const result = await query(
            `UPDATE recipes 
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           description = COALESCE($3, description),
           ingredients = COALESCE($4, ingredients),
           instructions = COALESCE($5, instructions),
           prep_time = COALESCE($6, prep_time),
           cook_time = COALESCE($7, cook_time),
           servings = COALESCE($8, servings),
           difficulty = COALESCE($9, difficulty),
           tags = COALESCE($10, tags),
           image_url = COALESCE($11, image_url)
       WHERE id = $12 AND user_id = $13 RETURNING *`,
            [
                toNullIfEmpty(name),
                toNullIfEmpty(category),
                toNullIfEmpty(description),
                ingredients !== undefined ? JSON.stringify(Array.isArray(ingredients) ? ingredients.filter(Boolean) : []) : null,
                instructions !== undefined ? JSON.stringify(Array.isArray(instructions) ? instructions.filter(Boolean) : []) : null,
                parsedPrepTime,
                parsedCookTime,
                parsedServings,
                toNullIfEmpty(difficulty),
                tags !== undefined ? JSON.stringify(Array.isArray(tags) ? tags.filter(Boolean) : []) : null,
                toNullIfEmpty(image_url),
                id,
                req.userId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recipe not found' });
        }

        broadcast(req.userId!, { type: 'update', entity: 'recipes', action: 'updated' });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Update recipe error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete recipe
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM recipes WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recipe not found' });
        }

        broadcast(req.userId!, { type: 'update', entity: 'recipes', action: 'deleted' });
        res.json({ success: true, message: 'Recipe deleted' });
    } catch (error) {
        console.error('Delete recipe error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
