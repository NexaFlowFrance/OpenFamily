import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, isParentAccount, requireParent } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';

const router = Router();
router.use(authMiddleware);

const DEFAULT_POINTS_VALUE = 0.10;

const ensureMemberBelongsToUser = async (memberId: unknown, userId: string): Promise<boolean> => {
    if (typeof memberId !== 'string' || !memberId.trim()) return false;
    const result = await query(
        'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
        [memberId, userId]
    );
    return result.rows.length > 0;
};

const getPointsValue = async (userId: string): Promise<number> => {
    const result = await query(
        'SELECT points_value FROM reward_settings WHERE user_id = $1',
        [userId]
    );
    if (result.rows.length === 0) return DEFAULT_POINTS_VALUE;
    const value = parseFloat(result.rows[0].points_value);
    return Number.isFinite(value) ? value : DEFAULT_POINTS_VALUE;
};

/**
 * Consecutive-day streak ending today or yesterday, from a set of
 * 'YYYY-MM-DD' activity dates. A streak of 1 means "active today/yesterday".
 */
const computeStreak = (dates: Set<string>): number => {
    const dayKey = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const cursor = new Date();
    // The streak may end today or yesterday (today's chore might not be done yet).
    if (!dates.has(dayKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dates.has(dayKey(cursor))) return 0;
    }
    let streak = 0;
    while (dates.has(dayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
};

// Per-member overview: balance, pocket-money value, pending approvals, streak.
router.get('/summary', async (req: AuthRequest, res) => {
    try {
        const userId = req.userId!;

        const [membersResult, balancesResult, pendingResult, ownerResult, activityResult] = await Promise.all([
            query('SELECT id, name, color, role, linked_user_id FROM family_members WHERE user_id = $1 ORDER BY name ASC', [userId]),
            query(
                `SELECT member_id, COALESCE(SUM(points), 0) AS balance, COUNT(*) AS tx_count
                 FROM reward_transactions WHERE user_id = $1 GROUP BY member_id`,
                [userId]
            ),
            query(
                'SELECT id, title, points, assigned_to FROM tasks WHERE user_id = $1 AND pending_approval = true ORDER BY completed_at DESC NULLS LAST',
                [userId]
            ),
            query('SELECT currency FROM users WHERE id = $1', [userId]),
            // Streak source: completion days per member. The schema does not keep
            // a per-member completion history (tasks.completed_at is reset when a
            // recurring chore is un-completed), so the durable signal is the
            // reward ledger ('earn' rows), complemented by tasks currently
            // completed (covers approvals pending and zero-point chores).
            query(
                `SELECT member_id, day FROM (
                    SELECT member_id, DATE(created_at) AS day
                    FROM reward_transactions
                    WHERE user_id = $1 AND type = 'earn'
                    UNION
                    SELECT jsonb_array_elements_text(assigned_to)::uuid AS member_id, DATE(completed_at) AS day
                    FROM tasks
                    WHERE user_id = $1 AND is_completed = true AND completed_at IS NOT NULL
                 ) days`,
                [userId]
            ),
        ]);

        const pointsValue = await getPointsValue(userId);
        const currency = ownerResult.rows[0]?.currency || 'EUR';

        const balanceByMember = new Map<string, { balance: number; txCount: number }>(
            balancesResult.rows.map((r: any) => [r.member_id, { balance: parseInt(r.balance, 10) || 0, txCount: parseInt(r.tx_count, 10) || 0 }])
        );

        const pendingCountByMember = new Map<string, number>();
        for (const task of pendingResult.rows) {
            const assigned: string[] = Array.isArray(task.assigned_to) ? task.assigned_to : [];
            for (const memberId of assigned) {
                pendingCountByMember.set(memberId, (pendingCountByMember.get(memberId) || 0) + 1);
            }
        }

        const activityByMember = new Map<string, Set<string>>();
        for (const row of activityResult.rows) {
            const day = typeof row.day === 'string' ? row.day : String(row.day).slice(0, 10);
            if (!activityByMember.has(row.member_id)) activityByMember.set(row.member_id, new Set());
            activityByMember.get(row.member_id)!.add(day.slice(0, 10));
        }

        const membersById = new Map(membersResult.rows.map((m: any) => [m.id, m]));
        const members = membersResult.rows.map((m: any) => {
            const bal = balanceByMember.get(m.id);
            const balance = bal?.balance || 0;
            return {
                id: m.id,
                name: m.name,
                color: m.color,
                role: m.role,
                linked_user_id: m.linked_user_id ?? null,
                balance,
                currency_value: Math.round(balance * pointsValue * 100) / 100,
                pending_count: pendingCountByMember.get(m.id) || 0,
                streak: computeStreak(activityByMember.get(m.id) || new Set()),
                has_activity: Boolean(bal && bal.txCount > 0),
            };
        });

        const pendingTasks = pendingResult.rows.map((task: any) => {
            const assigned: string[] = Array.isArray(task.assigned_to) ? task.assigned_to : [];
            return {
                id: task.id,
                title: task.title,
                points: task.points,
                assigned_to_members: assigned
                    .map((mid) => membersById.get(mid))
                    .filter(Boolean)
                    .map((m: any) => ({ id: m.id, name: m.name, color: m.color })),
            };
        });

        res.json({
            success: true,
            data: {
                points_value: pointsValue,
                currency,
                members,
                pending_tasks: pendingTasks,
            },
        });
    } catch (error) {
        console.error('Get rewards summary error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Recent transactions, newest first (optionally for a single member).
router.get('/transactions', async (req: AuthRequest, res) => {
    try {
        const { member_id } = req.query;
        const values: any[] = [req.userId];
        let where = 'rt.user_id = $1';
        if (member_id) {
            if (!(await ensureMemberBelongsToUser(member_id, req.userId!))) {
                return res.status(400).json({ success: false, error: 'Member not found' });
            }
            values.push(member_id);
            where += ` AND rt.member_id = $${values.length}`;
        }

        const result = await query(
            `SELECT rt.id, rt.member_id, rt.task_id, rt.points, rt.type, rt.note, rt.created_at
             FROM reward_transactions rt
             WHERE ${where}
             ORDER BY rt.created_at DESC
             LIMIT 50`,
            values
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get reward transactions error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Manual parent adjustment (bonus or penalty): ± points with a note.
router.post('/adjust', requireParent, async (req: AuthRequest, res) => {
    try {
        const { member_id, points, note } = req.body;

        if (!(await ensureMemberBelongsToUser(member_id, req.userId!))) {
            return res.status(400).json({ success: false, error: 'Member not found' });
        }

        const amount = typeof points === 'string' ? parseInt(points, 10) : points;
        if (!Number.isInteger(amount) || amount === 0) {
            return res.status(400).json({ success: false, error: 'Points must be a non-zero integer' });
        }

        const result = await query(
            `INSERT INTO reward_transactions (user_id, member_id, points, type, note)
             VALUES ($1, $2, $3, 'adjust', $4) RETURNING *`,
            [req.userId, member_id, amount, typeof note === 'string' && note.trim() ? note.trim() : null]
        );

        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'created' });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Adjust reward points error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Pay out pocket money: converts points into a negative 'redeem' transaction.
router.post('/redeem', requireParent, async (req: AuthRequest, res) => {
    try {
        const { member_id, points, note } = req.body;

        if (!(await ensureMemberBelongsToUser(member_id, req.userId!))) {
            return res.status(400).json({ success: false, error: 'Member not found' });
        }

        const amount = typeof points === 'string' ? parseInt(points, 10) : points;
        if (!Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Points must be a positive integer' });
        }

        const balanceResult = await query(
            'SELECT COALESCE(SUM(points), 0) AS balance FROM reward_transactions WHERE user_id = $1 AND member_id = $2',
            [req.userId, member_id]
        );
        const balance = parseInt(balanceResult.rows[0].balance, 10) || 0;
        if (amount > balance) {
            return res.status(400).json({ success: false, error: 'Not enough points' });
        }

        const result = await query(
            `INSERT INTO reward_transactions (user_id, member_id, points, type, note)
             VALUES ($1, $2, $3, 'redeem', $4) RETURNING *`,
            [req.userId, member_id, -amount, typeof note === 'string' && note.trim() ? note.trim() : null]
        );

        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'created' });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Redeem reward points error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ── Savings goals ─────────────────────────────────────────────────────────────
// Progress is never stored: the client computes balance × points_value vs target.

/** Member profile linked to the logged-in account (child accounts act on it only). */
const getLinkedMemberId = async (familyId: string, actualUserId: string): Promise<string | null> => {
    const result = await query(
        'SELECT id FROM family_members WHERE user_id = $1 AND linked_user_id = $2',
        [familyId, actualUserId]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
};

const mapGoal = (row: any) => ({
    id: row.id,
    member_id: row.member_id,
    title: row.title,
    emoji: row.emoji ?? null,
    target_amount: parseFloat(row.target_amount),
    status: row.status,
    created_at: row.created_at,
    achieved_at: row.achieved_at ?? null,
});

const cleanGoalTitle = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= 200 ? trimmed : null;
};

const cleanGoalEmoji = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 16) : null;
};

const cleanGoalTarget = (value: unknown): number | null => {
    const amount = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : (value as number);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999) return null;
    return Math.round(amount * 100) / 100;
};

// All the family's goals, newest first.
router.get('/goals', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM reward_goals WHERE user_id = $1 ORDER BY created_at DESC',
            [req.userId]
        );
        res.json({ success: true, data: result.rows.map(mapGoal) });
    } catch (error) {
        console.error('Get reward goals error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create a goal. Parents: for any member. Child accounts: only for their own linked member.
router.post('/goals', async (req: AuthRequest, res) => {
    try {
        const { member_id, title, emoji, target_amount } = req.body;

        if (!(await ensureMemberBelongsToUser(member_id, req.userId!))) {
            return res.status(400).json({ success: false, error: 'Member not found' });
        }

        if (!(await isParentAccount(req.actualUserId))) {
            const linkedMemberId = await getLinkedMemberId(req.userId!, req.actualUserId!);
            if (!linkedMemberId || linkedMemberId !== member_id) {
                return res.status(403).json({ success: false, error: 'Action réservée aux parents.' });
            }
        }

        const cleanTitle = cleanGoalTitle(title);
        if (!cleanTitle) {
            return res.status(400).json({ success: false, error: 'Title is required' });
        }
        const cleanTarget = cleanGoalTarget(target_amount);
        if (cleanTarget === null) {
            return res.status(400).json({ success: false, error: 'Target amount must be a positive number' });
        }

        // One active goal per member keeps the page (and the kid view hero) unambiguous.
        const activeResult = await query(
            "SELECT id FROM reward_goals WHERE user_id = $1 AND member_id = $2 AND status = 'active'",
            [req.userId, member_id]
        );
        if (activeResult.rows.length > 0) {
            return res.status(409).json({ success: false, error: 'An active goal already exists for this member' });
        }

        const result = await query(
            `INSERT INTO reward_goals (user_id, member_id, title, emoji, target_amount)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.userId, member_id, cleanTitle, cleanGoalEmoji(emoji), cleanTarget]
        );

        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'created' });
        res.json({ success: true, data: mapGoal(result.rows[0]) });
    } catch (error) {
        console.error('Create reward goal error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Edit title / emoji / target. Parents: any goal. Child accounts: their member's active goal.
router.put('/goals/:id', async (req: AuthRequest, res) => {
    try {
        const goalResult = await query(
            'SELECT * FROM reward_goals WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );
        if (goalResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }
        const goal = goalResult.rows[0];

        if (!(await isParentAccount(req.actualUserId))) {
            const linkedMemberId = await getLinkedMemberId(req.userId!, req.actualUserId!);
            if (!linkedMemberId || linkedMemberId !== goal.member_id || goal.status !== 'active') {
                return res.status(403).json({ success: false, error: 'Action réservée aux parents.' });
            }
        }

        const { title, emoji, target_amount } = req.body;
        const updates: string[] = [];
        const values: any[] = [];
        const pushUpdate = (field: string, value: any) => {
            values.push(value);
            updates.push(`${field} = $${values.length}`);
        };

        if (title !== undefined) {
            const cleanTitle = cleanGoalTitle(title);
            if (!cleanTitle) {
                return res.status(400).json({ success: false, error: 'Title is required' });
            }
            pushUpdate('title', cleanTitle);
        }
        if (emoji !== undefined) {
            pushUpdate('emoji', cleanGoalEmoji(emoji));
        }
        if (target_amount !== undefined) {
            const cleanTarget = cleanGoalTarget(target_amount);
            if (cleanTarget === null) {
                return res.status(400).json({ success: false, error: 'Target amount must be a positive number' });
            }
            pushUpdate('target_amount', cleanTarget);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const result = await query(
            `UPDATE reward_goals SET ${updates.join(', ')}
             WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
             RETURNING *`,
            [...values, req.params.id, req.userId]
        );

        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'updated' });
        res.json({ success: true, data: mapGoal(result.rows[0]) });
    } catch (error) {
        console.error('Update reward goal error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Parent marks the goal achieved and pays it out: auto-redeems the equivalent
// points (target ÷ point value, capped at the member's balance), note = goal title.
router.post('/goals/:id/achieve', requireParent, async (req: AuthRequest, res) => {
    try {
        const goalResult = await query(
            "SELECT * FROM reward_goals WHERE id = $1 AND user_id = $2 AND status = 'active'",
            [req.params.id, req.userId]
        );
        if (goalResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }
        const goal = goalResult.rows[0];

        const result = await query(
            "UPDATE reward_goals SET status = 'achieved', achieved_at = NOW() WHERE id = $1 RETURNING *",
            [goal.id]
        );

        // Same semantics as POST /redeem, capped at the available balance.
        const pointsValue = await getPointsValue(req.userId!);
        const balanceResult = await query(
            'SELECT COALESCE(SUM(points), 0) AS balance FROM reward_transactions WHERE user_id = $1 AND member_id = $2',
            [req.userId, goal.member_id]
        );
        const balance = parseInt(balanceResult.rows[0].balance, 10) || 0;
        const targetPoints = pointsValue > 0 ? Math.round(parseFloat(goal.target_amount) / pointsValue) : 0;
        const redeemPoints = Math.min(Math.max(targetPoints, 0), Math.max(balance, 0));

        if (redeemPoints > 0) {
            const note = goal.emoji ? `${goal.emoji} ${goal.title}` : goal.title;
            await query(
                `INSERT INTO reward_transactions (user_id, member_id, points, type, note)
                 VALUES ($1, $2, $3, 'redeem', $4)`,
                [req.userId, goal.member_id, -redeemPoints, note]
            );
        }

        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'updated' });
        res.json({ success: true, data: { ...mapGoal(result.rows[0]), redeemed_points: redeemPoints } });
    } catch (error) {
        console.error('Achieve reward goal error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete a goal. Parents: any goal. Child accounts: their member's active goal.
router.delete('/goals/:id', async (req: AuthRequest, res) => {
    try {
        const goalResult = await query(
            'SELECT * FROM reward_goals WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );
        if (goalResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }
        const goal = goalResult.rows[0];

        if (!(await isParentAccount(req.actualUserId))) {
            const linkedMemberId = await getLinkedMemberId(req.userId!, req.actualUserId!);
            if (!linkedMemberId || linkedMemberId !== goal.member_id || goal.status !== 'active') {
                return res.status(403).json({ success: false, error: 'Action réservée aux parents.' });
            }
        }

        await query('DELETE FROM reward_goals WHERE id = $1 AND user_id = $2', [goal.id, req.userId]);
        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'deleted' });
        res.json({ success: true, message: 'Goal deleted' });
    } catch (error) {
        console.error('Delete reward goal error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Currency value of one point — readable by any member.
router.get('/settings', async (req: AuthRequest, res) => {
    try {
        const pointsValue = await getPointsValue(req.userId!);
        res.json({ success: true, data: { points_value: pointsValue } });
    } catch (error) {
        console.error('Get reward settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update the per-point value (parents only).
router.put('/settings', requireParent, async (req: AuthRequest, res) => {
    try {
        const { points_value } = req.body;
        const value = typeof points_value === 'string' ? parseFloat(points_value) : points_value;
        if (!Number.isFinite(value) || value < 0 || value > 1000) {
            return res.status(400).json({ success: false, error: 'Invalid points value' });
        }

        await query(
            `INSERT INTO reward_settings (user_id, points_value)
             VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE SET points_value = $2, updated_at = NOW()`,
            [req.userId, value]
        );

        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'updated' });
        res.json({ success: true, data: { points_value: value } });
    } catch (error) {
        console.error('Update reward settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
