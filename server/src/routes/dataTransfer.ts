import { Router } from 'express';
import { getClient, query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Export all user data
router.get('/export', async (req: AuthRequest, res) => {
    try {
        const userId = req.userId!;

        const [
            familyMembers,
            tasks,
            recipes,
            mealPlans,
            budgetEntries,
            budgetLimits,
            shoppingItems,
            appointments,
            scheduleEntries,
        ] = await Promise.all([
            query('SELECT * FROM family_members WHERE user_id = $1', [userId]),
            query('SELECT * FROM tasks WHERE user_id = $1', [userId]),
            query('SELECT * FROM recipes WHERE user_id = $1', [userId]),
            query('SELECT * FROM meal_plans WHERE user_id = $1', [userId]),
            query('SELECT * FROM budget_entries WHERE user_id = $1', [userId]),
            query('SELECT * FROM budget_limits WHERE user_id = $1', [userId]),
            query('SELECT * FROM shopping_items WHERE user_id = $1', [userId]),
            query('SELECT * FROM appointments WHERE user_id = $1', [userId]),
            query('SELECT * FROM schedule_entries WHERE user_id = $1', [userId]),
        ]);

        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            family_members: familyMembers.rows,
            tasks: tasks.rows,
            recipes: recipes.rows,
            meal_plans: mealPlans.rows,
            budget_entries: budgetEntries.rows,
            budget_limits: budgetLimits.rows,
            shopping_items: shoppingItems.rows,
            appointments: appointments.rows,
            schedule_entries: scheduleEntries.rows,
        };

        res.json({ success: true, data: exportData });
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Import user data
router.post('/import', async (req: AuthRequest, res) => {
    const userId = req.userId!;
    const importData = req.body;

    if (!importData || typeof importData !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid import data format' });
    }

    const client = await getClient();
    const counts: Record<string, number> = {};

    const importRows = async (table: string, rows: unknown) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        let count = 0;
        for (const row of rows) {
            const entry: Record<string, unknown> = { ...(row as Record<string, unknown>), user_id: userId };
            const keys = Object.keys(entry);
            const values = keys.map((k) => entry[k]);
            const placeholders = keys.map((_, i) => `$${i + 1}`);
            const result = await client.query(
                `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')})
                 VALUES (${placeholders.join(', ')})
                 ON CONFLICT DO NOTHING`,
                values
            );
            count += result.rowCount ?? 0;
        }
        counts[table] = count;
    };

    try {
        await client.query('BEGIN');

        // Import in order respecting foreign key constraints:
        // family_members and recipes must come before tables that reference them
        await importRows('family_members', importData.family_members);
        await importRows('recipes', importData.recipes);
        await importRows('tasks', importData.tasks);
        await importRows('budget_entries', importData.budget_entries);
        await importRows('budget_limits', importData.budget_limits);
        await importRows('shopping_items', importData.shopping_items);
        await importRows('appointments', importData.appointments);
        await importRows('schedule_entries', importData.schedule_entries);
        await importRows('meal_plans', importData.meal_plans);

        await client.query('COMMIT');
        res.json({ success: true, data: { imported: counts } });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Import error:', error);
        res.status(500).json({ success: false, error: 'Import failed. No data was modified.' });
    } finally {
        client.release();
    }
});

export default router;
