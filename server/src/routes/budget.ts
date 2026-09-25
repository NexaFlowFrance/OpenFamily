import { Router } from 'express';
import { query, getClient } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';
import { broadcast } from '../lib/broadcaster';
import {
    type RecurringFrequency,
    normalizeRecurringFrequency,
    normalizeRecurringInterval,
    parseDateOnly,
    formatDateOnly,
    expandRecurringTransactions,
} from '../lib/budgetRecurrence';

const router = Router();
router.use(authMiddleware);

// A budget entry can be assigned to a family member, and that id comes from the
// client — so verify it belongs to THIS family before storing it (same guard as
// planning / tasks / appointments / rewards). Without it a family could store
// another family's member id and read its name/color back through the JOINs below.
const ensureMemberBelongsToUser = async (memberId: unknown, userId: string): Promise<boolean> => {
    if (typeof memberId !== 'string' || !memberId.trim()) {
        return false;
    }
    const result = await query(
        'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
        [memberId, userId]
    );
    return result.rows.length > 0;
};

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

const dateOnlyValue = (value: unknown): string => {
    if (value instanceof Date) {
        return formatDateOnly(value);
    }
    return String(value ?? '').slice(0, 10);
};

const calendarDayTimes = (dateValue: unknown) => {
    const date = dateOnlyValue(dateValue);
    return {
        start: `${date}T00:00:00`,
        end: `${date}T23:59:59`,
    };
};

// Keep a one-time Budget entry linked to one all-day Calendar Event.
// enabled === undefined means "sync it if it is already linked, but don't
// create a new Calendar Event".
const syncBudgetEntryCalendar = async (
    userId: string,
    entry: any,
    enabled?: boolean
) => {
    const existing = await query(
        `SELECT id
         FROM appointments
         WHERE user_id = $1 AND linked_budget_entry_id = $2
         LIMIT 1`,
        [userId, entry.id]
    );

    const alreadyLinked = existing.rows.length > 0;
    const shouldHaveCalendar =
        enabled === undefined ? alreadyLinked : Boolean(enabled);

    if (!shouldHaveCalendar) {
        if (alreadyLinked) {
            await query(
                `DELETE FROM appointments
                 WHERE user_id = $1 AND linked_budget_entry_id = $2`,
                [userId, entry.id]
            );
            broadcast(userId, {
                type: 'update',
                entity: 'appointments',
                action: 'deleted',
            });
        }
        return;
    }

    const times = calendarDayTimes(entry.date);
    const title =
        String(entry.description || '').trim() ||
        String(entry.category || 'Budget');
    const defaultColor = entry.is_expense === false ? '#10B981' : '#DC4A60';

    if (alreadyLinked) {
        await query(
            `UPDATE appointments
             SET title = $1,
                 start_time = $2,
                 end_time = $3,
                 is_all_day = true,
                 recurrence_frequency = 'none',
                 recurrence_interval = 1,
                 recurrence_until = NULL
             WHERE id = $4 AND user_id = $5`,
            [
                title,
                times.start,
                times.end,
                existing.rows[0].id,
                userId,
            ]
        );
    } else {
        await query(
            `INSERT INTO appointments (
                user_id,
                title,
                description,
                start_time,
                end_time,
                location,
                family_member_ids,
                reminder_30min,
                reminder_1hour,
                notes,
                recurrence_frequency,
                recurrence_interval,
                recurrence_until,
                color,
                is_all_day,
                linked_budget_entry_id
             )
             VALUES (
                $1, $2, NULL, $3, $4, NULL, '[]'::jsonb,
                false, false, NULL,
                'none', 1, NULL, $5, true, $6
             )`,
            [userId, title, times.start, times.end, defaultColor, entry.id]
        );
    }

    broadcast(userId, {
        type: 'update',
        entity: 'appointments',
        action: alreadyLinked ? 'updated' : 'created',
    });
};

