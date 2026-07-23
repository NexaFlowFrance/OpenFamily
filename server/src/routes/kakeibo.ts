import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';
import { getFamilyCategories } from './categories';

// Kakeibo budgeting mode (家計簿). Sits alongside the classic budget: it reuses
// the existing budget_entries / recurring_expenses data and adds three notions
// on top — household salaries (family_members.monthly_income), a monthly savings
// goal (kakeibo_months) and the 4 canonical pillars mapping budget categories.

const router = Router();
router.use(authMiddleware);

const PILLARS = ['survival', 'wants', 'culture', 'extra'] as const;
type Pillar = (typeof PILLARS)[number];

const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') { const n = parseFloat(value); return Number.isFinite(n) ? n : 0; }
    return 0;
};

// Sensible default pillar for each default budget category. Custom categories
// (and any not listed) default to "wants" — the family re-maps them in Settings.
const DEFAULT_PILLAR_BY_CATEGORY: Record<string, Pillar> = {
    'Logement': 'survival',
    'Alimentation': 'survival',
    'Transport': 'survival',
    'Santé': 'survival',
    'Assurance': 'survival',
    'Abonnements': 'wants',
    'Loisirs': 'culture',
    'Enfants': 'survival',
    'Maison': 'wants',
    'Autre': 'extra',
    'Prélèvements': 'survival',
};

const parsePillars = (raw: unknown): Record<string, Pillar> => {
    if (typeof raw !== 'string' || raw.trim() === '') return {};
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const out: Record<string, Pillar> = {};
        for (const [cat, pillar] of Object.entries(parsed)) {
            if (typeof pillar === 'string' && (PILLARS as readonly string[]).includes(pillar)) {
                out[cat] = pillar as Pillar;
            }
        }
        return out;
    } catch {
        return {};
    }
};

/** Effective pillar for a category: family override → default → "wants". */
const pillarFor = (category: string, overrides: Record<string, Pillar>): Pillar =>
    overrides[category] ?? DEFAULT_PILLAR_BY_CATEGORY[category] ?? 'wants';

