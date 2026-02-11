import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';

const router = Router();
router.use(authMiddleware);

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

        res.json({ success: true, message: 'Recipe deleted' });
    } catch (error) {
        console.error('Delete recipe error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
