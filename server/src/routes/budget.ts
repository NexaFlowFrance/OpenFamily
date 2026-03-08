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
        const { start_date, end_date, category, assigned_to } = req.query;

        let queryText = `SELECT be.*, fm.name as assigned_to_name, fm.color as assigned_to_color
            FROM budget_entries be
            LEFT JOIN family_members fm ON be.assigned_to = fm.id
            WHERE be.user_id = $1`;
        const params: any[] = [req.userId];

        if (start_date) {
            params.push(start_date);
            queryText += ` AND be.date >= $${params.length}`;
        }

        if (end_date) {
            params.push(end_date);
            queryText += ` AND be.date <= $${params.length}`;
        }

        if (category) {
            params.push(category);
            queryText += ` AND be.category = $${params.length}`;
        }

        if (assigned_to) {
            params.push(assigned_to);
            queryText += ` AND be.assigned_to = $${params.length}`;
        }

        queryText += ' ORDER BY be.date DESC';

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
        const { category, amount, description, date, is_expense, assigned_to } = req.body;
        const parsedAmount = toOptionalNumber(amount);

        if (!category || parsedAmount === null || !date) {
            return res.status(400).json({ success: false, error: 'category, amount and date are required' });
        }

        const result = await query(
            `INSERT INTO budget_entries (user_id, category, amount, description, date, is_expense, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.userId, category, parsedAmount, toNullIfEmpty(description), date, Boolean(is_expense), toNullIfEmpty(assigned_to)]
        );

        // Re-fetch with JOIN to get member name/color
        const full = await query(
            `SELECT be.*, fm.name as assigned_to_name, fm.color as assigned_to_color
             FROM budget_entries be LEFT JOIN family_members fm ON be.assigned_to = fm.id
             WHERE be.id = $1`, [result.rows[0].id]
        );

        res.json({ success: true, data: mapBudgetEntry(full.rows[0]) });
    } catch (error) {
        console.error('Create budget entry error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update budget entry
router.put('/entries/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { category, amount, description, date, is_expense, assigned_to } = req.body;
        const parsedAmount = amount !== undefined ? toOptionalNumber(amount) : undefined;

        if (amount !== undefined && parsedAmount === null) {
            return res.status(400).json({ success: false, error: 'Invalid amount format' });
        }

        // Handle assigned_to: allow explicit null to unassign
        const assignedToValue = assigned_to === '' || assigned_to === null ? null : assigned_to;

        const result = await query(
            `UPDATE budget_entries
       SET category = COALESCE($1, category),
           amount = COALESCE($2, amount),
           description = COALESCE($3, description),
           date = COALESCE($4, date),
           is_expense = COALESCE($5, is_expense),
           assigned_to = $6
       WHERE id = $7 AND user_id = $8 RETURNING *`,
            [
                toNullIfEmpty(category),
                parsedAmount,
                toNullIfEmpty(description),
                toNullIfEmpty(date),
                is_expense !== undefined ? Boolean(is_expense) : undefined,
                assignedToValue !== undefined ? assignedToValue : null,
                id,
                req.userId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Budget entry not found' });
        }

        // Re-fetch with JOIN
        const full = await query(
            `SELECT be.*, fm.name as assigned_to_name, fm.color as assigned_to_color
             FROM budget_entries be LEFT JOIN family_members fm ON be.assigned_to = fm.id
             WHERE be.id = $1`, [id]
        );

        res.json({ success: true, data: mapBudgetEntry(full.rows[0]) });
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

        // Per-member spending breakdown by category (for stacked bar chart)
        const byMember = await query(
            `SELECT
         fm.id as assigned_to,
         fm.name as member_name,
         fm.color as member_color,
         be.category,
         SUM(be.amount) as amount
       FROM budget_entries be
       INNER JOIN family_members fm ON be.assigned_to = fm.id
       WHERE be.user_id = $1
         AND be.is_expense = true
         AND EXTRACT(MONTH FROM be.date) = $2
         AND EXTRACT(YEAR FROM be.date) = $3
       GROUP BY fm.id, fm.name, fm.color, be.category
       ORDER BY fm.name, be.category`,
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
                byMember: byMember.rows.map((row) => ({
                    assigned_to: row.assigned_to,
                    member_name: row.member_name,
                    member_color: row.member_color,
                    category: row.category,
                    amount: toNumber(row.amount),
                })),
            }
        });
    } catch (error) {
        console.error('Get budget statistics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get monthly budget statistics for a year
router.get('/statistics/monthly', async (req: AuthRequest, res) => {
    try {
        const { year } = req.query;
        const parsedYear = toOptionalNumber(year);

        if (parsedYear === null) {
            return res.status(400).json({ success: false, error: 'year is required' });
        }

        const result = await query(
            `SELECT
         EXTRACT(MONTH FROM date)::int as month,
         SUM(amount) FILTER (WHERE is_expense = true) as total_expenses,
         SUM(amount) FILTER (WHERE is_expense = false) as total_income
       FROM budget_entries
       WHERE user_id = $1
         AND EXTRACT(YEAR FROM date) = $2
       GROUP BY EXTRACT(MONTH FROM date)
       ORDER BY month`,
            [req.userId, parsedYear]
        );

        const monthlyData = Array.from({ length: 12 }, (_, i) => {
            const monthNum = i + 1;
            const row = result.rows.find((r) => r.month === monthNum);
            return {
                month: monthNum,
                totalExpenses: row ? toNumber(row.total_expenses) : 0,
                totalIncome: row ? toNumber(row.total_income) : 0,
                balance: row ? toNumber(row.total_income) - toNumber(row.total_expenses) : 0,
            };
        });

        res.json({ success: true, data: monthlyData });
    } catch (error) {
        console.error('Get monthly budget statistics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
