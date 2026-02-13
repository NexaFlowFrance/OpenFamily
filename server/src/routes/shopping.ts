import { Router } from 'express';
import { getClient, query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all shopping items
router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM shopping_items WHERE user_id = $1 ORDER BY created_at DESC',
            [req.userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get shopping items error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create shopping item
router.post('/', async (req: AuthRequest, res) => {
    try {
        const { name, category, quantity, unit, price, notes } = req.body;
        const cleanedName = typeof name === 'string' ? name.trim() : '';
        const cleanedCategory = typeof category === 'string' ? category.trim() : '';
        const parsedQuantity = quantity !== undefined ? toOptionalNumber(quantity) : null;
        const parsedPrice = price !== undefined ? toOptionalNumber(price) : null;

        if (!cleanedName || !cleanedCategory) {
            return res.status(400).json({ success: false, error: 'name and category are required' });
        }

        if (quantity !== undefined && quantity !== '' && parsedQuantity === null) {
            return res.status(400).json({ success: false, error: 'Invalid quantity format' });
        }

        if (price !== undefined && price !== '' && parsedPrice === null) {
            return res.status(400).json({ success: false, error: 'Invalid price format' });
        }

        const result = await query(
            `INSERT INTO shopping_items (user_id, name, category, quantity, unit, price, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                req.userId,
                cleanedName,
                cleanedCategory,
                parsedQuantity,
                toNullIfEmpty(unit),
                parsedPrice,
                toNullIfEmpty(notes),
            ]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Create shopping item error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update shopping item
router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { name, category, quantity, unit, price, is_checked, notes } = req.body;

        const cleanedName = name !== undefined ? toNullIfEmpty(name) : undefined;
        const cleanedCategory = category !== undefined ? toNullIfEmpty(category) : undefined;
        const parsedQuantity = quantity !== undefined ? toOptionalNumber(quantity) : undefined;
        const parsedPrice = price !== undefined ? toOptionalNumber(price) : undefined;

        if (quantity !== undefined && quantity !== '' && parsedQuantity === null) {
            return res.status(400).json({ success: false, error: 'Invalid quantity format' });
        }

        if (price !== undefined && price !== '' && parsedPrice === null) {
            return res.status(400).json({ success: false, error: 'Invalid price format' });
        }

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
                cleanedName,
                cleanedCategory,
                parsedQuantity,
                unit !== undefined ? toNullIfEmpty(unit) : undefined,
                parsedPrice,
                is_checked !== undefined ? Boolean(is_checked) : undefined,
                notes !== undefined ? toNullIfEmpty(notes) : undefined,
                id,
                req.userId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Update shopping item error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete shopping item
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM shopping_items WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }

        res.json({ success: true, message: 'Item deleted' });
    } catch (error) {
        console.error('Delete shopping item error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Clear checked items
router.delete('/checked/clear', async (req: AuthRequest, res) => {
    try {
        await query(
            'DELETE FROM shopping_items WHERE user_id = $1 AND is_checked = true',
            [req.userId]
        );

        res.json({ success: true, message: 'Checked items cleared' });
    } catch (error) {
        console.error('Clear checked items error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get templates
router.get('/templates', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM shopping_list_templates WHERE user_id = $1 ORDER BY name',
            [req.userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create template
router.post('/templates', async (req: AuthRequest, res) => {
    try {
        const { name, items } = req.body;
        const cleanedName = typeof name === 'string' ? name.trim() : '';
        const normalizedItems = Array.isArray(items) ? items : [];

        if (!cleanedName || normalizedItems.length === 0) {
            return res.status(400).json({ success: false, error: 'name and items are required' });
        }

        const result = await query(
            'INSERT INTO shopping_list_templates (user_id, name, items) VALUES ($1, $2, $3) RETURNING *',
            [req.userId, cleanedName, JSON.stringify(normalizedItems)]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Apply template to shopping list
router.post('/templates/:id/apply', async (req: AuthRequest, res) => {
    const client = await getClient();
    try {
        const { id } = req.params;

        const templateResult = await client.query(
            'SELECT items FROM shopping_list_templates WHERE id = $1 AND user_id = $2',
            [id, req.userId]
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
                ]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Template applied' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Apply template error:', error);
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
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }

        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