// GET /api/kakeibo?month=&year= — full monthly kakeibo summary.
router.get('/', async (req: AuthRequest, res) => {
    try {
        const month = Number(req.query.month);
        const year = Number(req.query.year);
        if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
            return res.status(400).json({ success: false, error: 'month and year are required' });
        }

        // Household salaries (fixed, carried every month).
        const members = await query(
            `SELECT id, name, color, monthly_income
       FROM family_members WHERE user_id = $1 ORDER BY name`,
            [req.userId]
        );
        const incomes = members.rows.map((m) => ({
            id: m.id, name: m.name, color: m.color, monthly_income: toNumber(m.monthly_income),
        }));
        const salaryIncome = incomes.reduce((s, m) => s + m.monthly_income, 0);

        // One-off income entries recorded that month (bonuses, refunds…).
        const extraIncomeResult = await query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM budget_entries
       WHERE user_id = $1 AND is_expense = false
         AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
            [req.userId, month, year]
        );
        const extraIncome = toNumber(extraIncomeResult.rows[0]?.total);
        const totalIncome = salaryIncome + extraIncome;

        // Expenses by category = one-off entries + active recurring debits.
        const entryByCat = await query(
            `SELECT category, SUM(amount) AS total FROM budget_entries
       WHERE user_id = $1 AND is_expense = true
         AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
       GROUP BY category`,
            [req.userId, month, year]
        );
        const recurringByCat = await query(
            `SELECT category, SUM(amount) AS total FROM recurring_expenses
       WHERE user_id = $1 AND is_active = true
         AND created_at < make_date($3, $2, 1) + interval '1 month'
       GROUP BY category`,
            [req.userId, month, year]
        );

        const spentByCategory = new Map<string, number>();
        for (const row of [...entryByCat.rows, ...recurringByCat.rows]) {
            spentByCategory.set(row.category, (spentByCategory.get(row.category) || 0) + toNumber(row.total));
        }

        // Roll categories up into the 4 pillars.
        const overridesResult = await query('SELECT kakeibo_pillars FROM users WHERE id = $1', [req.userId]);
        const overrides = parsePillars(overridesResult.rows[0]?.kakeibo_pillars);
        const byPillar: Record<Pillar, number> = { survival: 0, wants: 0, culture: 0, extra: 0 };
        const byCategory: Array<{ category: string; amount: number; pillar: Pillar }> = [];
        for (const [category, amount] of spentByCategory.entries()) {
            const pillar = pillarFor(category, overrides);
            byPillar[pillar] += amount;
            byCategory.push({ category, amount, pillar });
        }
        byCategory.sort((a, b) => b.amount - a.amount);
        const totalExpenses = Array.from(spentByCategory.values()).reduce((s, v) => s + v, 0);

        // Savings goal + review notes for the month.
        const monthRow = await query(
            'SELECT savings_goal, notes FROM kakeibo_months WHERE user_id = $1 AND month = $2 AND year = $3',
            [req.userId, month, year]
        );
        const savingsGoal = toNumber(monthRow.rows[0]?.savings_goal);
        const notes: string | null = monthRow.rows[0]?.notes ?? null;

        // The kakeibo question: income − goal = what's left to spend; then how much
        // did you actually save?
        const availableToSpend = totalIncome - savingsGoal;
        const actualSavings = totalIncome - totalExpenses;

        res.json({
            success: true,
            data: {
                month, year,
                incomes,
                salaryIncome,
                extraIncome,
                totalIncome,
                savingsGoal,
                availableToSpend,
                totalExpenses,
                actualSavings,
                savingsGoalReached: actualSavings >= savingsGoal,
                byPillar,
                byCategory,
                notes,
            },
        });
    } catch (error) {
        console.error('Get kakeibo error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/kakeibo/income — parents set each member's fixed monthly salary.
// body: { incomes: { [memberId]: number } }
router.put('/income', requireParent, async (req: AuthRequest, res) => {
    try {
        const { incomes } = req.body as { incomes?: unknown };
        if (typeof incomes !== 'object' || incomes === null || Array.isArray(incomes)) {
            return res.status(400).json({ success: false, error: 'incomes must be an object' });
        }
        for (const [memberId, value] of Object.entries(incomes as Record<string, unknown>)) {
            const amount = toNumber(value);
            if (amount < 0 || amount > 1_000_000) {
                return res.status(400).json({ success: false, error: 'Invalid income amount' });
            }
            // Scope by user_id so a family can only edit its own members.
            await query(
                'UPDATE family_members SET monthly_income = $1 WHERE id = $2 AND user_id = $3',
                [amount, memberId, req.userId]
            );
        }
        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
        res.json({ success: true });
    } catch (error) {
        console.error('Update kakeibo income error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/kakeibo/month — parents set the savings goal / review notes.
// body: { month, year, savings_goal?, notes? }
router.put('/month', requireParent, async (req: AuthRequest, res) => {
    try {
        const { month, year, savings_goal, notes } = req.body as {
            month?: unknown; year?: unknown; savings_goal?: unknown; notes?: unknown;
        };
        const m = Number(month); const y = Number(year);
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y)) {
            return res.status(400).json({ success: false, error: 'month and year are required' });
        }
        const goal = savings_goal === undefined ? 0 : toNumber(savings_goal);
        if (goal < 0 || goal > 10_000_000) {
            return res.status(400).json({ success: false, error: 'Invalid savings goal' });
        }
        const cleanNotes = typeof notes === 'string' ? notes.slice(0, 2000) : null;

        await query(
            `INSERT INTO kakeibo_months (user_id, month, year, savings_goal, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, month, year)
       DO UPDATE SET savings_goal = EXCLUDED.savings_goal, notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP`,
            [req.userId, m, y, goal, cleanNotes]
        );
        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
        res.json({ success: true });
    } catch (error) {
        console.error('Update kakeibo month error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/kakeibo/pillars — current category→pillar mapping (with defaults filled).
router.get('/pillars', async (req: AuthRequest, res) => {
    try {
        const overridesResult = await query('SELECT kakeibo_pillars FROM users WHERE id = $1', [req.userId]);
        const overrides = parsePillars(overridesResult.rows[0]?.kakeibo_pillars);
        const categories = (await getFamilyCategories(req.userId!)).budget;
        const mapping: Record<string, Pillar> = {};
        for (const category of categories) mapping[category] = pillarFor(category, overrides);
        res.json({ success: true, data: { pillars: PILLARS, mapping } });
    } catch (error) {
        console.error('Get kakeibo pillars error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/kakeibo/pillars — parents remap categories to pillars.
// body: { mapping: { [category]: pillar } }
router.put('/pillars', requireParent, async (req: AuthRequest, res) => {
    try {
        const { mapping } = req.body as { mapping?: unknown };
        if (typeof mapping !== 'object' || mapping === null || Array.isArray(mapping)) {
            return res.status(400).json({ success: false, error: 'mapping must be an object' });
        }
        const clean: Record<string, Pillar> = {};
        for (const [category, pillar] of Object.entries(mapping as Record<string, unknown>)) {
            if (typeof pillar !== 'string' || !(PILLARS as readonly string[]).includes(pillar)) {
                return res.status(400).json({ success: false, error: `Invalid pillar for ${category}` });
            }
            clean[category.slice(0, 50)] = pillar as Pillar;
        }
        await query('UPDATE users SET kakeibo_pillars = $1 WHERE id = $2', [JSON.stringify(clean), req.userId]);
        broadcast(req.userId!, { type: 'update', entity: 'budget', action: 'updated' });
        res.json({ success: true, data: { mapping: clean } });
    } catch (error) {
        console.error('Update kakeibo pillars error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
