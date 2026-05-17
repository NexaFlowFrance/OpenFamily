import { Router } from 'express';
import { getClient, query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
    createShoppingItemSchema,
    updateShoppingItemSchema,
    createTemplateSchema,
    updateTemplateSchema,
} from '../schemas/shopping';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';
import logger from '../lib/logger';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all shopping items
router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM shopping_items WHERE user_id = $1 ORDER BY created_at DESC',
            [req.userId],
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('shopping.get_shopping_items_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create shopping item
router.post('/', validate({ body: createShoppingItemSchema }), async (req: AuthRequest, res) => {
    try {
        // The schema has already trimmed strings, coerced numbers, and
        // enforced required fields. We just normalize nulls/empties here.
        const { name, category, quantity, unit, price, notes } = req.body;

        const result = await query(
            `INSERT INTO shopping_items (user_id, name, category, quantity, unit, price, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                req.userId,
                name,
                category,
                quantity ?? null,
                toNullIfEmpty(unit),
                price ?? null,
                toNullIfEmpty(notes),
            ],
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('shopping.create_shopping_item_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update shopping item
router.put('/:id', validate({ body: updateShoppingItemSchema }), async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { name, category, quantity, unit, price, is_checked, notes } = req.body;

        const result = await query(
            `UPDATE shopping_items
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           quantity = COALESCE($3, quantity),
           unit = COALESCE($4, unit),
           price = COALESCE($5, price),
           is_checked = COALESCE($6, is_checked),
           notes = COALESCE($7, notes)
       WHERE id = $8 AND user_id = $9 RETURNING *`,
            [
                name,
                category,
                quantity,
                unit !== undefined ? toNullIfEmpty(unit) : undefined,
                price,
                is_checked,
                notes !== undefined ? toNullIfEmpty(notes) : undefined,
                id,
                req.userId,
            ],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('shopping.update_shopping_item_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete shopping item
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM shopping_items WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }

        res.json({ success: true, message: 'Item deleted' });
    } catch (error) {
        logger.error('shopping.delete_shopping_item_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Clear checked items
router.delete('/checked/clear', async (req: AuthRequest, res) => {
    try {
        await query('DELETE FROM shopping_items WHERE user_id = $1 AND is_checked = true', [
            req.userId,
        ]);

        res.json({ success: true, message: 'Checked items cleared' });
    } catch (error) {
        logger.error('shopping.clear_checked_items_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get templates
router.get('/templates', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM shopping_list_templates WHERE user_id = $1 ORDER BY name',
            [req.userId],
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('shopping.get_templates_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create template
router.post(
    '/templates',
    validate({ body: createTemplateSchema }),
    async (req: AuthRequest, res) => {
        try {
            const { name, items } = req.body;

            const result = await query(
                'INSERT INTO shopping_list_templates (user_id, name, items) VALUES ($1, $2, $3) RETURNING *',
                [req.userId, name, JSON.stringify(items)],
            );

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            logger.error('shopping.create_template_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },
);

// Update template (full replace of name + items).
router.put(
    '/templates/:id',
    validate({ body: updateTemplateSchema }),
    async (req: AuthRequest, res) => {
        try {
            const { id } = req.params;
            const { name, items } = req.body;

            const result = await query(
                `UPDATE shopping_list_templates
                 SET name = $1, items = $2, updated_at = NOW()
                 WHERE id = $3 AND user_id = $4
                 RETURNING *`,
                [name, JSON.stringify(items), id, req.userId],
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Template not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            logger.error('shopping.update_template_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },
);

// Apply template to shopping list
router.post('/templates/:id/apply', async (req: AuthRequest, res) => {
    const client = await getClient();
    try {
        const { id } = req.params;

        const templateResult = await client.query(
            'SELECT items FROM shopping_list_templates WHERE id = $1 AND user_id = $2',
            [id, req.userId],
        );

        if (templateResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }

        const rawItems = templateResult.rows[0].items;
        const items = Array.isArray(rawItems) ? rawItems : [];

        if (items.length === 0) {
            return res.status(400).json({ success: false, error: 'Template is empty' });
        }

        await client.query('BEGIN');

        for (const item of items) {
            const itemName = typeof item?.name === 'string' ? item.name.trim() : '';
            const itemCategory = typeof item?.category === 'string' ? item.category.trim() : '';
            if (!itemName || !itemCategory) {
                continue;
            }

            await client.query(
                `INSERT INTO shopping_items (user_id, name, category, quantity, unit, price, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    req.userId,
                    itemName,
                    itemCategory,
                    toOptionalNumber(item?.quantity),
                    toNullIfEmpty(item?.unit),
                    toOptionalNumber(item?.price),
                    toNullIfEmpty(item?.notes),
                ],
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Template applied' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('shopping.apply_template_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// Delete template
router.delete('/templates/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            'DELETE FROM shopping_list_templates WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }

        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        logger.error('shopping.delete_template_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
