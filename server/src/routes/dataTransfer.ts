import express, { Router } from 'express';
import { PoolClient } from 'pg';
import { getClient, query } from '../db';
import { authMiddleware, requireParent, AuthRequest } from '../middleware/auth';
import { normalizeReminderMinutes, applyLegacyReminderFlags } from '../lib/reminders';
import { OPENFAMILY_VERSION } from '../version';
import { cleanContent, cleanImage, cleanLink } from '../lib/postFields';
import { cleanImageUrl } from '../lib/recipeImage';

const PORTABLE_FORMAT = 'openfamily-portable';
const PORTABLE_VERSION = '2.0';
const SUPPORTED_IMPORT_VERSIONS = new Set(['1.0', PORTABLE_VERSION]);
const SUPPORTED_LANGUAGES = new Set(['fr', 'en', 'pt', 'ru', 'zh']);

const PORTABLE_EXCLUSIONS = [
    'password_hashes_and_authentication_tokens',
    'account_authorization_and_family_membership_state',
    'calendar_tokens',
    'password_reset_tokens',
    'family_invites_and_join_requests',
    'push_subscriptions',
    'generated_notifications',
    'integration_credentials_and_configuration',
    'ai_provider_credentials_and_configuration',
    'migration_history',
] as const;

// user_id is never trusted from the import file. importRows() always forces
// ownership to the authenticated target family owner.
const IMPORT_COLUMNS: Record<string, ReadonlySet<string>> = {
    family_members: new Set([
        'id', 'name', 'role', 'birth_date', 'color', 'blood_type', 'allergies',
        'medications', 'vaccines', 'emergency_contact_name',
        'emergency_contact_phone', 'emergency_contact', 'notes', 'medical_notes',
        'avatar_url', 'monthly_income', 'linked_user_id', 'created_at', 'updated_at',
    ]),
    tasks: new Set([
        'id', 'title', 'description', 'is_completed', 'due_date', 'frequency',
        'priority', 'assigned_to', 'completed_at', 'points', 'pending_approval',
        'created_at', 'updated_at',
    ]),
    recipes: new Set([
        'id', 'name', 'category', 'description', 'ingredients', 'instructions',
        'prep_time', 'cook_time', 'servings', 'difficulty', 'tags', 'image_url',
        'created_at', 'updated_at',
    ]),
    meal_plans: new Set([
        'id', 'date', 'meal_type', 'recipe_id', 'custom_meal', 'notes',
        'created_at', 'updated_at',
    ]),
    budget_entries: new Set([
        'id', 'category', 'amount', 'description', 'date', 'is_expense',
        'assigned_to', 'created_at', 'updated_at',
    ]),
    budget_limits: new Set([
        'id', 'category', 'monthly_limit', 'month', 'year',
        'created_at', 'updated_at',
    ]),
    shopping_items: new Set([
        'id', 'name', 'category', 'quantity', 'unit', 'price', 'is_checked',
        'notes', 'created_at', 'updated_at',
    ]),
    shopping_list_templates: new Set([
        'id', 'name', 'items', 'created_at', 'updated_at',
    ]),
    appointments: new Set([
        'id', 'title', 'description', 'start_time', 'end_time', 'location',
        'family_member_ids', 'reminder_30min', 'reminder_1hour', 'reminder_minutes', 'notes',
        'caldav_uid', 'recurrence_frequency', 'recurrence_interval',
        'recurrence_until', 'color', 'is_all_day', 'created_at', 'updated_at',
    ]),
    schedule_entries: new Set([
        'id', 'family_member_id', 'schedule_type', 'title', 'day_of_week',
        'start_time', 'end_time', 'specific_date', 'location', 'notes',
        'created_at', 'updated_at',
    ]),
    reward_transactions: new Set([
        'id', 'member_id', 'task_id', 'points', 'type', 'note', 'created_at',
    ]),
    reward_settings: new Set([
        'id', 'points_value', 'created_at', 'updated_at',
    ]),
    reward_goals: new Set([
        'id', 'member_id', 'title', 'emoji', 'target_amount', 'status',
        'created_at', 'achieved_at',
    ]),
    family_notes: new Set([
        'id', 'author_name', 'content', 'color', 'expires_at', 'created_at',
    ]),
    recurring_expenses: new Set([
        'id', 'label', 'amount', 'category', 'debit_day', 'is_active',
        'is_expense', 'start_date', 'recurrence_frequency', 'recurrence_interval',
        'recurrence_until', 'created_at', 'updated_at',
    ]),
    recurring_expense_logs: new Set([
        'id', 'recurring_expense_id', 'month', 'year', 'occurrence_date',
        'is_pointed', 'pointed_at', 'created_at',
    ]),
    kakeibo_months: new Set([
        'id', 'month', 'year', 'savings_goal', 'notes', 'created_at', 'updated_at',
    ]),
    family_posts: new Set([
        'id', 'author_user_id', 'content', 'image_url', 'link_url',
        'created_at', 'updated_at',
    ]),
};

