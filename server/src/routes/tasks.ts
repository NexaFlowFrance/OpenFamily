import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, isParentAccount, requireParent } from '../middleware/auth';
import { toNullIfEmpty } from '../lib/normalize';
import { broadcast } from '../lib/broadcaster';

const router = Router();
router.use(authMiddleware);

// Points are non-negative integers; anything else is treated as 0.
const sanitizePoints = (value: unknown): number => {
    const n = typeof value === 'string' ? parseInt(value, 10) : (value as number);
    return Number.isInteger(n) && n > 0 ? n : 0;
};

/**
 * Credit one 'earn' transaction per assigned member for a completed task.
 * The note is the task title so the history stays readable on its own.
 */
const awardTaskPoints = async (task: { id: string; title: string; points: number; assigned_to: string[] }, userId: string) => {
    for (const memberId of task.assigned_to) {
        await query(
            `INSERT INTO reward_transactions (user_id, member_id, task_id, points, type, note)
             VALUES ($1, $2, $3, $4, 'earn', $5)`,
            [userId, memberId, task.id, task.points, task.title]
        );
    }
};

const ensureMembersBelongToUser = async (memberIds: string[], userId: string) => {
    for (const memberId of memberIds) {
        const member = await query(
            'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
            [memberId, userId]
        );
        if (member.rows.length === 0) {
            throw new Error('INVALID_MEMBER');
        }
    }
};

const enrichTasksWithMembers = async (tasks: any[], userId: string) => {
    if (tasks.length === 0) return tasks;
    const membersResult = await query(
        'SELECT id, name, color FROM family_members WHERE user_id = $1',
        [userId]
    );
    const membersById = new Map(membersResult.rows.map((m: any) => [m.id, m]));
    return tasks.map((task) => {
        const assignedTo: string[] = Array.isArray(task.assigned_to) ? task.assigned_to : [];
        return {
            ...task,
            assigned_to: assignedTo,
            assigned_to_members: assignedTo.map((id) => membersById.get(id)).filter(Boolean),
        };
    });
};

// Get all tasks
router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM tasks WHERE user_id = $1 ORDER BY due_date ASC NULLS LAST, created_at DESC',
            [req.userId]
        );
        const tasks = await enrichTasksWithMembers(result.rows, req.userId!);
        res.json({ success: true, data: tasks });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create task
