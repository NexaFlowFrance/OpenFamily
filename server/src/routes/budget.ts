import { Router } from 'express';
import { query, getClient } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty, toOptionalNumber } from '../lib/normalize';
import logger from '../lib/logger';

const router = Router();
router.use(authMiddleware);

const MAX_SHARES_PER_ENTRY = 20;

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

const roundCents = (value: number): number => Math.round(value * 100);

interface ShareInput {
    family_member_id: string | null;
    share_amount: number;
}

const mapBudgetEntry = (row: any) => ({
    ...row,
    amount: toNumber(row.amount),
    is_expense: Boolean(row.is_expense),
    is_reimbursement: Boolean(row.is_reimbursement),
    shares: Array.isArray(row.shares)
        ? row.shares.map((share: any) => ({
            family_member_id: share.family_member_id ?? null,
            name: share.name ?? null,
            color: share.color ?? null,
            share_amount: toNumber(share.share_amount),
        }))
        : [],
});

const mapBudgetLimit = (row: any) => ({
    ...row,
    monthly_limit: toNumber(row.monthly_limit),
    amount: toNumber(row.monthly_limit),
    month: toNumber(row.month),
    year: toNumber(row.year),
});

const ENTRY_SELECT = `
    SELECT be.*,
        fm_payer.name AS payer_name,
        fm_payer.color AS payer_color,
        fm_assigned.name AS assigned_to_name,
        fm_assigned.color AS assigned_to_color,
        COALESCE((
            SELECT json_agg(json_build_object(
                'family_member_id', s.family_member_id,
                'name', fm_s.name,
                'color', fm_s.color,
                'share_amount', s.share_amount::float
            ) ORDER BY fm_s.name)
            FROM budget_entry_shares s
            LEFT JOIN family_members fm_s ON fm_s.id = s.family_member_id
            WHERE s.budget_entry_id = be.id
        ), '[]'::json) AS shares
    FROM budget_entries be
    LEFT JOIN family_members fm_payer ON fm_payer.id = be.payer_id
    LEFT JOIN family_members fm_assigned ON fm_assigned.id = be.assigned_to
`;

interface ParsedShares {
    shares: ShareInput[];
    error: string | null;
}

const parseShares = (raw: unknown, amount: number): ParsedShares => {
    if (raw === undefined || raw === null) {
        return { shares: [], error: null };
    }
    if (!Array.isArray(raw)) {
        return { shares: [], error: 'shares must be an array' };
    }
    if (raw.length === 0) {
        return { shares: [], error: null };
    }
    if (raw.length > MAX_SHARES_PER_ENTRY) {
        return { shares: [], error: `cannot have more than ${MAX_SHARES_PER_ENTRY} shares per entry` };
    }

    const seen = new Set<string>();
    const parsed: ShareInput[] = [];

    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            return { shares: [], error: 'each share must be an object' };
        }
        const obj = item as Record<string, unknown>;
        const fmId = obj.family_member_id;
        const familyMemberId = fmId === undefined || fmId === null || fmId === ''
            ? null
            : String(fmId);

        const shareAmount = toOptionalNumber(obj.share_amount);
        if (shareAmount === null) {
            return { shares: [], error: 'each share must have a numeric share_amount' };
        }
        if (shareAmount < 0) {
            return { shares: [], error: 'share amounts must be non-negative' };
        }

        if (familyMemberId !== null) {
            if (seen.has(familyMemberId)) {
                return { shares: [], error: 'duplicate family_member_id in shares' };
            }
            seen.add(familyMemberId);
        }

        parsed.push({ family_member_id: familyMemberId, share_amount: shareAmount });
    }

    const sumCents = parsed.reduce((acc, s) => acc + roundCents(s.share_amount), 0);
    if (Math.abs(sumCents - roundCents(amount)) > 1) {
        return { shares: [], error: 'shares must sum to entry amount' };
    }

    return { shares: parsed, error: null };
};