// node-postgres serializes JavaScript arrays as PostgreSQL arrays. These columns
// are JSONB, so explicitly JSON-encode them before binding.
const JSONB_COLUMNS: Record<string, ReadonlySet<string>> = {
    tasks: new Set(['assigned_to']),
    recipes: new Set(['ingredients', 'instructions', 'tags']),
    shopping_list_templates: new Set(['items']),
    appointments: new Set(['family_member_ids']),
};

const FAMILY_SETTINGS_COLUMNS = new Set([
    'currency',
    'disabled_modules',
    'custom_categories',
    'kakeibo_pillars',
]);

type PortableRow = Record<string, unknown>;
type RowTransform = (row: PortableRow) =>
    PortableRow | null | Promise<PortableRow | null>;

const router = Router();
router.use(authMiddleware);

// A family export carries every post photo inline, so it can be far larger than
// the 1 MB the rest of the API accepts. This parser runs on the import route only,
// after authMiddleware and requireParent; app.ts skips its own JSON parser for
// this path so an anonymous request never gets its body read.
const importBodyParser = express.json({ limit: '256mb' });

// Post rules throw on an invalid photo or link. On import the field is dropped
// instead, so one bad value does not reject a whole family's data.
const cleanOrNull = (clean: (value: unknown) => string | null, value: unknown): string | null => {
    try {
        return clean(value);
    } catch {
        return null;
    }
};

const asRecord = (value: unknown): PortableRow | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as PortableRow
        : null;

const sourceId = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

const sanitizeMemberArray = (
    value: unknown,
    ownedMemberIds: ReadonlySet<string>
): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (id): id is string => typeof id === 'string' && ownedMemberIds.has(id)
    );
};

// Files exported before 1.7.2 describe recurring budget items as "every month
// on debit_day", with one paid mark per month. Both now need a date; derive it
// exactly as migration core/0001-budget-recurrence does for existing data, so
// an old backup restores to the same schedule as an upgraded installation.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const clampedDay = (year: number, month: number, day: number): string => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const d = Math.min(Math.max(1, day), last);
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const validDebitDay = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

const loadOwnedIds = async (
    client: PoolClient,
    table: 'family_members' | 'recipes' | 'tasks' | 'recurring_expenses',
    ownerId: string
): Promise<Set<string>> => {
    const result = await client.query(
        `SELECT id FROM ${table} WHERE user_id = $1`,
        [ownerId]
    );
    return new Set(result.rows.map((row: { id: string }) => row.id));
};

/**
 * Map source account IDs onto accounts that already exist inside the target
 * family. Accounts/credentials are never created from a portable export.
 */
