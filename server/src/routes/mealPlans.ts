import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty } from '../lib/normalize';

const router = Router();
router.use(authMiddleware);

const ensureRecipeBelongsToUser = async (recipeId: string | null, userId: string) => {
    if (!recipeId) {
        return;
    }

    const recipe = await query('SELECT id FROM recipes WHERE id = $1 AND user_id = $2', [recipeId, userId]);
    if (recipe.rows.length === 0) {
        throw new Error('INVALID_RECIPE');
    }
};

const mapMealPlanRow = (row: any) => ({
    ...row,
    recipe: row.recipe_id
        ? {
            id: row.recipe_id,
            name: row.recipe_name,
            category: row.recipe_category,
            image_url: row.recipe_image,
        }
        : null,
});

// Get meal plans for a date range
router.get('/', async (req: AuthRequest, res) => {
    try {
        const { start_date, end_date } = req.query;

        let queryText = `
      SELECT mp.*, r.name as recipe_name, r.category as recipe_category, r.image_url as recipe_image
      FROM meal_plans mp
      LEFT JOIN recipes r ON mp.recipe_id = r.id
      WHERE mp.user_id = $1
    `;
        const params: any[] = [req.userId];

        if (start_date) {
            params.push(start_date);
            queryText += ` AND mp.date >= $${params.length}`;
        }

        if (end_date) {
            params.push(end_date);
            queryText += ` AND mp.date <= $${params.length}`;
        }

        queryText += ' ORDER BY mp.date ASC, mp.meal_type ASC';

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows.map(mapMealPlanRow) });
    } catch (error) {
        console.error('Get meal plans error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create or update meal plan by unique slot
router.post('/', async (req: AuthRequest, res) => {
    try {
        const { date, meal_type, recipe_id, custom_meal, notes } = req.body;
        const cleanedDate = toNullIfEmpty(date);
        const cleanedMealType = toNullIfEmpty(meal_type);
        const cleanedRecipeId = toNullIfEmpty(recipe_id) as string | null;

        if (!cleanedDate || !cleanedMealType) {
            return res.status(400).json({ success: false, error: 'date and meal_type are required' });
        }

        await ensureRecipeBelongsToUser(cleanedRecipeId, req.userId!);

        const result = await query(
            `INSERT INTO meal_plans (user_id, date, meal_type, recipe_id, custom_meal, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, date, meal_type)
       DO UPDATE SET recipe_id = EXCLUDED.recipe_id,
                     custom_meal = EXCLUDED.custom_meal,
                     notes = EXCLUDED.notes
       RETURNING *`,
            [req.userId, cleanedDate, cleanedMealType, cleanedRecipeId, toNullIfEmpty(custom_meal), toNullIfEmpty(notes)]
        );

        const withRecipe = await query(
            `SELECT mp.*, r.name as recipe_name, r.category as recipe_category, r.image_url as recipe_image
       FROM meal_plans mp
       LEFT JOIN recipes r ON mp.recipe_id = r.id
       WHERE mp.id = $1 AND mp.user_id = $2`,
            [result.rows[0].id, req.userId]
        );

        res.json({ success: true, data: mapMealPlanRow(withRecipe.rows[0]) });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_RECIPE') {
            return res.status(400).json({ success: false, error: 'Recipe not found' });
        }

        console.error('Create meal plan error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update meal plan by id
router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { date, meal_type, recipe_id, custom_meal, notes } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        const pushUpdate = (field: string, value: any) => {
            values.push(value);
            updates.push(`${field} = $${values.length}`);
        };

        if (date !== undefined) {
            const cleanedDate = toNullIfEmpty(date);
            if (!cleanedDate) {
                return res.status(400).json({ success: false, error: 'date cannot be empty' });
            }
            pushUpdate('date', cleanedDate);
        }

        if (meal_type !== undefined) {
            const cleanedMealType = toNullIfEmpty(meal_type);
            if (!cleanedMealType) {
                return res.status(400).json({ success: false, error: 'meal_type cannot be empty' });
            }
            pushUpdate('meal_type', cleanedMealType);
        }

        if (recipe_id !== undefined) {
            const cleanedRecipeId = toNullIfEmpty(recipe_id) as string | null;
            await ensureRecipeBelongsToUser(cleanedRecipeId, req.userId!);
            pushUpdate('recipe_id', cleanedRecipeId);
        }

        if (custom_meal !== undefined) {
            pushUpdate('custom_meal', toNullIfEmpty(custom_meal));
        }

        if (notes !== undefined) {
            pushUpdate('notes', toNullIfEmpty(notes));
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const result = await query(
            `UPDATE meal_plans
       SET ${updates.join(', ')}
       WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
       RETURNING id`,
            [...values, id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Meal plan not found' });
        }

        const withRecipe = await query(
            `SELECT mp.*, r.name as recipe_name, r.category as recipe_category, r.image_url as recipe_image
       FROM meal_plans mp
       LEFT JOIN recipes r ON mp.recipe_id = r.id
       WHERE mp.id = $1 AND mp.user_id = $2`,
            [id, req.userId]
        );

        res.json({ success: true, data: mapMealPlanRow(withRecipe.rows[0]) });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_RECIPE') {
            return res.status(400).json({ success: false, error: 'Recipe not found' });
        }

        console.error('Update meal plan error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete meal plan
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM meal_plans WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Meal plan not found' });
        }

        res.json({ success: true, message: 'Meal plan deleted' });
    } catch (error) {
        console.error('Delete meal plan error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