const verifyMembersBelongToUser = async (
    memberIds: string[],
    userId: string
): Promise<boolean> => {
    if (memberIds.length === 0) {
        return true;
    }
    const result = await query(
        'SELECT COUNT(*)::int AS count FROM family_members WHERE id = ANY($1::uuid[]) AND user_id = $2',
        [memberIds, userId]
    );
    const count: number = result.rows[0]?.count ?? 0;
    return count === memberIds.length;
};

// Get budget entries
router.get('/entries', async (req: AuthRequest, res) => {
    const userId = (req as any).userId as string;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { start_date, end_date, category, member_id, search, assigned_to } = req.query;

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const startDate = start_date as string | undefined;
        const endDate = end_date as string | undefined;
        if (startDate && !dateRegex.test(startDate)) {
            return res.status(400).json({ success: false, error: 'Invalid start_date format' });
        }
        if (endDate && !dateRegex.test(endDate)) {
            return res.status(400).json({ success: false, error: 'Invalid end_date format' });
        }

        let queryText = `${ENTRY_SELECT} WHERE be.user_id = $1`;
        const params: any[] = [userId];

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

        if (member_id) {
            params.push(member_id);
            queryText += ` AND (be.payer_id = $${params.length} OR EXISTS(
                SELECT 1 FROM budget_entry_shares s
                WHERE s.budget_entry_id = be.id AND s.family_member_id = $${params.length}
            ))`;
        } else if (assigned_to) {
            // legacy compat
            params.push(assigned_to);
            queryText += ` AND (be.assigned_to = $${params.length} OR EXISTS(
                SELECT 1 FROM budget_entry_shares s
                WHERE s.budget_entry_id = be.id AND s.family_member_id = $${params.length}
            ))`;
        }

        if (search !== undefined && search !== null && String(search).trim() !== '') {
            params.push(String(search));
            queryText += ` AND (be.description ILIKE '%' || $${params.length} || '%' OR be.category ILIKE '%' || $${params.length} || '%')`;
        }

        queryText += ' ORDER BY be.date DESC, be.created_at DESC';

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows.map(mapBudgetEntry) });
    } catch (error) {
        logger.error('budget.get_entries_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create budget entry
router.post('/entries', async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const {
            category,
            amount,
            description,
            date,
            is_expense,
            payer_id,
            shares: rawShares,
            is_reimbursement,
            image_url,
            assigned_to,
        } = req.body ?? {};

        const parsedAmount = toOptionalNumber(amount);
        if (!category || parsedAmount === null || !date) {
            return res.status(400).json({
                success: false,
                error: 'category, amount and date are required',
            });
        }
        if (parsedAmount < 0) {
            return res.status(400).json({ success: false, error: 'amount must be non-negative' });
        }

        const payerIdNorm = toNullIfEmpty(payer_id);
        const assignedToNorm = toNullIfEmpty(assigned_to);

        // Determine shares: if `shares` provided use it, else legacy synthesis from assigned_to
        let shares: ShareInput[] = [];
        const sharesProvided = rawShares !== undefined && rawShares !== null;
        if (sharesProvided) {
            const result = parseShares(rawShares, parsedAmount);
            if (result.error) {
                return res.status(400).json({ success: false, error: result.error });
            }
            shares = result.shares;
        } else if (assignedToNorm) {
            logger.warn('budget: assigned_to deprecated payload received', {
                userId,
                assignedTo: assignedToNorm,
            });
            shares = [{
                family_member_id: String(assignedToNorm),
                share_amount: parsedAmount,
            }];
        }

        // Verify all referenced family members belong to the user
        const memberIdsToCheck = new Set<string>();
        if (payerIdNorm) memberIdsToCheck.add(String(payerIdNorm));
        if (assignedToNorm) memberIdsToCheck.add(String(assignedToNorm));
        for (const s of shares) {
            if (s.family_member_id) memberIdsToCheck.add(s.family_member_id);
        }
        const ok = await verifyMembersBelongToUser(Array.from(memberIdsToCheck), userId);
        if (!ok) {
            return res.status(400).json({ success: false, error: 'invalid family member reference' });
        }

        const client = await getClient();
        let insertedId: string;
        try {
            await client.query('BEGIN');

            const insertResult = await client.query(
                `INSERT INTO budget_entries
                  (user_id, category, amount, description, date, is_expense,
                   payer_id, is_reimbursement, image_url, assigned_to)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING id`,
                [
                    userId,
                    category,
                    parsedAmount,
                    toNullIfEmpty(description),
                    date,
                    Boolean(is_expense),
                    payerIdNorm,
                    Boolean(is_reimbursement),
                    toNullIfEmpty(image_url),
                    assignedToNorm,
                ]
            );
            insertedId = insertResult.rows[0].id;

            for (const share of shares) {
                await client.query(
                    `INSERT INTO budget_entry_shares (budget_entry_id, family_member_id, share_amount)
                     VALUES ($1, $2, $3)`,
                    [insertedId, share.family_member_id, share.share_amount]
                );
            }

            await client.query('COMMIT');
        } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
        } finally {
            client.release();
        }

        const full = await query(`${ENTRY_SELECT} WHERE be.id = $1`, [insertedId]);
        res.json({ success: true, data: mapBudgetEntry(full.rows[0]) });
    } catch (error) {
        logger.error('budget.create_entry_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update budget entry
router.put('/entries/:id', async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { id } = req.params;
        const {
            category,
            amount,
            description,
            date,
            is_expense,
            payer_id,
            shares: rawShares,
            is_reimbursement,
            image_url,
            assigned_to,
        } = req.body ?? {};

        // Verify entry belongs to user and fetch current state for COALESCE-like behavior
        const existing = await query(
            'SELECT * FROM budget_entries WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Budget entry not found' });
        }
        const current = existing.rows[0];

        const parsedAmount = amount !== undefined ? toOptionalNumber(amount) : null;
        if (amount !== undefined && parsedAmount === null) {
            return res.status(400).json({ success: false, error: 'Invalid amount format' });
        }
        const finalAmount = parsedAmount !== null ? parsedAmount : toNumber(current.amount);
        if (finalAmount < 0) {
            return res.status(400).json({ success: false, error: 'amount must be non-negative' });
        }

        const payerIdNorm =
            payer_id === undefined ? current.payer_id : toNullIfEmpty(payer_id);
        const assignedToNorm =
            assigned_to === undefined ? current.assigned_to : toNullIfEmpty(assigned_to);

        // Resolve shares: if explicit shares provided -> use them
        // else if assigned_to provided (legacy) -> synthesize
        // else -> keep existing shares (don't touch table)
        let touchShares = false;
        let shares: ShareInput[] = [];
        const sharesProvided = rawShares !== undefined;
        if (sharesProvided) {
            touchShares = true;
            if (rawShares !== null) {
                const parsed = parseShares(rawShares, finalAmount);
                if (parsed.error) {
                    return res.status(400).json({ success: false, error: parsed.error });
                }
                shares = parsed.shares;
            }
        } else if (assigned_to !== undefined) {
            // legacy: replace shares with single full-amount share for assigned_to (or clear if null)
            logger.warn('budget: assigned_to deprecated payload received', {
                userId,
                entryId: id,
                assignedTo: assignedToNorm,
            });
            touchShares = true;
            if (assignedToNorm) {
                shares = [{
                    family_member_id: String(assignedToNorm),
                    share_amount: finalAmount,
                }];
            }
        }

        // Verify member references belong to user
        const memberIdsToCheck = new Set<string>();
        if (payerIdNorm) memberIdsToCheck.add(String(payerIdNorm));
        if (assignedToNorm) memberIdsToCheck.add(String(assignedToNorm));
        for (const s of shares) {
            if (s.family_member_id) memberIdsToCheck.add(s.family_member_id);
        }
        const ok = await verifyMembersBelongToUser(Array.from(memberIdsToCheck), userId);
        if (!ok) {
            return res.status(400).json({ success: false, error: 'invalid family member reference' });
        }

        const client = await getClient();
        try {
            await client.query('BEGIN');

            await client.query(
                `UPDATE budget_entries
                 SET category = COALESCE($1, category),
                     amount = COALESCE($2, amount),
                     description = COALESCE($3, description),
                     date = COALESCE($4, date),
                     is_expense = COALESCE($5, is_expense),
                     payer_id = $6,
                     is_reimbursement = COALESCE($7, is_reimbursement),
                     image_url = COALESCE($8, image_url),
                     assigned_to = $9
                 WHERE id = $10 AND user_id = $11`,
                [
                    toNullIfEmpty(category),
                    parsedAmount,
                    description !== undefined ? toNullIfEmpty(description) : null,
                    toNullIfEmpty(date),
                    is_expense !== undefined ? Boolean(is_expense) : null,
                    payerIdNorm,
                    is_reimbursement !== undefined ? Boolean(is_reimbursement) : null,
                    image_url !== undefined ? toNullIfEmpty(image_url) : null,
                    assignedToNorm,
                    id,
                    userId,
                ]
            );

            if (touchShares) {
                await client.query('DELETE FROM budget_entry_shares WHERE budget_entry_id = $1', [id]);
                for (const share of shares) {
                    await client.query(
                        `INSERT INTO budget_entry_shares (budget_entry_id, family_member_id, share_amount)
                         VALUES ($1, $2, $3)`,
                        [id, share.family_member_id, share.share_amount]
                    );
                }
            }

            await client.query('COMMIT');
        } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
        } finally {
            client.release();
        }

        const full = await query(`${ENTRY_SELECT} WHERE be.id = $1`, [id]);
        res.json({ success: true, data: mapBudgetEntry(full.rows[0]) });
    } catch (error) {
        logger.error('budget.update_entry_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete budget entry
router.delete('/entries/:id', async (req: AuthRequest, res) => {
    const userId = (req as any).userId as string;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM budget_entries WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Budget entry not found' });
        }

        res.json({ success: true, message: 'Budget entry deleted' });
    } catch (error) {
        logger.error('budget.delete_entry_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get budget limits
router.get('/limits', async (req: AuthRequest, res) => {
    const userId = (req as any).userId as string;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { month, year, family_member_id } = req.query;

        if (month !== undefined || year !== undefined) {
            const parsedMonth = parseInt(month as string);
            const parsedYear = parseInt(year as string);
            if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12 || isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
                return res.status(400).json({ success: false, error: 'Invalid month or year' });
            }
        }

        let queryText = 'SELECT * FROM budget_limits WHERE user_id = $1';
        const params: any[] = [userId];

        if (month) {
            params.push(month);
            queryText += ` AND month = $${params.length}`;
        }

        if (year) {
            params.push(year);
            queryText += ` AND year = $${params.length}`;
        }

        if (family_member_id !== undefined) {
            if (family_member_id === '' || family_member_id === 'null') {
                queryText += ' AND family_member_id IS NULL';
            } else {
                params.push(family_member_id);
                queryText += ` AND family_member_id = $${params.length}`;
            }
        }

        queryText += ' ORDER BY category, family_member_id NULLS FIRST';

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows.map(mapBudgetLimit) });
    } catch (error) {
        logger.error('budget.get_limits_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Set budget limit
router.post('/limits', async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { category, amount, monthly_limit, month, year, family_member_id } = req.body ?? {};

        // Accept either `amount` (new spec) or `monthly_limit` (legacy/client) for the limit value
        const limitInput = amount !== undefined ? amount : monthly_limit;
        const parsedLimit = toOptionalNumber(limitInput);
        const parsedMonth = toOptionalNumber(month);
        const parsedYear = toOptionalNumber(year);

        if (!category || parsedLimit === null || parsedMonth === null || parsedYear === null) {
            return res
                .status(400)
                .json({ success: false, error: 'category, amount, month and year are required' });
        }
        if (parsedLimit < 0) {
            return res.status(400).json({ success: false, error: 'amount must be non-negative' });
        }

        const familyMemberId = toNullIfEmpty(family_member_id);

        if (familyMemberId !== null) {
            const memberCheck = await query(
                'SELECT 1 FROM family_members WHERE id = $1 AND user_id = $2',
                [familyMemberId, userId]
            );
            if (memberCheck.rowCount === 0) {
                return res.status(400).json({ success: false, error: 'invalid family member reference' });
            }
        }

        let result;
        if (familyMemberId === null) {
            result = await query(
                `INSERT INTO budget_limits (user_id, category, monthly_limit, month, year, family_member_id)
                 VALUES ($1, $2, $3, $4, $5, NULL)
                 ON CONFLICT (user_id, category, month, year) WHERE family_member_id IS NULL
                 DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit
                 RETURNING *`,
                [userId, category, parsedLimit, parsedMonth, parsedYear]
            );
        } else {
            result = await query(
                `INSERT INTO budget_limits (user_id, category, monthly_limit, month, year, family_member_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (user_id, category, month, year, family_member_id) WHERE family_member_id IS NOT NULL
                 DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit
                 RETURNING *`,
                [userId, category, parsedLimit, parsedMonth, parsedYear, familyMemberId]
            );
        }

        res.json({ success: true, data: mapBudgetLimit(result.rows[0]) });
    } catch (error) {
        logger.error('budget.set_limit_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete budget limit
router.delete('/limits/:id', async (req: AuthRequest, res) => {
    const userId = (req as any).userId as string;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { id } = req.params;
        const result = await query(
            'DELETE FROM budget_limits WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Budget limit not found' });
        }
        res.status(204).send();
    } catch (error) {
        logger.error('budget.delete_limit_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get budget statistics
router.get('/statistics', async (req: AuthRequest, res) => {
    const userId = (req as any).userId as string;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const parsedMonth = parseInt(req.query.month as string);
        const parsedYear = parseInt(req.query.year as string);

        if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12 || isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
            return res.status(400).json({ success: false, error: 'Invalid month or year' });
        }
        const monthYearParams = [userId, parsedMonth, parsedYear];

        const totals = await query(
            `SELECT
                SUM(amount) FILTER (WHERE is_expense = true AND is_reimbursement = false) AS total_expenses,
                SUM(amount) FILTER (WHERE is_expense = false AND is_reimbursement = false) AS total_income
             FROM budget_entries
             WHERE user_id = $1
               AND EXTRACT(MONTH FROM date) = $2
               AND EXTRACT(YEAR FROM date) = $3`,
            monthYearParams
        );

        const byCategoryResult = await query(
            `SELECT category, SUM(amount) AS category_total
             FROM budget_entries
             WHERE user_id = $1
               AND is_expense = true
               AND is_reimbursement = false
               AND EXTRACT(MONTH FROM date) = $2
               AND EXTRACT(YEAR FROM date) = $3
             GROUP BY category`,
            monthYearParams
        );

        const byMemberResult = await query(
            `SELECT s.family_member_id,
                    fm.name AS member_name,
                    fm.color AS member_color,
                    be.category,
                    SUM(s.share_amount) AS amount
             FROM budget_entry_shares s
             LEFT JOIN family_members fm ON fm.id = s.family_member_id
             JOIN budget_entries be ON be.id = s.budget_entry_id
             WHERE be.user_id = $1
               AND be.is_expense = true
               AND be.is_reimbursement = false
               AND EXTRACT(MONTH FROM be.date) = $2
               AND EXTRACT(YEAR FROM be.date) = $3
             GROUP BY s.family_member_id, fm.name, fm.color, be.category
             ORDER BY fm.name NULLS LAST, be.category`,
            monthYearParams
        );

        const byPayerResult = await query(
            `SELECT be.payer_id,
                    fm.name AS payer_name,
                    fm.color AS payer_color,
                    SUM(be.amount) AS amount
             FROM budget_entries be
             LEFT JOIN family_members fm ON fm.id = be.payer_id
             WHERE be.user_id = $1
               AND be.payer_id IS NOT NULL
               AND be.is_expense = true
               AND be.is_reimbursement = false
               AND EXTRACT(MONTH FROM be.date) = $2
               AND EXTRACT(YEAR FROM be.date) = $3
             GROUP BY be.payer_id, fm.name, fm.color
             ORDER BY fm.name NULLS LAST`,
            monthYearParams
        );

        const unassignedResult = await query(
            `SELECT COALESCE(SUM(be.amount), 0) AS total
             FROM budget_entries be
             WHERE be.user_id = $1
               AND be.is_expense = true
               AND be.is_reimbursement = false
               AND be.payer_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM budget_entry_shares s WHERE s.budget_entry_id = be.id
               )
               AND EXTRACT(MONTH FROM be.date) = $2
               AND EXTRACT(YEAR FROM be.date) = $3`,
            monthYearParams
        );

        const totalExpenses = toNumber(totals.rows[0]?.total_expenses);
        const totalIncome = toNumber(totals.rows[0]?.total_income);

        const byCategory: Record<string, number> = {};
        for (const row of byCategoryResult.rows) {
            byCategory[row.category] = toNumber(row.category_total);
        }

        res.json({
            success: true,
            data: {
                totalExpenses,
                totalIncome,
                balance: totalIncome - totalExpenses,
                byCategory,
                byMember: byMemberResult.rows.map((row) => ({
                    family_member_id: row.family_member_id,
                    assigned_to: row.family_member_id, // legacy alias
                    member_name: row.member_name,
                    member_color: row.member_color,
                    category: row.category,
                    amount: toNumber(row.amount),
                })),
                byPayer: byPayerResult.rows.map((row) => ({
                    payer_id: row.payer_id,
                    payer_name: row.payer_name,
                    payer_color: row.payer_color,
                    amount: toNumber(row.amount),
                })),
                unassignedTotal: toNumber(unassignedResult.rows[0]?.total),
            },
        });
    } catch (error) {
        logger.error('budget.get_statistics_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get monthly budget statistics for a year
router.get('/statistics/monthly', async (req: AuthRequest, res) => {
    const userId = (req as any).userId as string;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const parsedYear = parseInt(req.query.year as string);

        if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
            return res.status(400).json({ success: false, error: 'Invalid month or year' });
        }

        const result = await query(
            `SELECT
                EXTRACT(MONTH FROM date)::int AS month,
                SUM(amount) FILTER (WHERE is_expense = true AND is_reimbursement = false) AS total_expenses,
                SUM(amount) FILTER (WHERE is_expense = false AND is_reimbursement = false) AS total_income
             FROM budget_entries
             WHERE user_id = $1
               AND EXTRACT(YEAR FROM date) = $2
             GROUP BY EXTRACT(MONTH FROM date)
             ORDER BY month`,
            [userId, parsedYear]
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
        logger.error('budget.get_monthly_statistics_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Per-member statistics
router.get('/statistics/member/:memberId', async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { memberId } = req.params;
        const parsedMonth = parseInt(req.query.month as string);
        const parsedYear = parseInt(req.query.year as string);

        if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12 || isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
            return res.status(400).json({ success: false, error: 'Invalid month or year' });
        }

        // Verify member belongs to user
        const memberCheck = await query(
            'SELECT id, name, color FROM family_members WHERE id = $1 AND user_id = $2',
            [memberId, userId]
        );
        if (memberCheck.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Family member not found' });
        }
        const member = memberCheck.rows[0];

        const baseParams = [userId, memberId, parsedMonth, parsedYear];

        const totalSpentResult = await query(
            `SELECT COALESCE(SUM(s.share_amount), 0) AS total
             FROM budget_entry_shares s
             JOIN budget_entries be ON be.id = s.budget_entry_id
             WHERE be.user_id = $1
               AND s.family_member_id = $2
               AND be.is_expense = true
               AND be.is_reimbursement = false
               AND EXTRACT(MONTH FROM be.date) = $3
               AND EXTRACT(YEAR FROM be.date) = $4`,
            baseParams
        );

        const totalPaidResult = await query(
            `SELECT COALESCE(SUM(be.amount), 0) AS total
             FROM budget_entries be
             WHERE be.user_id = $1
               AND be.payer_id = $2
               AND be.is_expense = true
               AND be.is_reimbursement = false
               AND EXTRACT(MONTH FROM be.date) = $3
               AND EXTRACT(YEAR FROM be.date) = $4`,
            baseParams
        );

        const byCategoryResult = await query(
            `SELECT be.category, COALESCE(SUM(s.share_amount), 0) AS amount
             FROM budget_entry_shares s
             JOIN budget_entries be ON be.id = s.budget_entry_id
             WHERE be.user_id = $1
               AND s.family_member_id = $2
               AND be.is_expense = true
               AND be.is_reimbursement = false
               AND EXTRACT(MONTH FROM be.date) = $3
               AND EXTRACT(YEAR FROM be.date) = $4
             GROUP BY be.category
             ORDER BY be.category`,
            baseParams
        );

        // last 12 months trend ending at parsedMonth/parsedYear
        const trendResult = await query(
            `WITH months AS (
                SELECT generate_series(
                    make_date($3::int, $2::int, 1) - INTERVAL '11 months',
                    make_date($3::int, $2::int, 1),
                    INTERVAL '1 month'
                )::date AS month_start
            )
            SELECT
                EXTRACT(MONTH FROM m.month_start)::int AS month,
                EXTRACT(YEAR FROM m.month_start)::int AS year,
                COALESCE((
                    SELECT SUM(s.share_amount)
                    FROM budget_entry_shares s
                    JOIN budget_entries be ON be.id = s.budget_entry_id
                    WHERE be.user_id = $1
                      AND s.family_member_id = $4
                      AND be.is_expense = true
                      AND be.is_reimbursement = false
                      AND EXTRACT(MONTH FROM be.date) = EXTRACT(MONTH FROM m.month_start)
                      AND EXTRACT(YEAR FROM be.date) = EXTRACT(YEAR FROM m.month_start)
                ), 0) AS spent,
                COALESCE((
                    SELECT SUM(be.amount)
                    FROM budget_entries be
                    WHERE be.user_id = $1
                      AND be.payer_id = $4
                      AND be.is_expense = true
                      AND be.is_reimbursement = false
                      AND EXTRACT(MONTH FROM be.date) = EXTRACT(MONTH FROM m.month_start)
                      AND EXTRACT(YEAR FROM be.date) = EXTRACT(YEAR FROM m.month_start)
                ), 0) AS paid
            FROM months m
            ORDER BY m.month_start`,
            [userId, parsedMonth, parsedYear, memberId]
        );

        // Optional limit lookup: prefer member-specific overall (NULL category) limit; fall back to category=NULL limit
        const limitResult = await query(
            `SELECT monthly_limit
             FROM budget_limits
             WHERE user_id = $1
               AND family_member_id = $2
               AND month = $3
               AND year = $4
               AND category IS NULL
             LIMIT 1`,
            [userId, memberId, parsedMonth, parsedYear]
        );

        const totalSpent = toNumber(totalSpentResult.rows[0]?.total);
        const totalPaid = toNumber(totalPaidResult.rows[0]?.total);

        const byCategory: Record<string, number> = {};
        for (const row of byCategoryResult.rows) {
            byCategory[row.category] = toNumber(row.amount);
        }

        const monthlyTrend = trendResult.rows.map((row) => ({
            month: toNumber(row.month),
            year: toNumber(row.year),
            spent: toNumber(row.spent),
            paid: toNumber(row.paid),
        }));

        let limit: { amount: number; percent: number } | null = null;
        if (limitResult.rowCount && limitResult.rowCount > 0) {
            const limitAmount = toNumber(limitResult.rows[0].monthly_limit);
            limit = {
                amount: limitAmount,
                percent: limitAmount > 0
                    ? Math.min(100, Math.round((totalSpent / limitAmount) * 100))
                    : 0,
            };
        }

        res.json({
            success: true,
            data: {
                member: {
                    id: member.id,
                    name: member.name,
                    color: member.color,
                },
                totalSpent,
                totalPaid,
                balance: totalPaid - totalSpent,
                byCategory,
                monthlyTrend,
                limit,
            },
        });
    } catch (error) {
        logger.error('budget.get_member_statistics_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Calculate debts between family members for a given month/year
router.get('/debts', async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { month, year } = req.query;
        const parsedMonth = toOptionalNumber(month);
        const parsedYear = toOptionalNumber(year);

        if (parsedMonth === null || parsedYear === null) {
            return res.status(400).json({ success: false, error: 'month and year are required' });
        }

        const rowsResult = await query(
            `SELECT be.id,
                    be.payer_id,
                    s.family_member_id AS beneficiary_id,
                    s.share_amount
             FROM budget_entries be
             JOIN budget_entry_shares s ON s.budget_entry_id = be.id
             WHERE be.user_id = $1
               AND EXTRACT(MONTH FROM be.date) = $2
               AND EXTRACT(YEAR FROM be.date) = $3
               AND be.is_expense = true
               AND be.is_reimbursement = false
               AND be.payer_id IS NOT NULL
               AND s.family_member_id IS NOT NULL
               AND s.family_member_id <> be.payer_id`,
            [userId, parsedMonth, parsedYear]
        );

        // debtMap[beneficiary][payer] = amount the beneficiary owes the payer
        const debtMap: Record<string, Record<string, number>> = {};
        const memberIds = new Set<string>();

        for (const row of rowsResult.rows) {
            const beneficiary = String(row.beneficiary_id);
            const payer = String(row.payer_id);
            const amt = toNumber(row.share_amount);
            memberIds.add(beneficiary);
            memberIds.add(payer);
            if (!debtMap[beneficiary]) {
                debtMap[beneficiary] = {};
            }
            debtMap[beneficiary][payer] = (debtMap[beneficiary][payer] ?? 0) + amt;
        }

        // Net out cross debts: if A owes B and B owes A, keep only the net on the larger side
        const seen = new Set<string>();
        const beneficiaries = Object.keys(debtMap);
        for (const a of beneficiaries) {
            const owedToByA = debtMap[a];
            if (!owedToByA) continue;
            for (const b of Object.keys(owedToByA)) {
                const pairKey = [a, b].sort().join('|');
                if (seen.has(pairKey)) continue;
                seen.add(pairKey);

                const aToB = debtMap[a]?.[b] ?? 0; // A owes B
                const bToA = debtMap[b]?.[a] ?? 0; // B owes A

                if (aToB > 0 && bToA > 0) {
                    if (aToB > bToA) {
                        debtMap[a][b] = roundCents(aToB - bToA) / 100;
                        if (debtMap[b]) {
                            delete debtMap[b][a];
                        }
                    } else if (bToA > aToB) {
                        if (debtMap[b]) {
                            debtMap[b][a] = roundCents(bToA - aToB) / 100;
                        }
                        delete debtMap[a][b];
                    } else {
                        // equal — cancel both
                        delete debtMap[a][b];
                        if (debtMap[b]) {
                            delete debtMap[b][a];
                        }
                    }
                }
            }
        }

        // Look up names/colors
        let nameMap: Record<string, { name: string; color: string }> = {};
        if (memberIds.size > 0) {
            const namesResult = await query(
                'SELECT id, name, color FROM family_members WHERE id = ANY($1::uuid[]) AND user_id = $2',
                [Array.from(memberIds), userId]
            );
            for (const row of namesResult.rows) {
                nameMap[String(row.id)] = { name: row.name, color: row.color };
            }
        }

        const debts: Array<{
            from_member_id: string;
            from_name: string | null;
            from_color: string | null;
            to_member_id: string;
            to_name: string | null;
            to_color: string | null;
            amount: number;
        }> = [];

        for (const [beneficiary, payerMap] of Object.entries(debtMap)) {
            for (const [payer, amount] of Object.entries(payerMap)) {
                if (amount > 0) {
                    debts.push({
                        from_member_id: beneficiary,
                        from_name: nameMap[beneficiary]?.name ?? null,
                        from_color: nameMap[beneficiary]?.color ?? null,
                        to_member_id: payer,
                        to_name: nameMap[payer]?.name ?? null,
                        to_color: nameMap[payer]?.color ?? null,
                        amount: roundCents(amount) / 100,
                    });
                }
            }
        }

        debts.sort((a, b) => b.amount - a.amount);

        res.json({ success: true, data: debts });
    } catch (error) {
        logger.error('budget.get_debts_error', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