// Keep a recurring Budget transaction linked to an all-day recurring Calendar Event.
const syncRecurringTransactionCalendar = async (
    userId: string,
    recurring: any,
    enabled?: boolean
) => {
    const existing = await query(
        `SELECT id
         FROM appointments
         WHERE user_id = $1 AND linked_recurring_expense_id = $2
         LIMIT 1`,
        [userId, recurring.id]
    );

    const alreadyLinked = existing.rows.length > 0;
    const shouldHaveCalendar =
        enabled === undefined ? alreadyLinked : Boolean(enabled);

    if (!shouldHaveCalendar) {
        if (alreadyLinked) {
            await query(
                `DELETE FROM appointments
                 WHERE user_id = $1 AND linked_recurring_expense_id = $2`,
                [userId, recurring.id]
            );
            broadcast(userId, {
                type: 'update',
                entity: 'appointments',
                action: 'deleted',
            });
        }
        return;
    }

    const times = calendarDayTimes(recurring.start_date);
    const frequency =
        normalizeRecurringFrequency(recurring.recurrence_frequency);
    const interval =
        normalizeRecurringInterval(recurring.recurrence_interval);
    const untilValue = recurring.recurrence_until
        ? dateOnlyValue(recurring.recurrence_until)
        : null;
    const defaultColor = recurring.is_expense === false ? '#10B981' : '#DC4A60';

    if (alreadyLinked) {
        await query(
            `UPDATE appointments
             SET title = $1,
                 start_time = $2,
                 end_time = $3,
                 is_all_day = true,
                 recurrence_frequency = $4,
                 recurrence_interval = $5,
                 recurrence_until = $6::date
             WHERE id = $7 AND user_id = $8`,
            [
                recurring.label,
                times.start,
                times.end,
                frequency,
                interval,
                untilValue,
                existing.rows[0].id,
                userId,
            ]
        );
    } else {
        await query(
            `INSERT INTO appointments (
                user_id,
                title,
                description,
                start_time,
                end_time,
                location,
                family_member_ids,
                reminder_30min,
                reminder_1hour,
                notes,
                recurrence_frequency,
                recurrence_interval,
                recurrence_until,
                color,
                is_all_day,
                linked_recurring_expense_id
             )
             VALUES (
                $1, $2, NULL, $3, $4, NULL, '[]'::jsonb,
                false, false, NULL,
                $5, $6, $7::date, $8, true, $9
             )`,
            [
                userId,
                recurring.label,
                times.start,
                times.end,
                frequency,
                interval,
                untilValue,
                defaultColor,
                recurring.id,
            ]
        );
    }

    broadcast(userId, {
        type: 'update',
        entity: 'appointments',
        action: alreadyLinked ? 'updated' : 'created',
    });
};

