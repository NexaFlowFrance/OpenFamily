import { Router } from 'express';
import pool, { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';
import { broadcast } from '../lib/broadcaster';
import { assertSafeIntegrationUrl, UnsafeUrlError } from '../utils/urlGuard';
import { fetchHtmlPage, findRecipeJsonLd, normalizeJsonLdRecipe } from '../lib/recipeImport';

const router = Router();
router.use(authMiddleware);

// Add selected recipe ingredients to user's shopping list
router.post('/add-to-shopping', async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
        const { items, recipeName } = req.body as { items?: string[]; recipeName?: string };
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'items array is required' });
        }

        // Cap batch size at 50 items to prevent resource exhaustion
        const targetItems = items.slice(0, 50);

        // Fetch existing shopping list items to detect duplicates
        const existingRes = await client.query('SELECT name FROM shopping_items WHERE user_id = $1', [req.userId]);
        const existingNames = new Set(
            existingRes.rows.map((r: { name: string }) => r.name.toLowerCase().trim())
        );

        let addedCount = 0;
        let duplicateCount = 0;

        await client.query('BEGIN');

        for (const rawItem of targetItems) {
            const cleanItem = typeof rawItem === 'string' ? rawItem.replace(/^\[[^\]]+\]\s*/, '').trim() : '';
            if (!cleanItem) continue;

            const isDuplicate = existingNames.has(cleanItem.toLowerCase());
            if (isDuplicate) {
                duplicateCount++;
                continue; // Do not re-insert existing duplicate items into the database
            }

            await client.query(
                `INSERT INTO shopping_items (user_id, name, notes)
                 VALUES ($1, $2, $3)`,
                [
                    req.userId,
                    cleanItem,
                    recipeName ? recipeName.slice(0, 200) : null,
                ]
            );
            existingNames.add(cleanItem.toLowerCase());
            addedCount++;
        }

        await client.query('COMMIT');

        if (addedCount > 0) {
            broadcast(req.userId!, { type: 'update', entity: 'shopping', action: 'created' });
        }

        res.json({
            success: true,
            addedCount,
            duplicateCount,
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Add ingredients to shopping list error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        client.release();
    }
});

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
