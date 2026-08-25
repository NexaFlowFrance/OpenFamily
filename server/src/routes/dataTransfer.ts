import { Router } from 'express';
import { getClient, query } from '../db';
import { authMiddleware, requireParent, AuthRequest } from '../middleware/auth';

// Explicit per-table column whitelist matching the export format. `id` stays allowed
// (UUIDs preserve relation integrity and let ON CONFLICT DO NOTHING deduplicate);
// `user_id` is always forced to the importing family and is never taken from the file.
const IMPORT_COLUMNS: Record<string, ReadonlySet<string>> = {
    family_members: new Set(['id', 'name', 'role', 'birth_date', 'color', 'blood_type', 'allergies', 'medications', 'vaccines', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact', 'notes', 'medical_notes', 'avatar_url', 'created_at', 'updated_at']),
    tasks: new Set(['id', 'title', 'description', 'is_completed', 'due_date', 'frequency', 'priority', 'assigned_to', 'completed_at', 'created_at', 'updated_at']),
    recipes: new Set(['id', 'name', 'category', 'description', 'ingredients', 'instructions', 'prep_time', 'cook_time', 'servings', 'difficulty', 'tags', 'image_url', 'created_at', 'updated_at']),
    meal_plans: new Set(['id', 'date', 'meal_type', 'recipe_id', 'custom_meal', 'notes', 'created_at', 'updated_at']),
    budget_entries: new Set(['id', 'category', 'amount', 'description', 'date', 'is_expense', 'assigned_to', 'created_at', 'updated_at']),
    budget_limits: new Set(['id', 'category', 'monthly_limit', 'month', 'year', 'created_at', 'updated_at']),
    shopping_items: new Set(['id', 'name', 'category', 'quantity', 'unit', 'price', 'is_checked', 'notes', 'created_at', 'updated_at']),
    appointments: new Set(['id', 'title', 'description', 'start_time', 'end_time', 'location', 'family_member_ids', 'reminder_30min', 'reminder_1hour', 'notes', 'caldav_uid', 'created_at', 'updated_at']),
    schedule_entries: new Set(['id', 'family_member_id', 'schedule_type', 'title', 'day_of_week', 'start_time', 'end_time', 'specific_date', 'location', 'notes', 'created_at', 'updated_at']),
};

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
            scheduleEntryMembers,
            scheduleEntryExceptions,
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
            // These two hang off schedule_entries and carry no user_id of their
            // own, so they are scoped through their parent entry.
            query(
                `SELECT sem.* FROM schedule_entry_members sem
                 JOIN schedule_entries se ON se.id = sem.entry_id
                 WHERE se.user_id = $1`,
                [userId]
            ),
            query(
                `SELECT see.entry_id, to_char(see.excluded_date, 'YYYY-MM-DD') AS excluded_date
                 FROM schedule_entry_exceptions see
                 JOIN schedule_entries se ON se.id = see.entry_id
                 WHERE se.user_id = $1`,
                [userId]
            ),
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
            schedule_entry_members: scheduleEntryMembers.rows,
            schedule_entry_exceptions: scheduleEntryExceptions.rows,
        };

        res.json({ success: true, data: exportData });
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Import user data (parents only — overwrites/extends the whole family dataset)
router.post('/import', requireParent, async (req: AuthRequest, res) => {
    const userId = req.userId!;
    const importData = req.body;

    if (!importData || typeof importData !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid import data format' });
    }

    const client = await getClient();
    const counts: Record<string, number> = {};

    const importRows = async (table: string, rows: unknown) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        const allowedColumns = IMPORT_COLUMNS[table];
        if (!allowedColumns) return;
        let count = 0;
        for (const row of rows) {
            const entry: Record<string, unknown> = { ...(row as Record<string, unknown>), user_id: userId };
            // Keep only whitelisted columns for this table (user_id is always forced above)
            const keys = Object.keys(entry).filter((k) => k === 'user_id' || allowedColumns.has(k));
            if (keys.length === 0) continue;
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

    /**
     * Participants and skipped dates of planning entries.
     *
     * These two tables have no user_id, so importRows cannot carry them: it
     * forces user_id on every row. They are scoped through their parent entry
     * instead, and the INSERT ... WHERE EXISTS below is what enforces it. A
     * hand-edited export naming somebody else's entry_id writes nothing rather
     * than writing into their family.
     */
    const importEntryChildren = async (data: Record<string, unknown>) => {
        const members = Array.isArray(data.schedule_entry_members) ? data.schedule_entry_members : [];
        let memberCount = 0;
        for (const row of members as Array<Record<string, unknown>>) {
            if (!row?.entry_id || !row?.family_member_id) continue;
            const result = await client.query(
                `INSERT INTO schedule_entry_members (entry_id, family_member_id)
                 SELECT $1::uuid, $2::uuid
                 WHERE EXISTS (SELECT 1 FROM schedule_entries WHERE id = $1::uuid AND user_id = $3)
                   AND EXISTS (SELECT 1 FROM family_members WHERE id = $2::uuid AND user_id = $3)
                 ON CONFLICT DO NOTHING`,
                [row.entry_id, row.family_member_id, userId]
            );
            memberCount += result.rowCount ?? 0;
        }
        counts.schedule_entry_members = memberCount;

        const exceptions = Array.isArray(data.schedule_entry_exceptions) ? data.schedule_entry_exceptions : [];
        let exceptionCount = 0;
        for (const row of exceptions as Array<Record<string, unknown>>) {
            if (!row?.entry_id || !row?.excluded_date) continue;
            const result = await client.query(
                `INSERT INTO schedule_entry_exceptions (entry_id, excluded_date)
                 SELECT $1::uuid, $2::date
                 WHERE EXISTS (SELECT 1 FROM schedule_entries WHERE id = $1::uuid AND user_id = $3)
                 ON CONFLICT DO NOTHING`,
                [row.entry_id, row.excluded_date, userId]
            );
            exceptionCount += result.rowCount ?? 0;
        }
        counts.schedule_entry_exceptions = exceptionCount;

        // A backup taken before participants existed carries none. The startup
        // migration cannot help here, it already ran, so give every entry that
        // still has no participant the one it was exported with.
        await client.query(
            `INSERT INTO schedule_entry_members (entry_id, family_member_id)
             SELECT se.id, se.family_member_id
             FROM schedule_entries se
             WHERE se.user_id = $1
               AND NOT EXISTS (
                   SELECT 1 FROM schedule_entry_members sem WHERE sem.entry_id = se.id
               )
             ON CONFLICT DO NOTHING`,
            [userId]
        );
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
        await importEntryChildren(importData);
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