const buildAccountMap = async (
    client: PoolClient,
    data: PortableRow,
    targetOwnerId: string
): Promise<Map<string, string>> => {
    const accountMap = new Map<string, string>();
    const refs = Array.isArray(data.account_refs) ? data.account_refs : [];

    const targetAccounts = await client.query(
        `SELECT id, email
         FROM users
         WHERE id = $1 OR family_owner_id = $1`,
        [targetOwnerId]
    );

    const byEmail = new Map<string, string>();
    for (const account of targetAccounts.rows as Array<{ id: string; email: string }>) {
        if (typeof account.email === 'string') {
            byEmail.set(account.email.trim().toLowerCase(), account.id);
        }
    }

    for (const raw of refs) {
        const ref = asRecord(raw);
        if (!ref) continue;

        const originalId = sourceId(ref.id);
        if (!originalId) continue;

        if (ref.is_owner === true) {
            accountMap.set(originalId, targetOwnerId);
            continue;
        }

        if (typeof ref.email === 'string') {
            const targetId = byEmail.get(ref.email.trim().toLowerCase());
            if (targetId) accountMap.set(originalId, targetId);
        }
    }

    return accountMap;
};

// Export all portable family data. Parent-only because this contains the full
// family dataset, including financial and family-member information.
router.get('/export', requireParent, async (req: AuthRequest, res) => {
    try {
        const userId = req.userId!;

        const [
            familySettings,
            accountRefs,
            familyMembers,
            tasks,
            recipes,
            mealPlans,
            budgetEntries,
            budgetLimits,
            shoppingItems,
            shoppingTemplates,
            appointments,
            appointmentExceptions,
            scheduleEntries,
            scheduleEntryMembers,
            scheduleEntryExceptions,
            rewardTransactions,
            rewardSettings,
            rewardGoals,
            familyNotes,
            recurringExpenses,
            recurringExpenseLogs,
            kakeiboMonths,
            familyPosts,
            familyPostSeen,
        ] = await Promise.all([
            query(
                `SELECT currency, disabled_modules, custom_categories, kakeibo_pillars
                 FROM users WHERE id = $1`,
                [userId]
            ),
            // Safe account references/preferences only. Passwords, tokens, roles,
            // ownership state and other authorization material are excluded.
            query(
                `SELECT id, email, (id = $1) AS is_owner,
                        language, week_start_day, avatar_url, dashboard_prefs
                 FROM users
                 WHERE id = $1 OR family_owner_id = $1
                 ORDER BY (id = $1) DESC, email`,
                [userId]
            ),
            query('SELECT * FROM family_members WHERE user_id = $1', [userId]),
            query('SELECT * FROM tasks WHERE user_id = $1', [userId]),
            query('SELECT * FROM recipes WHERE user_id = $1', [userId]),
            query('SELECT * FROM meal_plans WHERE user_id = $1', [userId]),
            query('SELECT * FROM budget_entries WHERE user_id = $1', [userId]),
            query('SELECT * FROM budget_limits WHERE user_id = $1', [userId]),
            query('SELECT * FROM shopping_items WHERE user_id = $1', [userId]),
            query('SELECT * FROM shopping_list_templates WHERE user_id = $1', [userId]),
            // Events of a followed calendar (Google, Outlook...) are left out:
            // they belong to their source and come back once it is followed again.
            query('SELECT * FROM appointments WHERE user_id = $1 AND subscription_id IS NULL', [userId]),
            query(
                `SELECT are.*
                 FROM appointment_recurrence_exceptions are
                 JOIN appointments a ON a.id = are.appointment_id
                 WHERE a.user_id = $1 AND a.subscription_id IS NULL`,
                [userId]
            ),
            query('SELECT * FROM schedule_entries WHERE user_id = $1', [userId]),
            query(
                `SELECT sem.*
                 FROM schedule_entry_members sem
                 JOIN schedule_entries se ON se.id = sem.entry_id
                 WHERE se.user_id = $1`,
                [userId]
            ),
            query(
                `SELECT see.entry_id,
                        to_char(see.excluded_date, 'YYYY-MM-DD') AS excluded_date,
                        see.created_at
                 FROM schedule_entry_exceptions see
                 JOIN schedule_entries se ON se.id = see.entry_id
                 WHERE se.user_id = $1`,
                [userId]
            ),
            query('SELECT * FROM reward_transactions WHERE user_id = $1', [userId]),
            query('SELECT * FROM reward_settings WHERE user_id = $1', [userId]),
            query('SELECT * FROM reward_goals WHERE user_id = $1', [userId]),
            query('SELECT * FROM family_notes WHERE user_id = $1', [userId]),
            query('SELECT * FROM recurring_expenses WHERE user_id = $1', [userId]),
            query('SELECT * FROM recurring_expense_logs WHERE user_id = $1', [userId]),
            query('SELECT * FROM kakeibo_months WHERE user_id = $1', [userId]),
            query('SELECT * FROM family_posts WHERE user_id = $1', [userId]),
            query(
                `SELECT fps.*
                 FROM family_post_seen fps
                 JOIN family_posts fp ON fp.id = fps.post_id
                 WHERE fp.user_id = $1`,
                [userId]
            ),
        ]);

        const exportData = {
            format: PORTABLE_FORMAT,
            version: PORTABLE_VERSION,
            appVersion: OPENFAMILY_VERSION,
            exportedAt: new Date().toISOString(),
            scope: 'family',
            exclusions: PORTABLE_EXCLUSIONS,
            family_settings: familySettings.rows[0] ?? {},
            account_refs: accountRefs.rows,
            family_members: familyMembers.rows,
            tasks: tasks.rows,
            recipes: recipes.rows,
            meal_plans: mealPlans.rows,
            budget_entries: budgetEntries.rows,
            budget_limits: budgetLimits.rows,
            shopping_items: shoppingItems.rows,
            shopping_list_templates: shoppingTemplates.rows,
            appointments: appointments.rows,
            appointment_recurrence_exceptions: appointmentExceptions.rows,
            schedule_entries: scheduleEntries.rows,
            schedule_entry_members: scheduleEntryMembers.rows,
            schedule_entry_exceptions: scheduleEntryExceptions.rows,
            reward_transactions: rewardTransactions.rows,
            reward_settings: rewardSettings.rows,
            reward_goals: rewardGoals.rows,
            family_notes: familyNotes.rows,
            recurring_expenses: recurringExpenses.rows,
            recurring_expense_logs: recurringExpenseLogs.rows,
            kakeibo_months: kakeiboMonths.rows,
            family_posts: familyPosts.rows,
            family_post_seen: familyPostSeen.rows,
        };

        return res.json({ success: true, data: exportData });
    } catch (error) {
        console.error('Export error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/import', requireParent, importBodyParser, async (req: AuthRequest, res) => {
    const userId = req.userId!;
    const importData = asRecord(req.body);

    if (!importData) {
        return res.status(400).json({ success: false, error: 'Invalid import data format' });
    }

    const format = typeof importData.format === 'string' ? importData.format : null;
    const version = typeof importData.version === 'string' ? importData.version : '1.0';

    if (format !== null && format !== PORTABLE_FORMAT) {
        return res.status(400).json({ success: false, error: 'Unsupported import format' });
    }
    if (!SUPPORTED_IMPORT_VERSIONS.has(version)) {
        return res.status(400).json({
            success: false,
            error: `Unsupported portable export version: ${version}`,
        });
    }

    const client = await getClient();
    const counts: Record<string, number> = {};

    const importRows = async (
        table: string,
        rows: unknown,
        transform?: RowTransform
    ) => {
        if (!Array.isArray(rows) || rows.length === 0) return;

        const allowedColumns = IMPORT_COLUMNS[table];
        if (!allowedColumns) return;

        let count = 0;
        for (const raw of rows) {
            const parsed = asRecord(raw);
            if (!parsed) continue;

            const transformed = transform
                ? await transform({ ...parsed })
                : { ...parsed };
            if (!transformed) continue;

            const entry: PortableRow = { ...transformed, user_id: userId };
            // A null is left out rather than written, so the column takes its
            // database default. Several columns are NOT NULL with a default (role,
            // colour, points...), and one explicit null there would otherwise roll
            // back the entire import.
            const keys = Object.keys(entry).filter(
                (key) =>
                    (key === 'user_id' || allowedColumns.has(key)) &&
                    entry[key] !== null &&
                    entry[key] !== undefined
            );
            if (keys.length === 0) continue;

            const jsonColumns = JSONB_COLUMNS[table];
            const values = keys.map((key) => {
                const value = entry[key];
                return jsonColumns?.has(key) && value !== null && value !== undefined
                    ? JSON.stringify(value)
                    : value;
            });
            const placeholders = keys.map((_, index) => `$${index + 1}`);

            const result = await client.query(
                `INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(', ')})
                 VALUES (${placeholders.join(', ')})
                 ON CONFLICT DO NOTHING`,
                values
            );
            count += result.rowCount ?? 0;
        }
        counts[table] = count;
    };

    const importFamilySettings = async () => {
        const settings = asRecord(importData.family_settings);
        if (!settings) return;

        const cleaned: PortableRow = {};

        if (typeof settings.currency === 'string' && /^[A-Z]{3}$/.test(settings.currency)) {
            cleaned.currency = settings.currency;
        }
        // disabled_modules is NOT NULL: only a string may replace it.
        if (typeof settings.disabled_modules === 'string') {
            cleaned.disabled_modules = settings.disabled_modules;
        }
        for (const key of ['custom_categories', 'kakeibo_pillars'] as const) {
            const value = settings[key];
            if (value === null || typeof value === 'string') cleaned[key] = value;
        }

        const keys = Object.keys(cleaned).filter((key) => FAMILY_SETTINGS_COLUMNS.has(key));
        if (keys.length === 0) return;

        const values = keys.map((key) => cleaned[key]);
        const assignments = keys.map((key, index) => `"${key}" = $${index + 1}`);
        values.push(userId);

        const result = await client.query(
            `UPDATE users
             SET ${assignments.join(', ')}
             WHERE id = $${values.length}`,
            values
        );
        counts.family_settings = result.rowCount ?? 0;
    };

    const importAccountPreferences = async (accountMap: Map<string, string>) => {
        const refs = Array.isArray(importData.account_refs) ? importData.account_refs : [];
        let count = 0;

        for (const raw of refs) {
            const ref = asRecord(raw);
            if (!ref) continue;

            const originalId = sourceId(ref.id);
            if (!originalId) continue;

            const targetId = accountMap.get(originalId);
            if (!targetId) continue;

            const assignments: string[] = [];
            const values: unknown[] = [];

            if (typeof ref.language === 'string' && SUPPORTED_LANGUAGES.has(ref.language)) {
                values.push(ref.language);
                assignments.push(`language = $${values.length}`);
            }
            if (ref.avatar_url === null || typeof ref.avatar_url === 'string') {
                values.push(ref.avatar_url);
                assignments.push(`avatar_url = $${values.length}`);
            }
            if (ref.week_start_day === null
                || (Number.isInteger(ref.week_start_day) && Number(ref.week_start_day) >= 1 && Number(ref.week_start_day) <= 7)) {
                values.push(ref.week_start_day);
                assignments.push(`week_start_day = $${values.length}`);
            }
            if (ref.dashboard_prefs === null || typeof ref.dashboard_prefs === 'string') {
                values.push(ref.dashboard_prefs);
                assignments.push(`dashboard_prefs = $${values.length}`);
            }

            if (assignments.length === 0) continue;

            values.push(targetId, userId);
            const result = await client.query(
                `UPDATE users
                 SET ${assignments.join(', ')}
                 WHERE id = $${values.length - 1}
                   AND (id = $${values.length} OR family_owner_id = $${values.length})`,
                values
            );
            count += result.rowCount ?? 0;
        }

        counts.account_preferences = count;
    };

    const importAppointmentExceptions = async () => {
        const rows = Array.isArray(importData.appointment_recurrence_exceptions)
            ? importData.appointment_recurrence_exceptions
            : [];

        let count = 0;
        for (const raw of rows) {
            const row = asRecord(raw);
            if (!row?.appointment_id || !row?.occurrence_date) continue;

            const result = await client.query(
                `INSERT INTO appointment_recurrence_exceptions
                    (appointment_id, occurrence_date, exception_type, override_data, created_at)
                 SELECT $1::uuid, $2::date, COALESCE($3::varchar, 'skip'), $4::jsonb,
                        COALESCE($5::timestamptz, now())
                 WHERE EXISTS (
                     SELECT 1 FROM appointments WHERE id = $1::uuid AND user_id = $6
                 )
                 ON CONFLICT DO NOTHING`,
                [
                    row.appointment_id,
                    row.occurrence_date,
                    row.exception_type ?? 'skip',
                    row.override_data == null ? null : JSON.stringify(row.override_data),
                    row.created_at ?? null,
                    userId,
                ]
            );
            count += result.rowCount ?? 0;
        }
        counts.appointment_recurrence_exceptions = count;
    };

    const importScheduleChildren = async () => {
        const members = Array.isArray(importData.schedule_entry_members)
            ? importData.schedule_entry_members
            : [];
        let memberCount = 0;

        for (const raw of members) {
            const row = asRecord(raw);
            if (!row?.entry_id || !row?.family_member_id) continue;

            const result = await client.query(
                `INSERT INTO schedule_entry_members (entry_id, family_member_id)
                 SELECT $1::uuid, $2::uuid
                 WHERE EXISTS (
                     SELECT 1 FROM schedule_entries WHERE id = $1::uuid AND user_id = $3
                 )
                   AND EXISTS (
                     SELECT 1 FROM family_members WHERE id = $2::uuid AND user_id = $3
                 )
                 ON CONFLICT DO NOTHING`,
                [row.entry_id, row.family_member_id, userId]
            );
            memberCount += result.rowCount ?? 0;
        }
        counts.schedule_entry_members = memberCount;

        const exceptions = Array.isArray(importData.schedule_entry_exceptions)
            ? importData.schedule_entry_exceptions
            : [];
        let exceptionCount = 0;

        for (const raw of exceptions) {
            const row = asRecord(raw);
            if (!row?.entry_id || !row?.excluded_date) continue;

            const result = await client.query(
                `INSERT INTO schedule_entry_exceptions
                    (entry_id, excluded_date, created_at)
                 SELECT $1::uuid, $2::date, COALESCE($3::timestamptz, now())
                 WHERE EXISTS (
                     SELECT 1 FROM schedule_entries WHERE id = $1::uuid AND user_id = $4
                 )
                 ON CONFLICT DO NOTHING`,
                [row.entry_id, row.excluded_date, row.created_at ?? null, userId]
            );
            exceptionCount += result.rowCount ?? 0;
        }
        counts.schedule_entry_exceptions = exceptionCount;

        await client.query(
            `INSERT INTO schedule_entry_members (entry_id, family_member_id)
             SELECT se.id, se.family_member_id
             FROM schedule_entries se
             JOIN family_members fm
               ON fm.id = se.family_member_id AND fm.user_id = se.user_id
             WHERE se.user_id = $1
               AND NOT EXISTS (
                   SELECT 1 FROM schedule_entry_members sem WHERE sem.entry_id = se.id
               )
             ON CONFLICT DO NOTHING`,
            [userId]
        );
    };

    const importFamilyPostSeen = async (accountMap: Map<string, string>) => {
        const rows = Array.isArray(importData.family_post_seen)
            ? importData.family_post_seen
            : [];
        let count = 0;

        for (const raw of rows) {
            const row = asRecord(raw);
            if (!row?.post_id) continue;

            const originalReader = sourceId(row.user_id);
            const targetReader = originalReader ? accountMap.get(originalReader) : undefined;
            if (!targetReader) continue;

            const result = await client.query(
                `INSERT INTO family_post_seen (post_id, user_id, seen_at)
                 SELECT $1::uuid, $2::uuid, COALESCE($3::timestamp, CURRENT_TIMESTAMP)
                 WHERE EXISTS (
                     SELECT 1 FROM family_posts WHERE id = $1::uuid AND user_id = $4
                 )
                   AND EXISTS (
                     SELECT 1 FROM users
                     WHERE id = $2::uuid AND (id = $4 OR family_owner_id = $4)
                 )
                 ON CONFLICT DO NOTHING`,
                [row.post_id, targetReader, row.seen_at ?? null, userId]
            );
            count += result.rowCount ?? 0;
        }
        counts.family_post_seen = count;
    };

    try {
        await client.query('BEGIN');

        const accountMap = await buildAccountMap(client, importData, userId);

        await importFamilySettings();
        await importAccountPreferences(accountMap);

        await importRows('family_members', importData.family_members, (row) => {
            if ('linked_user_id' in row) {
                const originalLinkedId = sourceId(row.linked_user_id);
                row.linked_user_id = originalLinkedId
                    ? accountMap.get(originalLinkedId) ?? null
                    : null;
            }
            return row;
        });

        const familyMemberIds = await loadOwnedIds(client, 'family_members', userId);

        await importRows('recipes', importData.recipes, (row) => {
            // Same rule as the recipe routes; an unusable photo is dropped, not the recipe.
            row.image_url = cleanImageUrl(row.image_url) ?? null;
            return row;
        });
        const recipeIds = await loadOwnedIds(client, 'recipes', userId);

        await importRows('tasks', importData.tasks, (row) => {
            row.assigned_to = sanitizeMemberArray(row.assigned_to, familyMemberIds);
            return row;
        });
        const taskIds = await loadOwnedIds(client, 'tasks', userId);

        await importRows('budget_entries', importData.budget_entries, (row) => {
            const assignedTo = sourceId(row.assigned_to);
            row.assigned_to = assignedTo && familyMemberIds.has(assignedTo)
                ? assignedTo
                : null;
            return row;
        });
        await importRows('budget_limits', importData.budget_limits);

        await importRows('shopping_items', importData.shopping_items);
        await importRows('shopping_list_templates', importData.shopping_list_templates);

        await importRows('appointments', importData.appointments, (row) => {
            row.family_member_ids = sanitizeMemberArray(
                row.family_member_ids,
                familyMemberIds
            );
            // Files from before free reminders only carry the two flags.
            row.reminder_minutes = row.reminder_minutes !== undefined
                ? normalizeReminderMinutes(row.reminder_minutes)
                : applyLegacyReminderFlags([], row.reminder_30min, row.reminder_1hour);
            return row;
        });
        await importAppointmentExceptions();

        await importRows('schedule_entries', importData.schedule_entries, (row) => {
            const memberId = sourceId(row.family_member_id);
            return memberId && familyMemberIds.has(memberId) ? row : null;
        });
        await importScheduleChildren();

        await importRows('meal_plans', importData.meal_plans, (row) => {
            const recipeId = sourceId(row.recipe_id);
            row.recipe_id = recipeId && recipeIds.has(recipeId) ? recipeId : null;
            return row;
        });

        await importRows('reward_settings', importData.reward_settings);
        await importRows('reward_transactions', importData.reward_transactions, (row) => {
            const memberId = sourceId(row.member_id);
            if (!memberId || !familyMemberIds.has(memberId)) return null;

            const taskId = sourceId(row.task_id);
            row.task_id = taskId && taskIds.has(taskId) ? taskId : null;
            return row;
        });
        await importRows('reward_goals', importData.reward_goals, (row) => {
            const memberId = sourceId(row.member_id);
            return memberId && familyMemberIds.has(memberId) ? row : null;
        });

        await importRows('family_notes', importData.family_notes);

        // Earliest month each item was marked paid in the file, as the migration
        // does: an old file may hold marks from before the item's creation date.
        const firstMarkedMonth = new Map<string, number>();
        for (const raw of Array.isArray(importData.recurring_expense_logs) ? importData.recurring_expense_logs : []) {
            const log = asRecord(raw);
            const id = sourceId(log?.recurring_expense_id);
            const month = Number(log?.month);
            const year = Number(log?.year);
            if (!id || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) continue;
            const key = year * 12 + (month - 1);
            if (!firstMarkedMonth.has(id) || key < firstMarkedMonth.get(id)!) firstMarkedMonth.set(id, key);
        }

        const debitDays = new Map<string, number>();
        await importRows('recurring_expenses', importData.recurring_expenses, (row) => {
            const debitDay = validDebitDay(row.debit_day);
            if (!debitDay) return null;
            if (typeof row.start_date !== 'string' || !DATE_ONLY.test(row.start_date.slice(0, 10))) {
                const created = new Date(typeof row.created_at === 'string' ? row.created_at : Date.now());
                const base = Number.isNaN(created.getTime()) ? new Date() : created;
                let key = base.getUTCFullYear() * 12 + base.getUTCMonth();
                const marked = firstMarkedMonth.get(sourceId(row.id) ?? '');
                if (marked !== undefined && marked < key) key = marked;
                row.start_date = clampedDay(Math.floor(key / 12), (key % 12) + 1, debitDay);
            }
            const id = sourceId(row.id);
            if (id) debitDays.set(id, debitDay);
            return row;
        });
        const recurringExpenseIds = await loadOwnedIds(
            client,
            'recurring_expenses',
            userId
        );
        await importRows(
            'recurring_expense_logs',
            importData.recurring_expense_logs,
            (row) => {
                const recurringId = sourceId(row.recurring_expense_id);
                if (!recurringId || !recurringExpenseIds.has(recurringId)) return null;
                if (typeof row.occurrence_date !== 'string' || !DATE_ONLY.test(row.occurrence_date.slice(0, 10))) {
                    const month = Number(row.month);
                    const year = Number(row.year);
                    const debitDay = debitDays.get(recurringId);
                    if (!debitDay || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
                        return null;
                    }
                    row.occurrence_date = clampedDay(year, month, debitDay);
                }
                return row;
            }
        );

        // Calendar events come in before the budget items they carry, so the
        // links are restored once both exist, and only between rows of this
        // family. An item already linked to another event is left alone.
        let linksRestored = 0;
        for (const raw of Array.isArray(importData.appointments) ? importData.appointments : []) {
            const row = asRecord(raw);
            const appointmentId = sourceId(row?.id);
            if (!row || !appointmentId) continue;
            for (const [column, table] of [
                ['linked_budget_entry_id', 'budget_entries'],
                ['linked_recurring_expense_id', 'recurring_expenses'],
            ] as const) {
                const targetId = sourceId(row[column]);
                if (!targetId) continue;
                const result = await client.query(
                    `UPDATE appointments
                     SET ${column} = $2::uuid
                     WHERE id = $1::uuid AND user_id = $3 AND ${column} IS NULL
                       AND EXISTS (SELECT 1 FROM ${table} WHERE id = $2::uuid AND user_id = $3)
                       AND NOT EXISTS (SELECT 1 FROM appointments WHERE ${column} = $2::uuid)`,
                    [appointmentId, targetId, userId]
                );
                linksRestored += result.rowCount ?? 0;
            }
        }
        counts.calendar_budget_links = linksRestored;

        await importRows('kakeibo_months', importData.kakeibo_months);

        await importRows('family_posts', importData.family_posts, (row) => {
            row.content = cleanContent(row.content);
            row.image_url = cleanOrNull(cleanImage, row.image_url);
            row.link_url = cleanOrNull(cleanLink, row.link_url);
            if (!row.content && !row.image_url && !row.link_url) return null;

            const originalAuthor = sourceId(row.author_user_id);
            row.author_user_id = originalAuthor
                ? accountMap.get(originalAuthor) ?? userId
                : userId;
            return row;
        });
        await importFamilyPostSeen(accountMap);

        await client.query('COMMIT');
        return res.json({
            success: true,
            data: {
                format: PORTABLE_FORMAT,
                version: PORTABLE_VERSION,
                imported: counts,
            },
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Import error:', error);
        return res.status(500).json({
            success: false,
            error: 'Import failed. No data was modified.',
        });
    } finally {
        client.release();
    }
});

export default router;