// Get budget entries
router.get('/entries', async (req: AuthRequest, res) => {
    try {
        const { start_date, end_date, category, assigned_to } = req.query;

        let queryText = `SELECT be.*,
                   (SELECT a.id
                    FROM appointments a
                    WHERE a.user_id = be.user_id
                      AND a.linked_budget_entry_id = be.id
                    LIMIT 1) as linked_calendar_event_id,
                   fm.name as assigned_to_name,
                   fm.color as assigned_to_color
            FROM budget_entries be
            LEFT JOIN family_members fm ON be.assigned_to = fm.id AND fm.user_id = be.user_id
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
        const {
            category,
            amount,
            description,
            date,
            is_expense,
            assigned_to,
            add_to_calendar,
        } = req.body;
        const parsedAmount = toOptionalNumber(amount);

        if (!category || parsedAmount === null || !date) {
            return res.status(400).json({ success: false, error: 'category, amount and date are required' });
        }

        const assignedTo = toNullIfEmpty(assigned_to) as string | null;
        if (assignedTo && !(await ensureMemberBelongsToUser(assignedTo, req.userId!))) {
            return res.status(400).json({ success: false, error: 'Member not found' });
        }

        const result = await query(
            `INSERT INTO budget_entries (user_id, category, amount, description, date, is_expense, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.userId, category, parsedAmount, toNullIfEmpty(description), date, Boolean(is_expense), assignedTo]
        );

        await syncBudgetEntryCalendar(
            req.userId!,
            result.rows[0],
            Boolean(add_to_calendar)
        );

        // Re-fetch with JOIN to get member name/color
        const full = await query(
            `SELECT be.*, fm.name as assigned_to_name, fm.color as assigned_to_color
             FROM budget_entries be LEFT JOIN family_members fm ON be.assigned_to = fm.id AND fm.user_id = be.user_id
             WHERE be.id = $1 AND be.user_id = $2`, [result.rows[0].id, req.userId]
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
        const {
            category,
            amount,
            description,
            date,
            is_expense,
            assigned_to,
            add_to_calendar,
        } = req.body;
        const parsedAmount = amount !== undefined ? toOptionalNumber(amount) : undefined;

        if (amount !== undefined && parsedAmount === null) {
            return res.status(400).json({ success: false, error: 'Invalid amount format' });
        }

        // Handle assigned_to: allow explicit null to unassign
        const assignedToValue = assigned_to === '' || assigned_to === null ? null : assigned_to;

        if (assignedToValue && !(await ensureMemberBelongsToUser(assignedToValue, req.userId!))) {
            return res.status(400).json({ success: false, error: 'Member not found' });
        }

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

        await syncBudgetEntryCalendar(
            req.userId!,
            result.rows[0],
            add_to_calendar !== undefined
                ? Boolean(add_to_calendar)
                : undefined
        );

        // Re-fetch with JOIN
        const full = await query(
            `SELECT be.*, fm.name as assigned_to_name, fm.color as assigned_to_color
             FROM budget_entries be LEFT JOIN family_members fm ON be.assigned_to = fm.id AND fm.user_id = be.user_id
             WHERE be.id = $1 AND be.user_id = $2`, [id, req.userId]
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

        await query(
            `DELETE FROM appointments
             WHERE linked_budget_entry_id = $1 AND user_id = $2`,
            [id, req.userId]
        );

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

        const entryCategories = await query(
            `SELECT category, SUM(amount) as category_total
             FROM budget_entries
             WHERE user_id = $1
               AND is_expense = true
               AND EXTRACT(MONTH FROM date) = $2
               AND EXTRACT(YEAR FROM date) = $3
             GROUP BY category`,
            [req.userId, parsedMonth, parsedYear]
        );

        const entryTotals = await query(
            `SELECT
                 SUM(amount) FILTER (WHERE is_expense = true) as total_expenses,
                 SUM(amount) FILTER (WHERE is_expense = false) as total_income
             FROM budget_entries
             WHERE user_id = $1
               AND EXTRACT(MONTH FROM date) = $2
               AND EXTRACT(YEAR FROM date) = $3`,
            [req.userId, parsedMonth, parsedYear]
        );

        const byMember = await query(
            `SELECT
                 fm.id as assigned_to,
                 fm.name as member_name,
                 fm.color as member_color,
                 be.category,
                 SUM(be.amount) as amount
             FROM budget_entries be
             INNER JOIN family_members fm
                ON be.assigned_to = fm.id AND fm.user_id = be.user_id
             WHERE be.user_id = $1
               AND be.is_expense = true
               AND EXTRACT(MONTH FROM be.date) = $2
               AND EXTRACT(YEAR FROM be.date) = $3
             GROUP BY fm.id, fm.name, fm.color, be.category
             ORDER BY fm.name, be.category`,
            [req.userId, parsedMonth, parsedYear]
        );

        const range = getMonthRange(parsedYear, parsedMonth);
        const recurringSeriesResult = await query(
            `SELECT *
             FROM recurring_expenses
             WHERE user_id = $1
               AND is_active = true
               AND start_date <= $3::date
               AND (recurrence_until IS NULL OR recurrence_until >= $2::date)`,
            [req.userId, range.start, range.end]
        );

        const recurringOccurrences = expandRecurringTransactions(
            recurringSeriesResult.rows.map(mapRecurringTransaction),
            range.start,
            range.end
        );

        let recurringExpenses = 0;
        let recurringIncome = 0;
        const categoryTotals = new Map<string, number>();

        for (const row of entryCategories.rows) {
            categoryTotals.set(row.category, toNumber(row.category_total));
        }

        for (const occurrence of recurringOccurrences) {
            const amount = toNumber(occurrence.amount);
            if (occurrence.is_expense) {
                recurringExpenses += amount;
                const category = String(occurrence.category || 'Autre');
                categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
            } else {
                recurringIncome += amount;
            }
        }

        const totalExpenses =
            toNumber(entryTotals.rows[0]?.total_expenses) + recurringExpenses;
        const totalIncome =
            toNumber(entryTotals.rows[0]?.total_income) + recurringIncome;

        res.json({
            success: true,
            data: {
                totalExpenses,
                totalIncome,
                balance: totalIncome - totalExpenses,
                byCategory: Array.from(categoryTotals.entries()).map(
                    ([category, category_total]) => ({ category, category_total })
                ),
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

        const yearStart = `${parsedYear}-01-01`;
        const yearEnd = `${parsedYear}-12-31`;

        const recurringSeriesResult = await query(
            `SELECT *
             FROM recurring_expenses
             WHERE user_id = $1
               AND is_active = true
               AND start_date <= $3::date
               AND (recurrence_until IS NULL OR recurrence_until >= $2::date)`,
            [req.userId, yearStart, yearEnd]
        );

        const recurringOccurrences = expandRecurringTransactions(
            recurringSeriesResult.rows.map(mapRecurringTransaction),
            yearStart,
            yearEnd
        );

        const recurringByMonth = new Map<number, { income: number; expenses: number }>();

        for (const occurrence of recurringOccurrences) {
            const monthNum = Number(String(occurrence.occurrence_date).slice(5, 7));
            const bucket = recurringByMonth.get(monthNum) || { income: 0, expenses: 0 };
            if (occurrence.is_expense) {
                bucket.expenses += toNumber(occurrence.amount);
            } else {
                bucket.income += toNumber(occurrence.amount);
            }
            recurringByMonth.set(monthNum, bucket);
        }

        const monthlyData = Array.from({ length: 12 }, (_, i) => {
            const monthNum = i + 1;
            const row = result.rows.find((r) => r.month === monthNum);
            const recurring = recurringByMonth.get(monthNum) || { income: 0, expenses: 0 };
            const totalExpenses = (row ? toNumber(row.total_expenses) : 0) + recurring.expenses;
            const totalIncome = (row ? toNumber(row.total_income) : 0) + recurring.income;

            return {
                month: monthNum,
                totalExpenses,
                totalIncome,
                recurringExpenses: recurring.expenses,
                recurringIncome: recurring.income,
                balance: totalIncome - totalExpenses,
            };
        });

        res.json({ success: true, data: monthlyData });
    } catch (error) {
        console.error('Get monthly budget statistics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});


// Create or synchronize the Budget item linked to a Calendar Event.
// The Budget's existing parent-only permission still applies here.
router.post(
    '/from-appointment/:appointmentId',
    requireParent,
    async (req: AuthRequest, res) => {
        // Several writes (budget item, calendar link) that must land together:
        // one client, one transaction, so a failure never leaves an orphan.
        const client = await getClient();
        try {
            await client.query('BEGIN');
            const appointmentResult = await client.query(
                `SELECT *
                 FROM appointments
                 WHERE id = $1 AND user_id = $2`,
                [req.params.appointmentId, req.userId]
            );

            if (appointmentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Calendar event not found',
                });
            }

            const appointment = appointmentResult.rows[0];
            const startDate = parseDateOnly(String(appointment.start_time).slice(0, 10));

            if (!startDate) {
                return res.status(400).json({
                    success: false,
                    error: 'Calendar event has an invalid start date',
                });
            }

            let existingAmount: number | null = null;
            let existingCategory: string | null = null;
            let existingIsExpense: boolean | null = null;

            if (appointment.linked_budget_entry_id) {
                const existing = await client.query(
                    `SELECT amount, category, is_expense
                     FROM budget_entries
                     WHERE id = $1 AND user_id = $2`,
                    [appointment.linked_budget_entry_id, req.userId]
                );
                if (existing.rows.length > 0) {
                    existingAmount = toNumber(existing.rows[0].amount);
                    existingCategory = existing.rows[0].category;
                    existingIsExpense = Boolean(existing.rows[0].is_expense);
                }
            }

            if (appointment.linked_recurring_expense_id) {
                const existing = await client.query(
                    `SELECT amount, category, is_expense
                     FROM recurring_expenses
                     WHERE id = $1 AND user_id = $2`,
                    [appointment.linked_recurring_expense_id, req.userId]
                );
                if (existing.rows.length > 0) {
                    existingAmount = toNumber(existing.rows[0].amount);
                    existingCategory = existing.rows[0].category;
                    existingIsExpense = Boolean(existing.rows[0].is_expense);
                }
            }

            const requestedAmount =
                req.body.amount !== undefined ? toOptionalNumber(req.body.amount) : null;
            const amount = requestedAmount !== null ? requestedAmount : existingAmount;

            if (amount === null || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'A positive amount is required',
                });
            }

            const category =
                typeof req.body.category === 'string' && req.body.category.trim()
                    ? req.body.category.trim()
                    : existingCategory || 'Autre';

            const isExpense =
                req.body.is_expense !== undefined
                    ? Boolean(req.body.is_expense)
                    : existingIsExpense ?? true;

            const title = String(appointment.title || '').trim() || 'Calendar budget entry';
            const startDateValue = formatDateOnly(startDate);
            const recurrenceFrequency =
                String(appointment.recurrence_frequency || 'none').toLowerCase();

            let linkedBudgetEntryId: string | null = null;
            let linkedRecurringExpenseId: string | null = null;

            if (recurrenceFrequency === 'none') {
                if (appointment.linked_recurring_expense_id) {
                    // The event stopped repeating. End the series the day before
                    // instead of deleting it: deleting would cascade to every
                    // month already marked as paid, and that is the family's
                    // bookkeeping, not a detail of the calendar event.
                    await client.query(
                        `UPDATE recurring_expenses
                         SET recurrence_until = LEAST(
                                 COALESCE(recurrence_until, $1::date - 1),
                                 $1::date - 1
                             ),
                             updated_at = NOW()
                         WHERE id = $2 AND user_id = $3`,
                        [startDateValue, appointment.linked_recurring_expense_id, req.userId]
                    );
                }

                if (appointment.linked_budget_entry_id) {
                    const updated = await client.query(
                        `UPDATE budget_entries
                         SET category = $1,
                             amount = $2,
                             description = $3,
                             date = $4::date,
                             is_expense = $5
                         WHERE id = $6 AND user_id = $7
                         RETURNING id`,
                        [
                            category,
                            amount,
                            title,
                            startDateValue,
                            isExpense,
                            appointment.linked_budget_entry_id,
                            req.userId,
                        ]
                    );
                    if (updated.rows.length > 0) {
                        linkedBudgetEntryId = updated.rows[0].id;
                    }
                }

                if (!linkedBudgetEntryId) {
                    const created = await client.query(
                        `INSERT INTO budget_entries (
                            user_id, category, amount, description, date, is_expense, assigned_to
                         )
                         VALUES ($1, $2, $3, $4, $5::date, $6, NULL)
                         RETURNING id`,
                        [req.userId, category, amount, title, startDateValue, isExpense]
                    );
                    linkedBudgetEntryId = created.rows[0].id;
                }

                await client.query(
                    `UPDATE appointments
                     SET linked_budget_entry_id = $1,
                         linked_recurring_expense_id = NULL
                     WHERE id = $2 AND user_id = $3`,
                    [linkedBudgetEntryId, appointment.id, req.userId]
                );
            } else {
                if (appointment.linked_budget_entry_id) {
                    await client.query(
                        `DELETE FROM budget_entries
                         WHERE id = $1 AND user_id = $2`,
                        [appointment.linked_budget_entry_id, req.userId]
                    );
                }

                const frequency = normalizeRecurringFrequency(recurrenceFrequency);
                const interval = normalizeRecurringInterval(appointment.recurrence_interval);
                const untilValue = appointment.recurrence_until
                    ? String(appointment.recurrence_until).slice(0, 10)
                    : null;

                if (appointment.linked_recurring_expense_id) {
                    const updated = await client.query(
                        `UPDATE recurring_expenses
                         SET label = $1,
                             amount = $2,
                             category = $3,
                             debit_day = $4,
                             start_date = $5::date,
                             recurrence_frequency = $6,
                             recurrence_interval = $7,
                             recurrence_until = $8::date,
                             is_expense = $9,
                             is_active = true,
                             updated_at = NOW()
                         WHERE id = $10 AND user_id = $11
                         RETURNING id`,
                        [
                            title, amount, category, startDate.getUTCDate(), startDateValue,
                            frequency, interval, untilValue, isExpense,
                            appointment.linked_recurring_expense_id, req.userId,
                        ]
                    );
                    if (updated.rows.length > 0) {
                        linkedRecurringExpenseId = updated.rows[0].id;
                    }
                }

                if (!linkedRecurringExpenseId) {
                    const created = await client.query(
                        `INSERT INTO recurring_expenses (
                            user_id, label, amount, category, debit_day, start_date,
                            recurrence_frequency, recurrence_interval, recurrence_until, is_expense
                         )
                         VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9::date, $10)
                         RETURNING id`,
                        [
                            req.userId, title, amount, category, startDate.getUTCDate(),
                            startDateValue, frequency, interval, untilValue, isExpense,
                        ]
                    );
                    linkedRecurringExpenseId = created.rows[0].id;
                }

                await client.query(
                    `UPDATE appointments
                     SET linked_budget_entry_id = NULL,
                         linked_recurring_expense_id = $1
                     WHERE id = $2 AND user_id = $3`,
                    [linkedRecurringExpenseId, appointment.id, req.userId]
                );
            }

            await client.query('COMMIT');

            broadcast(req.userId!, {
                type: 'update',
                entity: 'budget',
                action: 'updated',
            });

            res.json({
                success: true,
                data: {
                    linked_budget_entry_id: linkedBudgetEntryId,
                    linked_recurring_expense_id: linkedRecurringExpenseId,
                    is_expense: isExpense,
                },
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Calendar to Budget sync error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
            });
        } finally {
            // Early returns (404, 400) leave the transaction open with nothing
            // written; ROLLBACK is a no-op after COMMIT.
            await client.query('ROLLBACK').catch(() => {});
            client.release();
        }
    }
);

// ─── Recurring Budget Transactions ────────────────────────────────────────────

const mapRecurringTransaction = (row: any) => ({
    ...row,
    amount: toNumber(row.amount),
    debit_day: toNumber(row.debit_day),
    recurrence_interval: normalizeRecurringInterval(row.recurrence_interval),
    recurrence_frequency: normalizeRecurringFrequency(row.recurrence_frequency),
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : null,
    recurrence_until: row.recurrence_until ? String(row.recurrence_until).slice(0, 10) : null,
    is_active: Boolean(row.is_active),
    is_expense: row.is_expense === undefined ? true : Boolean(row.is_expense),
    is_pointed: Boolean(row.is_pointed),
});

const getMonthRange = (year: number, month: number) => {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return {
        start: formatDateOnly(start),
        end: formatDateOnly(end),
    };
};

// List recurring transaction OCCURRENCES for a given month/year.
router.get('/recurring', async (req: AuthRequest, res) => {
    try {
        const parsedMonth = toOptionalNumber(req.query.month);
        const parsedYear = toOptionalNumber(req.query.year);

        const now = new Date();
        const month = parsedMonth ?? now.getUTCMonth() + 1;
        const year = parsedYear ?? now.getUTCFullYear();

        if (month < 1 || month > 12) {
            return res.status(400).json({ success: false, error: 'invalid month' });
        }

        const range = getMonthRange(year, month);

        const seriesResult = await query(
            `SELECT re.*,
                    (SELECT a.id
                     FROM appointments a
                     WHERE a.user_id = re.user_id
                       AND a.linked_recurring_expense_id = re.id
                     LIMIT 1) as linked_calendar_event_id
             FROM recurring_expenses re
             WHERE re.user_id = $1
               AND re.is_active = true
               AND re.start_date <= $3::date
               AND (re.recurrence_until IS NULL OR re.recurrence_until >= $2::date)
             ORDER BY re.start_date ASC, re.label ASC`,
            [req.userId, range.start, range.end]
        );

        const occurrences = expandRecurringTransactions(
            seriesResult.rows.map(mapRecurringTransaction),
            range.start,
            range.end
        );

        const logsResult = await query(
            `SELECT recurring_expense_id, occurrence_date, is_pointed, pointed_at
             FROM recurring_expense_logs
             WHERE user_id = $1
               AND occurrence_date >= $2::date
               AND occurrence_date <= $3::date`,
            [req.userId, range.start, range.end]
        );

        const logs = new Map(
            logsResult.rows.map((log: any) => [
                `${log.recurring_expense_id}:${String(log.occurrence_date).slice(0, 10)}`,
                log,
            ])
        );

        const data = occurrences
            .map((occurrence) => {
                const key = `${occurrence.series_id}:${occurrence.occurrence_date}`;
                const log = logs.get(key) as any;
                return mapRecurringTransaction({
                    ...occurrence,
                    is_pointed: Boolean(log?.is_pointed),
                    pointed_at: log?.pointed_at ?? null,
                });
            })
            .sort((a, b) =>
                String(a.occurrence_date).localeCompare(String(b.occurrence_date)) ||
                String(a.label).localeCompare(String(b.label))
            );

        res.json({ success: true, data });
    } catch (error) {
        console.error('Get recurring expenses error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create recurring transaction series.
router.post('/recurring', requireParent, async (req: AuthRequest, res) => {
    try {
        const {
            label,
            amount,
            category,
            start_date,
            recurrence_frequency,
            recurrence_interval,
            recurrence_until,
            is_expense,
            add_to_calendar,
        } = req.body;

        const parsedAmount = toOptionalNumber(amount);
        const startDate = parseDateOnly(start_date);
        const frequency = normalizeRecurringFrequency(recurrence_frequency);
        const interval = normalizeRecurringInterval(recurrence_interval);
        const untilDate = recurrence_until ? parseDateOnly(recurrence_until) : null;

        if (!label || parsedAmount === null || parsedAmount <= 0 || !startDate) {
            return res.status(400).json({
                success: false,
                error: 'label, amount and valid start_date are required',
            });
        }

        const startDateValue = formatDateOnly(startDate);
        const untilValue = untilDate ? formatDateOnly(untilDate) : null;

        if (untilValue && untilValue < startDateValue) {
            return res.status(400).json({
                success: false,
                error: 'recurrence_until cannot be before start_date',
            });
        }

        const result = await query(
            `INSERT INTO recurring_expenses (
                user_id,
                label,
                amount,
                category,
                debit_day,
                start_date,
                recurrence_frequency,
                recurrence_interval,
                recurrence_until,
                is_expense
             )
             VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9::date, $10)
             RETURNING *`,
            [
                req.userId,
                label,
                parsedAmount,
                category || 'Maison',
                startDate.getUTCDate(),
                startDateValue,
                frequency,
                interval,
                untilValue,
                is_expense === undefined ? true : Boolean(is_expense),
            ]
        );

        await syncRecurringTransactionCalendar(
            req.userId!,
            result.rows[0],
            Boolean(add_to_calendar)
        );

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'created' });
        res.json({
            success: true,
            data: mapRecurringTransaction({ ...result.rows[0], is_pointed: false }),
        });
    } catch (error) {
        console.error('Create recurring transaction error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update an entire recurring transaction series.
router.put('/recurring/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const existingResult = await query(
            `SELECT *
             FROM recurring_expenses
             WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );

        if (existingResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recurring transaction not found' });
        }

        const existing = mapRecurringTransaction(existingResult.rows[0]);

        const label = req.body.label ?? existing.label;
        const category = req.body.category ?? existing.category;
        const amount = req.body.amount !== undefined
            ? toOptionalNumber(req.body.amount)
            : existing.amount;
        const startDate = parseDateOnly(req.body.start_date ?? existing.start_date);
        const frequency = req.body.recurrence_frequency !== undefined
            ? normalizeRecurringFrequency(req.body.recurrence_frequency)
            : existing.recurrence_frequency;
        const interval = req.body.recurrence_interval !== undefined
            ? normalizeRecurringInterval(req.body.recurrence_interval)
            : existing.recurrence_interval;
        const isExpense = req.body.is_expense !== undefined
            ? Boolean(req.body.is_expense)
            : existing.is_expense;

        const rawUntil = req.body.recurrence_until !== undefined
            ? req.body.recurrence_until
            : existing.recurrence_until;
        const untilDate = rawUntil ? parseDateOnly(rawUntil) : null;

        if (!label || amount === null || amount <= 0 || !startDate) {
            return res.status(400).json({
                success: false,
                error: 'label, amount and valid start_date are required',
            });
        }

        const startDateValue = formatDateOnly(startDate);
        const untilValue = untilDate ? formatDateOnly(untilDate) : null;

        if (rawUntil && !untilDate) {
            return res.status(400).json({ success: false, error: 'invalid recurrence_until' });
        }

        if (untilValue && untilValue < startDateValue) {
            return res.status(400).json({
                success: false,
                error: 'recurrence_until cannot be before start_date',
            });
        }

        const result = await query(
            `UPDATE recurring_expenses
             SET label = $1,
                 amount = $2,
                 category = $3,
                 debit_day = $4,
                 start_date = $5::date,
                 recurrence_frequency = $6,
                 recurrence_interval = $7,
                 recurrence_until = $8::date,
                 is_expense = $9,
                 is_active = $10,
                 updated_at = NOW()
             WHERE id = $11 AND user_id = $12
             RETURNING *`,
            [
                label,
                amount,
                category,
                startDate.getUTCDate(),
                startDateValue,
                frequency,
                interval,
                untilValue,
                isExpense,
                req.body.is_active !== undefined
                    ? Boolean(req.body.is_active)
                    : existing.is_active,
                id,
                req.userId,
            ]
        );

        await syncRecurringTransactionCalendar(
            req.userId!,
            result.rows[0],
            req.body.add_to_calendar !== undefined
                ? Boolean(req.body.add_to_calendar)
                : undefined
        );

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
        res.json({
            success: true,
            data: mapRecurringTransaction({ ...result.rows[0], is_pointed: false }),
        });
    } catch (error) {
        console.error('Update recurring transaction error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete recurring transaction series.
router.delete('/recurring/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        await query(
            `DELETE FROM appointments
             WHERE linked_recurring_expense_id = $1 AND user_id = $2`,
            [req.params.id, req.userId]
        );

        const result = await query(
            'DELETE FROM recurring_expenses WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recurring transaction not found' });
        }

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'deleted' });
        res.json({ success: true, message: 'Recurring expense deleted' });
    } catch (error) {
        console.error('Delete recurring transaction error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Pointing is reconciliation only. It no longer controls Current Balance.
router.post('/recurring/:id/point', requireParent, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const occurrenceDate = parseDateOnly(req.body.occurrence_date);

        if (!occurrenceDate) {
            return res.status(400).json({
                success: false,
                error: 'valid occurrence_date is required',
            });
        }

        const check = await query(
            'SELECT id FROM recurring_expenses WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recurring transaction not found' });
        }

        const occurrenceDateValue = formatDateOnly(occurrenceDate);
        const pointed = Boolean(req.body.is_pointed);
        const month = occurrenceDate.getUTCMonth() + 1;
        const year = occurrenceDate.getUTCFullYear();

        const result = await query(
            `INSERT INTO recurring_expense_logs (
                recurring_expense_id,
                user_id,
                month,
                year,
                occurrence_date,
                is_pointed,
                pointed_at
             )
             VALUES ($1, $2, $3, $4, $5::date, $6, $7)
             ON CONFLICT (recurring_expense_id, occurrence_date)
             DO UPDATE SET
                month = EXCLUDED.month,
                year = EXCLUDED.year,
                is_pointed = EXCLUDED.is_pointed,
                pointed_at = EXCLUDED.pointed_at
             RETURNING *`,
            [
                id,
                req.userId,
                month,
                year,
                occurrenceDateValue,
                pointed,
                pointed ? new Date() : null,
            ]
        );

        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
        res.json({
            success: true,
            data: {
                ...result.rows[0],
                occurrence_date: occurrenceDateValue,
                is_pointed: Boolean(result.rows[0].is_pointed),
            },
        });
    } catch (error) {
        console.error('Reconcile recurring transaction error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Current Balance carries forward every prior Budget transaction and includes
// recurring occurrences in the selected month only once their due date arrives.
// Forecast Balance also includes upcoming recurring income and expenses.
router.get('/forecast', async (req: AuthRequest, res) => {
    try {
        const parsedMonth = toOptionalNumber(req.query.month);
        const parsedYear = toOptionalNumber(req.query.year);

        if (
            parsedMonth === null ||
            parsedYear === null ||
            parsedMonth < 1 ||
            parsedMonth > 12
        ) {
            return res.status(400).json({
                success: false,
                error: 'valid month and year are required',
            });
        }

        const range = getMonthRange(parsedYear, parsedMonth);

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

        // Carry forward every one-time entry dated before the selected month.
        const historicalEntries = await query(
            `SELECT
                 SUM(amount) FILTER (WHERE is_expense = false) as total_income,
                 SUM(amount) FILTER (WHERE is_expense = true) as total_expenses
             FROM budget_entries
             WHERE user_id = $1
               AND date < $2::date`,
            [req.userId, range.start]
        );

        // Current selected-month recurring series.
        const seriesResult = await query(
            `SELECT *
             FROM recurring_expenses
             WHERE user_id = $1
               AND is_active = true
               AND start_date <= $3::date
               AND (recurrence_until IS NULL OR recurrence_until >= $2::date)`,
            [req.userId, range.start, range.end]
        );

        const occurrences = expandRecurringTransactions(
            seriesResult.rows.map(mapRecurringTransaction),
            range.start,
            range.end
        );

        // Historical recurring series must also be included in carry-forward,
        // including series whose recurrence ended before this month.
        const historicalSeriesResult = await query(
            `SELECT *
             FROM recurring_expenses
             WHERE user_id = $1
               AND is_active = true
               AND start_date < $2::date`,
            [req.userId, range.start]
        );

        const rangeStartDate = parseDateOnly(range.start)!;
        rangeStartDate.setUTCDate(rangeStartDate.getUTCDate() - 1);
        const historicalEnd = formatDateOnly(rangeStartDate);

        const historicalOccurrences = historicalSeriesResult.rows.flatMap((row) => {
            const recurring = mapRecurringTransaction(row);
            if (!recurring.start_date || recurring.start_date > historicalEnd) return [];
            return expandRecurringTransactions(
                [recurring],
                recurring.start_date,
                historicalEnd
            );
        });

        let openingRecurringIncome = 0;
        let openingRecurringExpenses = 0;

        for (const occurrence of historicalOccurrences) {
            if (occurrence.is_expense) {
                openingRecurringExpenses += toNumber(occurrence.amount);
            } else {
                openingRecurringIncome += toNumber(occurrence.amount);
            }
        }

        const openingBalance =
            toNumber(historicalEntries.rows[0]?.total_income)
            - toNumber(historicalEntries.rows[0]?.total_expenses)
            + openingRecurringIncome
            - openingRecurringExpenses;

        // The client sends its local date so "today" follows the family's timezone
        // rather than the Docker/server timezone.
        const requestedAsOf = parseDateOnly(req.query.as_of);
        const fallbackNow = new Date();
        const asOf = requestedAsOf ?? new Date(Date.UTC(
            fallbackNow.getUTCFullYear(),
            fallbackNow.getUTCMonth(),
            fallbackNow.getUTCDate()
        ));
        const asOfValue = formatDateOnly(asOf);

        let cutoff: string;

        if (asOfValue < range.start) {
            cutoff = '';
        } else if (asOfValue > range.end) {
            cutoff = range.end;
        } else {
            cutoff = asOfValue;
        }

        let dueRecurringIncome = 0;
        let dueRecurringExpenses = 0;
        let upcomingRecurringIncome = 0;
        let upcomingRecurringExpenses = 0;

        for (const occurrence of occurrences) {
            const amount = toNumber(occurrence.amount);
            const due = Boolean(cutoff && occurrence.occurrence_date <= cutoff);

            if (occurrence.is_expense) {
                if (due) dueRecurringExpenses += amount;
                else upcomingRecurringExpenses += amount;
            } else {
                if (due) dueRecurringIncome += amount;
                else upcomingRecurringIncome += amount;
            }
        }

        const oneTimeIncome = toNumber(totals.rows[0]?.total_income);
        const oneTimeExpenses = toNumber(totals.rows[0]?.total_expenses);

        const currentBalance =
            openingBalance
            + oneTimeIncome
            - oneTimeExpenses
            + dueRecurringIncome
            - dueRecurringExpenses;

        const forecastBalance =
            currentBalance
            + upcomingRecurringIncome
            - upcomingRecurringExpenses;

        res.json({
            success: true,
            data: {
                openingBalance,
                oneTimeIncome,
                oneTimeExpenses,
                dueRecurringIncome,
                dueRecurringExpenses,
                upcomingRecurringIncome,
                upcomingRecurringExpenses,

                // Compatibility aliases for older clients.
                income: oneTimeIncome,
                pointedRecurring: dueRecurringExpenses,
                unpointedRecurring: upcomingRecurringExpenses,

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