router.post('/', async (req: AuthRequest, res) => {
    try {
        const { title, description, due_date, frequency, priority, assigned_to, points } = req.body;

        const cleanedTitle = typeof title === 'string' ? title.trim() : '';
        if (!cleanedTitle) {
            return res.status(400).json({ success: false, error: 'Title is required' });
        }

        const assignedTo: string[] = Array.isArray(assigned_to)
            ? assigned_to.filter((id: any) => typeof id === 'string' && id.trim())
            : [];
        await ensureMembersBelongToUser(assignedTo, req.userId!);

        // Only parents may put points on a chore — silently ignore the field otherwise.
        const taskPoints = points !== undefined && (await isParentAccount(req.actualUserId))
            ? sanitizePoints(points)
            : 0;

        const result = await query(
            `INSERT INTO tasks (user_id, title, description, due_date, frequency, priority, assigned_to, points)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING *`,
            [
                req.userId,
                cleanedTitle,
                toNullIfEmpty(description),
                toNullIfEmpty(due_date),
                toNullIfEmpty(frequency),
                toNullIfEmpty(priority),
                JSON.stringify(assignedTo),
                taskPoints,
            ]
        );

        const [enriched] = await enrichTasksWithMembers([result.rows[0]], req.userId!);
        broadcast(req.userId!, { type: 'update', entity: 'tasks', action: 'created' });
        res.json({ success: true, data: enriched });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Assigned member not found' });
        }

        console.error('Create task error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update task
router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { title, description, is_completed, due_date, frequency, priority, assigned_to, points } = req.body;

        // The previous state drives the reward logic (false→true transition only).
        const existingResult = await query(
            'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }
        const existing = existingResult.rows[0];
        const isParent = await isParentAccount(req.actualUserId);

        const updates: string[] = [];
        const values: any[] = [];

        const pushUpdate = (field: string, value: any) => {
            values.push(value);
            updates.push(`${field} = $${values.length}`);
        };

        if (title !== undefined) {
            const cleanedTitle = typeof title === 'string' ? title.trim() : '';
            if (!cleanedTitle) {
                return res.status(400).json({ success: false, error: 'Title cannot be empty' });
            }
            pushUpdate('title', cleanedTitle);
        }

        if (description !== undefined) {
            pushUpdate('description', toNullIfEmpty(description));
        }

        if (due_date !== undefined) {
            pushUpdate('due_date', toNullIfEmpty(due_date));
        }

        if (frequency !== undefined) {
            pushUpdate('frequency', toNullIfEmpty(frequency));
        }

        if (priority !== undefined) {
            pushUpdate('priority', toNullIfEmpty(priority));
        }

        if (assigned_to !== undefined) {
            const assignedTo: string[] = Array.isArray(assigned_to)
                ? assigned_to.filter((mid: any) => typeof mid === 'string' && mid.trim())
                : [];
            await ensureMembersBelongToUser(assignedTo, req.userId!);
            values.push(JSON.stringify(assignedTo));
            updates.push(`assigned_to = $${values.length}::jsonb`);
        }

        // Only parents may set/modify points — silently ignore the field otherwise.
        if (points !== undefined && isParent) {
            pushUpdate('points', sanitizePoints(points));
        }

        let rewardsChanged = false;
        // Award AFTER the UPDATE so the transactions' created_at is >= the new
        // completed_at — the reversal filter on un-complete relies on that order.
        let awardAfterUpdate: { points: number; assigned_to: string[] } | null = null;

        if (is_completed !== undefined) {
            const isCompleted = Boolean(is_completed);
            const wasCompleted = Boolean(existing.is_completed);
            pushUpdate('is_completed', isCompleted);
            // Only touch completed_at on a real transition: a repeated
            // "is_completed: true" PUT must not refresh the timestamp, which
            // anchors the earn transactions of the current completion cycle.
            if (isCompleted !== wasCompleted) {
                updates.push(`completed_at = ${isCompleted ? 'NOW()' : 'NULL'}`);
            }

            if (isCompleted && !wasCompleted) {
                // Completion transition (false → true) only — repeated PUTs with
                // is_completed already true never award twice.
                const effectivePoints = points !== undefined && isParent
                    ? sanitizePoints(points)
                    : sanitizePoints(existing.points);
                const effectiveAssigned: string[] = assigned_to !== undefined && Array.isArray(assigned_to)
                    ? assigned_to.filter((mid: any) => typeof mid === 'string' && mid.trim())
                    : (Array.isArray(existing.assigned_to) ? existing.assigned_to : []);

                if (effectivePoints > 0 && effectiveAssigned.length > 0) {
                    if (isParent) {
                        awardAfterUpdate = { points: effectivePoints, assigned_to: effectiveAssigned };
                        updates.push('pending_approval = false');
                        rewardsChanged = true;
                    } else {
                        // A child completing a points chore must wait for a parent.
                        updates.push('pending_approval = true');
                        rewardsChanged = true; // pending-approval counters change
                    }
                }
            } else if (!isCompleted && wasCompleted) {
                // Un-completing reverses the CURRENT completion only: earn
                // transactions created at-or-after completed_at belong to this
                // cycle (recurring chores are re-completed later, producing new
                // rows with later timestamps — earlier cycles stay untouched).
                const deleted = await query(
                    `DELETE FROM reward_transactions
                     WHERE task_id = $1 AND user_id = $2 AND type = 'earn'
                       AND created_at >= COALESCE($3::timestamp, '-infinity'::timestamp)
                     RETURNING id`,
                    [id, req.userId, existing.completed_at || null]
                );
                if (deleted.rows.length > 0) rewardsChanged = true;
                if (existing.pending_approval) {
                    updates.push('pending_approval = false');
                    rewardsChanged = true;
                }
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const result = await query(
            `UPDATE tasks
       SET ${updates.join(', ')}
       WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
       RETURNING *`,
            [...values, id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }

        if (awardAfterUpdate) {
            await awardTaskPoints(
                { id, title: result.rows[0].title, points: awardAfterUpdate.points, assigned_to: awardAfterUpdate.assigned_to },
                req.userId!
            );
        }

        const [enriched] = await enrichTasksWithMembers([result.rows[0]], req.userId!);
        broadcast(req.userId!, { type: 'update', entity: 'tasks', action: 'updated' });
        if (rewardsChanged) {
            broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'updated' });
        }
        res.json({ success: true, data: enriched });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Assigned member not found' });
        }

        console.error('Update task error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Approve a child-completed task: credit the points and clear the pending flag
router.post('/:id/approve', requireParent, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const existingResult = await query(
            'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }
        const task = existingResult.rows[0];
        if (!task.pending_approval) {
            return res.status(400).json({ success: false, error: 'Task is not awaiting approval' });
        }

        const assignedTo: string[] = Array.isArray(task.assigned_to) ? task.assigned_to : [];
        const taskPoints = sanitizePoints(task.points);
        if (taskPoints > 0 && assignedTo.length > 0) {
            await awardTaskPoints({ id, title: task.title, points: taskPoints, assigned_to: assignedTo }, req.userId!);
        }

        const result = await query(
            'UPDATE tasks SET pending_approval = false WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, req.userId]
        );

        const [enriched] = await enrichTasksWithMembers([result.rows[0]], req.userId!);
        broadcast(req.userId!, { type: 'update', entity: 'tasks', action: 'updated' });
        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'updated' });
        res.json({ success: true, data: enriched });
    } catch (error) {
        console.error('Approve task error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Reject a child-completed task: no points, and the chore must be redone
router.post('/:id/reject', requireParent, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const existingResult = await query(
            'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }
        if (!existingResult.rows[0].pending_approval) {
            return res.status(400).json({ success: false, error: 'Task is not awaiting approval' });
        }

        const result = await query(
            `UPDATE tasks
             SET pending_approval = false, is_completed = false, completed_at = NULL
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [id, req.userId]
        );

        const [enriched] = await enrichTasksWithMembers([result.rows[0]], req.userId!);
        broadcast(req.userId!, { type: 'update', entity: 'tasks', action: 'updated' });
        broadcast(req.userId!, { type: 'update', entity: 'rewards', action: 'updated' });
        res.json({ success: true, data: enriched });
    } catch (error) {
        console.error('Reject task error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete task
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }

        broadcast(req.userId!, { type: 'update', entity: 'tasks', action: 'deleted' });
        res.json({ success: true, message: 'Task deleted' });
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get task statistics
router.get('/statistics', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_completed = true) as completed,
         COUNT(*) FILTER (WHERE is_completed = false) as pending,
         COUNT(*) FILTER (WHERE priority = 'Haute') as high_priority,
         COUNT(*) FILTER (WHERE priority = 'Moyenne') as medium_priority,
         COUNT(*) FILTER (WHERE priority = 'Basse') as low_priority
       FROM tasks WHERE user_id = $1`,
            [req.userId]
        );

        const stats = result.rows[0];
        const total = parseInt(stats.total, 10) || 0;
        const completed = parseInt(stats.completed, 10) || 0;
        const completionRate = total > 0 ? (completed / total) * 100 : 0;

        res.json({
            success: true,
            data: {
                total,
                completed,
                pending: parseInt(stats.pending, 10) || 0,
                completionRate: Math.round(completionRate),
                byPriority: {
                    Haute: parseInt(stats.high_priority, 10) || 0,
                    Moyenne: parseInt(stats.medium_priority, 10) || 0,
                    Basse: parseInt(stats.low_priority, 10) || 0,
                },
            },
        });
    } catch (error) {
        console.error('Get task statistics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
