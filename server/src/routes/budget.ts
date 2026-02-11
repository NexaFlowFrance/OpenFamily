import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';

const router = Router();
router.use(authMiddleware);

const toNumber = (value: unknown): number => {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const mapBudgetEntry = (row: any) => ({
    ...row,
    amount: toNumber(row.amount),
    is_expense: Boolean(row.is_expense),
});

const mapBudgetLimit = (row: any) => ({
    ...row,
    monthly_limit: toNumber(row.monthly_limit),
    month: toNumber(row.month),
    year: toNumber(row.year),
});

// Get budget entries
router.get('/entries', async (req: AuthRequest, res) => {
    try {
        const { start_date, end_date, category } = req.query;

        let queryText = 'SELECT * FROM budget_entries WHERE user_id = $1';
        const params: any[] = [req.userId];

        if (start_date) {
            params.push(start_date);
            queryText += ` AND date >= $${params.length}`;
        }

        if (end_date) {
            params.push(end_date);
            queryText += ` AND date <= $${params.length}`;
        }

        if (category) {
            params.push(category);
            queryText += ` AND category = $${params.length}`;
        }

        queryText += ' ORDER BY date DESC';

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows.map(mapBudgetEntry) });
    } catch (error) {
        console.error('Get budget entries error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create budget entry
router.post('/entries', async (req: AuthRequest, res) => {
    try {
        const { category, amount, description, date, is_expense } = req.body;
        const parsedAmount = toOptionalNumber(amount);

        if (!category || parsedAmount === null || !date) {
            return res.status(400).json({ success: false, error: 'category, amount and date are required' });
        }

        const result = await query(
            `INSERT INTO budget_entries (user_id, category, amount, description, date, is_expense)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.userId, category, parsedAmount, toNullIfEmpty(description), date, Boolean(is_expense)]
        );

        res.json({ success: true, data: mapBudgetEntry(result.rows[0]) });
    } catch (error) {
        console.error('Create budget entry error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update budget entry
router.put('/entries/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { category, amount, description, date, is_expense } = req.body;
        const parsedAmount = amount !== undefined ? toOptionalNumber(amount) : undefined;

        if (amount !== undefined && parsedAmount === null) {
            return res.status(400).json({ success: false, error: 'Invalid amount format' });
        }

        const result = await query(
            `UPDATE budget_entries 
       SET category = COALESCE($1, category),
           amount = COALESCE($2, amount),
           description = COALESCE($3, description),
           date = COALESCE($4, date),
           is_expense = COALESCE($5, is_expense)
       WHERE id = $6 AND user_id = $7 RETURNING *`,
            [
                toNullIfEmpty(category),
                parsedAmount,
                toNullIfEmpty(description),
                toNullIfEmpty(date),
                is_expense !== undefined ? Boolean(is_expense) : undefined,
                id,
                req.userId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Budget entry not found' });
        }

        res.json({ success: true, data: mapBudgetEntry(result.rows[0]) });
    } catch (error) {
        console.error('Update budget entry error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete budget entry
router.delete('/entries/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM budget_entries WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Budget entry not found' });
        }

        res.json({ success: true, message: 'Budget entry deleted' });
    } catch (error) {
        console.error('Delete budget entry error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get budget limits
router.get('/limits', async (req: AuthRequest, res) => {
    try {
        const { month, year } = req.query;

        let queryText = 'SELECT * FROM budget_limits WHERE user_id = $1';
        const params: any[] = [req.userId];

        if (month) {
            params.push(month);
            queryText += ` AND month = $${params.length}`;
        }

        if (year) {
            params.push(year);
            queryText += ` AND year = $${params.length}`;
        }

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows.map(mapBudgetLimit) });
    } catch (error) {
        console.error('Get budget limits error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Set budget limit
router.post('/limits', async (req: AuthRequest, res) => {
    try {
        const { category, monthly_limit, month, year } = req.body;
        const parsedLimit = toOptionalNumber(monthly_limit);
        const parsedMonth = toOptionalNumber(month);
        const parsedYear = toOptionalNumber(year);

        if (!category || parsedLimit === null || parsedMonth === null || parsedYear === null) {
            return res.status(400).json({ success: false, error: 'category, monthly_limit, month and year are required' });
        }

        const result = await query(
            `INSERT INTO budget_limits (user_id, category, monthly_limit, month, year)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, category, month, year)
       DO UPDATE SET monthly_limit = $3
       RETURNING *`,
            [req.userId, category, parsedLimit, parsedMonth, parsedYear]
        );

        res.json({ success: true, data: mapBudgetLimit(result.rows[0]) });
    } catch (error) {
        console.error('Set budget limit error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get budget statistics
router.get('/statistics', async (req: AuthRequest, res) => {
    try {
        const { month, year } = req.query;
        const parsedMonth = toOptionalNumber(month);
        const parsedYear = toOptionalNumber(year);

        if (parsedMonth === null || parsedYear === null) {
            return res.status(400).json({ success: false, error: 'month and year are required' });
        }

        const result = await query(
            `SELECT 
         category,
         SUM(amount) as category_total
       FROM budget_entries 
       WHERE user_id = $1 
         AND is_expense = true
         AND EXTRACT(MONTH FROM date) = $2 
         AND EXTRACT(YEAR FROM date) = $3
       GROUP BY category`,
            [req.userId, parsedMonth, parsedYear]
        );

        const totals = await query(
            `SELECT 
         SUM(amount) FILTER (WHERE is_expense = true) as total_expenses,
         SUM(amount) FILTER (WHERE is_expense = false) as total_income
       FROM budget_entries 
       WHERE user_id = $1 
         AND EXTRACT(MONTH FROM date) = $2 
         AND EXTRACT(YEAR FROM date) = $3`,
            [req.userId, parsedMonth, parsedYear]
        );

        const totalExpenses = parseFloat(totals.rows[0]?.total_expenses || '0');
        const totalIncome = parseFloat(totals.rows[0]?.total_income || '0');

        res.json({
            success: true,
            data: {
                totalExpenses,
                totalIncome,
                balance: totalIncome - totalExpenses,
                byCategory: result.rows.map((row) => ({
                    category: row.category,
                    category_total: toNumber(row.category_total),
                })),
            }
        });
    } catch (error) {
        console.error('Get budget statistics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
