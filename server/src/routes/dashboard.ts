import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Get dashboard statistics
router.get('/', async (req: AuthRequest, res) => {
    try {
        // Get upcoming appointments count
        const appointmentsResult = await query(
            `SELECT COUNT(*) as count FROM appointments 
       WHERE user_id = $1 AND start_time >= NOW() AND start_time <= NOW() + INTERVAL '7 days'`,
            [req.userId]
        );

        // Get pending tasks count
        const tasksResult = await query(
            `SELECT COUNT(*) as count FROM tasks 
       WHERE user_id = $1 AND is_completed = false`,
            [req.userId]
        );

        // Get shopping items count
        const shoppingResult = await query(
            `SELECT COUNT(*) as count FROM shopping_items 
       WHERE user_id = $1 AND is_checked = false`,
            [req.userId]
        );

        // Get this month's expenses
        const budgetResult = await query(
            `SELECT SUM(amount) as total FROM budget_entries 
       WHERE user_id = $1 AND is_expense = true 
       AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM NOW())
       AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM NOW())`,
            [req.userId]
        );

        // Get budget alerts (categories over limit)
        const alertsResult = await query(
            `SELECT COUNT(*) as count
       FROM (
         SELECT be.category
         FROM budget_entries be
         JOIN budget_limits bl ON be.category = bl.category
           AND bl.user_id = be.user_id
           AND bl.month = EXTRACT(MONTH FROM be.date)
           AND bl.year = EXTRACT(YEAR FROM be.date)
         WHERE be.user_id = $1
           AND be.is_expense = true
           AND EXTRACT(MONTH FROM be.date) = EXTRACT(MONTH FROM NOW())
           AND EXTRACT(YEAR FROM be.date) = EXTRACT(YEAR FROM NOW())
         GROUP BY be.category, bl.monthly_limit
         HAVING SUM(be.amount) > bl.monthly_limit
       ) alert_categories`,
            [req.userId]
        );

        res.json({
            success: true,
            data: {
                upcomingAppointments: parseInt(appointmentsResult.rows[0]?.count || '0'),
                pendingTasks: parseInt(tasksResult.rows[0]?.count || '0'),
                shoppingItems: parseInt(shoppingResult.rows[0]?.count || '0'),
                thisMonthExpenses: parseFloat(budgetResult.rows[0]?.total || '0'),
                budgetAlerts: parseInt(alertsResult.rows[0]?.count || '0')
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
