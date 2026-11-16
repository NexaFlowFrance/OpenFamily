import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';
import { isBarcode, lookupBarcode } from '../lib/barcodeLookup';
import { writingLanguage } from '../lib/languages';

// The pantry: what the family has at home, where it is kept, and until when
// it is good. A barcode can name a product (lib/barcodeLookup).

const router = Router();
router.use(authMiddleware);

export const PANTRY_LOCATIONS = ['fridge', 'freezer', 'cupboard', 'other'] as const;
const MAX_NAME = 255;
const MAX_UNIT = 50;
const MAX_NOTES = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isDay = (value: string): boolean => {
    if (!DAY.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

class Refused extends Error {}

/**
 * The fields of a request, checked. A field that is absent is left out, so
 * that a change touches only what was sent; an empty one is stored as nothing.
 */
const readFields = (body: Record<string, unknown>): Record<string, unknown> => {
    const fields: Record<string, unknown> = {};
    const empty = (value: unknown) => value === null || value === '';

    if ('name' in body) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > MAX_NAME) throw new Refused('name is required, up to 255 characters');
        fields.name = name;
    }
    if ('quantity' in body) {
        if (empty(body.quantity)) fields.quantity = null;
        else {
            const quantity = typeof body.quantity === 'string' ? Number(body.quantity.replace(',', '.')) : body.quantity;
            if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || quantity > 99999999) {
                throw new Refused('quantity must be a number, zero or more');
            }
            fields.quantity = quantity;
        }
    }
    if ('unit' in body) {
        if (empty(body.unit)) fields.unit = null;
        else if (typeof body.unit !== 'string' || body.unit.trim().length > MAX_UNIT) throw new Refused('unit is a short text');
        else fields.unit = body.unit.trim() || null;
    }
    if ('location' in body) {
        if (!(PANTRY_LOCATIONS as readonly unknown[]).includes(body.location)) {
            throw new Refused(`location is one of: ${PANTRY_LOCATIONS.join(', ')}`);
        }
        fields.location = body.location;
    }
    if ('expires_on' in body) {
        if (empty(body.expires_on)) fields.expires_on = null;
        else if (typeof body.expires_on !== 'string' || !isDay(body.expires_on)) throw new Refused('expires_on is a day, as YYYY-MM-DD');
        else fields.expires_on = body.expires_on;
    }
    if ('barcode' in body) {
        if (empty(body.barcode)) fields.barcode = null;
        else if (!isBarcode(body.barcode)) throw new Refused('barcode is made of 6 to 20 digits');
        else fields.barcode = body.barcode;
    }
    if ('notes' in body) {
        if (empty(body.notes)) fields.notes = null;
        else if (typeof body.notes !== 'string' || body.notes.length > MAX_NOTES) throw new Refused('notes is a text of up to 1000 characters');
        else fields.notes = body.notes.trim() || null;
    }
    return fields;
};

// What is good for the shortest time comes first; what has no date, last.
router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM pantry_items WHERE user_id = $1 ORDER BY expires_on ASC NULLS LAST, LOWER(name), created_at',
            [req.userId],
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get pantry error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// What a barcode is the barcode of. The family's own pantry answers first: a
// product it already named keeps the name it gave. Otherwise Open Food Facts
// is asked, with the digits of the barcode and nothing else.
router.get('/lookup/:barcode', async (req: AuthRequest, res) => {
    try {
        const { barcode } = req.params;
        if (!isBarcode(barcode)) {
            return res.status(400).json({ success: false, error: 'invalid_barcode' });
        }

        const known = await query(
            `SELECT name, unit, location FROM pantry_items
             WHERE user_id = $1 AND barcode = $2 ORDER BY updated_at DESC LIMIT 1`,
            [req.userId, barcode],
        );
        if (known.rows.length > 0) {
            const { name, unit, location } = known.rows[0];
            return res.json({ success: true, data: { source: 'pantry', barcode, name, brand: null, package: null, unit, location } });
        }

        const reader = await query('SELECT language FROM users WHERE id = $1', [req.actualUserId]);
        const answer = await lookupBarcode(barcode, writingLanguage(reader.rows[0]?.language));
        if (answer.found === null) {
            return res.status(502).json({ success: false, error: 'lookup_unavailable' });
        }
        if (!answer.found) {
            return res.status(404).json({ success: false, error: 'unknown_barcode' });
        }
        return res.json({ success: true, data: { source: 'openfoodfacts', barcode, ...answer.product, unit: null, location: null } });
    } catch (error) {
        console.error('Pantry lookup error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        const fields = readFields({ name: undefined, ...(req.body ?? {}) });
        const columns = Object.keys(fields);
        const result = await query(
            `INSERT INTO pantry_items (user_id, ${columns.join(', ')})
             VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(', ')}) RETURNING *`,
            [req.userId, ...columns.map((column) => fields[column])],
        );
        broadcast(req.userId!, { type: 'update', entity: 'pantry', action: 'created' });
        return res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof Refused) return res.status(400).json({ success: false, error: error.message });
        console.error('Create pantry item error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        if (!UUID.test(id)) return res.status(404).json({ success: false, error: 'Item not found' });

        const fields = readFields(req.body ?? {});
        const columns = Object.keys(fields);
        if (columns.length === 0) return res.status(400).json({ success: false, error: 'Nothing to change' });

        const result = await query(
            `UPDATE pantry_items SET ${columns.map((column, index) => `${column} = $${index + 3}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [id, req.userId, ...columns.map((column) => fields[column])],
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });

        broadcast(req.userId!, { type: 'update', entity: 'pantry', action: 'updated' });
        return res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof Refused) return res.status(400).json({ success: false, error: error.message });
        console.error('Update pantry item error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        if (!UUID.test(id)) return res.status(404).json({ success: false, error: 'Item not found' });

        const result = await query('DELETE FROM pantry_items WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.userId]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });

        broadcast(req.userId!, { type: 'update', entity: 'pantry', action: 'deleted' });
        return res.json({ success: true, data: { id } });
    } catch (error) {
        console.error('Delete pantry item error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
