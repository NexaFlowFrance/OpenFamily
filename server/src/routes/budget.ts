import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';
import { broadcast } from '../lib/broadcaster';

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
router.post('/entries', requireParent, async (req: AuthRequest, res) => {
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

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'created' });
        res.json({ success: true, data: mapBudgetEntry(full.rows[0]) });
    } catch (error) {
        console.error('Create budget entry error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update budget entry
router.put('/entries/:id', requireParent, async (req: AuthRequest, res) => {
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

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
        res.json({ success: true, data: mapBudgetEntry(full.rows[0]) });
    } catch (error) {
        console.error('Update budget entry error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete budget entry
router.delete('/entries/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM budget_entries WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Budget entry not found' });
        }

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'deleted' });
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
router.post('/limits', requireParent, async (req: AuthRequest, res) => {
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

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
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

// ─── Recurring Expenses ───────────────────────────────────────────────────────

const mapRecurringExpense = (row: any) => ({
    ...row,
    amount: toNumber(row.amount),
    debit_day: toNumber(row.debit_day),
    is_active: Boolean(row.is_active),
    is_pointed: Boolean(row.is_pointed),
});

// List recurring expenses with their pointing status for a given month/year
router.get('/recurring', async (req: AuthRequest, res) => {
    try {
        const { month, year } = req.query;
        const parsedMonth = toOptionalNumber(month);
        const parsedYear = toOptionalNumber(year);

        const result = await query(
            `SELECT re.*,
                COALESCE(rel.is_pointed, false) as is_pointed,
                rel.pointed_at
             FROM recurring_expenses re
             LEFT JOIN recurring_expense_logs rel
               ON rel.recurring_expense_id = re.id
               AND rel.month = $2
               AND rel.year = $3
             WHERE re.user_id = $1 AND re.is_active = true
             ORDER BY re.debit_day ASC, re.label ASC`,
            [req.userId, parsedMonth ?? new Date().getMonth() + 1, parsedYear ?? new Date().getFullYear()]
        );

        res.json({ success: true, data: result.rows.map(mapRecurringExpense) });
    } catch (error) {
        console.error('Get recurring expenses error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create recurring expense
router.post('/recurring', requireParent, async (req: AuthRequest, res) => {
    try {
        const { label, amount, category, debit_day } = req.body;
        const parsedAmount = toOptionalNumber(amount);
        const parsedDay = toOptionalNumber(debit_day);

        if (!label || parsedAmount === null || parsedAmount <= 0) {
            return res.status(400).json({ success: false, error: 'label and amount are required' });
        }

        const day = parsedDay !== null && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : 1;

        const result = await query(
            `INSERT INTO recurring_expenses (user_id, label, amount, category, debit_day)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.userId, label, parsedAmount, category || 'Maison', day]
        );

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'created' });
        res.json({ success: true, data: mapRecurringExpense({ ...result.rows[0], is_pointed: false }) });
    } catch (error) {
        console.error('Create recurring expense error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update recurring expense
router.put('/recurring/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { label, amount, category, debit_day, is_active } = req.body;
        const parsedAmount = amount !== undefined ? toOptionalNumber(amount) : undefined;
        const parsedDay = debit_day !== undefined ? toOptionalNumber(debit_day) : undefined;

        const result = await query(
            `UPDATE recurring_expenses
             SET label = COALESCE($1, label),
                 amount = COALESCE($2, amount),
                 category = COALESCE($3, category),
                 debit_day = COALESCE($4, debit_day),
                 is_active = COALESCE($5, is_active),
                 updated_at = NOW()
             WHERE id = $6 AND user_id = $7 RETURNING *`,
            [
                label ?? null,
                parsedAmount ?? null,
                category ?? null,
                parsedDay ?? null,
                is_active !== undefined ? Boolean(is_active) : null,
                id,
                req.userId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recurring expense not found' });
        }

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
        res.json({ success: true, data: mapRecurringExpense({ ...result.rows[0], is_pointed: false }) });
    } catch (error) {
        console.error('Update recurring expense error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete recurring expense
router.delete('/recurring/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM recurring_expenses WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recurring expense not found' });
        }

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'deleted' });
        res.json({ success: true, message: 'Recurring expense deleted' });
    } catch (error) {
        console.error('Delete recurring expense error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Toggle pointing status for a recurring expense for a given month/year
router.post('/recurring/:id/point', requireParent, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { month, year, is_pointed } = req.body;
        const parsedMonth = toOptionalNumber(month);
        const parsedYear = toOptionalNumber(year);

        if (parsedMonth === null || parsedYear === null) {
            return res.status(400).json({ success: false, error: 'month and year are required' });
        }

        // Verify the recurring expense belongs to the user
        const check = await query(
            'SELECT id FROM recurring_expenses WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recurring expense not found' });
        }

        const pointed = Boolean(is_pointed);
        const result = await query(
            `INSERT INTO recurring_expense_logs (recurring_expense_id, user_id, month, year, is_pointed, pointed_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (recurring_expense_id, month, year)
             DO UPDATE SET is_pointed = $5, pointed_at = $6
             RETURNING *`,
            [id, req.userId, parsedMonth, parsedYear, pointed, pointed ? new Date() : null]
        );

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
        res.json({ success: true, data: { ...result.rows[0], is_pointed: Boolean(result.rows[0].is_pointed) } });
    } catch (error) {
        console.error('Point recurring expense error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get forecast for a month (current balance + upcoming recurring expenses)
router.get('/forecast', async (req: AuthRequest, res) => {
    try {
        const { month, year } = req.query;
        const parsedMonth = toOptionalNumber(month);
        const parsedYear = toOptionalNumber(year);

        if (parsedMonth === null || parsedYear === null) {
            return res.status(400).json({ success: false, error: 'month and year are required' });
        }

        // All budget entries for the month (one-time expenses & income)
        const totals = await query(
            `SELECT
               SUM(amount) FILTER (WHERE is_expense = false) as total_income,
               SUM(amount) FILTER (WHERE is_expense = true) as total_expenses
             FROM budget_entries
             WHERE user_id = $1
               AND EXTRACT(MONTH FROM date) = $2
               AND EXTRACT(YEAR FROM date) = $3`,
            [req.userId, parsedMonth, parsedYear]
        );

        // Pointed recurring expenses total
        const pointedRecurring = await query(
            `SELECT COALESCE(SUM(re.amount), 0) as total
             FROM recurring_expenses re
             INNER JOIN recurring_expense_logs rel
               ON rel.recurring_expense_id = re.id
               AND rel.month = $2
               AND rel.year = $3
               AND rel.is_pointed = true
             WHERE re.user_id = $1 AND re.is_active = true`,
            [req.userId, parsedMonth, parsedYear]
        );

        // Unpointed recurring expenses total
        const unpointedRecurring = await query(
            `SELECT COALESCE(SUM(re.amount), 0) as total
             FROM recurring_expenses re
             LEFT JOIN recurring_expense_logs rel
               ON rel.recurring_expense_id = re.id
               AND rel.month = $2
               AND rel.year = $3
             WHERE re.user_id = $1 AND re.is_active = true
               AND (rel.is_pointed IS NULL OR rel.is_pointed = false)`,
            [req.userId, parsedMonth, parsedYear]
        );

        const income = toNumber(totals.rows[0]?.total_income);
        const oneTimeExpenses = toNumber(totals.rows[0]?.total_expenses);
        const pointed = toNumber(pointedRecurring.rows[0]?.total);
        const unpointed = toNumber(unpointedRecurring.rows[0]?.total);

        // Solde actuel = revenus - dépenses ponctuelles - prélèvements déjà pointés
        const currentBalance = income - oneTimeExpenses - pointed;
        // Prévisionnel = solde actuel - prélèvements restants à pointer
        const forecastBalance = currentBalance - unpointed;

        res.json({
            success: true,
            data: {
                income,
                oneTimeExpenses,
                pointedRecurring: pointed,
                unpointedRecurring: unpointed,
                currentBalance,
                forecastBalance,
            },
        });
    } catch (error) {
        console.error('Get forecast error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
