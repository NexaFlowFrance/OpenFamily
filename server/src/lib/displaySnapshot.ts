import { query } from '../db';
import { listAppointments } from '../routes/appointments';
import { parseDisabledModules } from '../routes/userSettings';

// What a display link shows: the family's day, read once from the database.
// It is the kiosk's content (today's appointments, meals, who is where, tasks,
// shopping, notes) plus tomorrow's appointments, since a screen that is only
// glanced at in the evening is mostly asked about the next morning.
//
// Dates are the server's local ones: the server runs in the family's timezone
// (TZ), and appointments are stored as local times.

export interface DisplayMember {
    name: string;
    color: string;
}

export interface DisplayAppointment {
    title: string;
    /** Local "YYYY-MM-DDTHH:mm:ss". */
    start: string;
    end: string | null;
    allDay: boolean;
    location: string | null;
    members: DisplayMember[];
}

export interface DisplaySnapshot {
    generatedAt: Date;
    /** Local "YYYY-MM-DD". */
    today: string;
    tomorrow: string;
    /** Optional modules the family switched off are left out of the page. */
    modules: { meals: boolean; planning: boolean; notes: boolean };
    appointmentsToday: DisplayAppointment[];
    appointmentsTomorrow: DisplayAppointment[];
    meals: Array<{ type: string; name: string }>;
    planning: Array<{ title: string; start: string; end: string; members: DisplayMember[] }>;
    tasks: Array<{ title: string; assignees: string[] }>;
    tasksTotal: number;
    shopping: Array<{ name: string; quantity: string | null }>;
    shoppingTotal: number;
    notes: Array<{ content: string; author: string }>;
}

// How much of each list is read. The page shows fewer on a small screen, never more.
export const DISPLAY_LIMITS = { tasks: 6, shopping: 12, notes: 3 } as const;

const MEAL_ORDER = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Snack'];

const pad = (value: number): string => String(value).padStart(2, '0');

export const localDay = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const localDateTime = (date: Date): string =>
    `${localDay(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const isoWeekday = (date: Date): number => ((date.getDay() + 6) % 7) + 1; // Monday = 1 ... Sunday = 7

const text = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));

const toMembers = (value: unknown): DisplayMember[] =>
    (Array.isArray(value) ? value : [])
        .filter((member): member is { name: unknown; color: unknown } => Boolean(member) && typeof member === 'object')
        .map((member) => ({ name: text(member.name), color: text(member.color) }))
        .filter((member) => member.name !== '');

const dayAppointments = async (userId: string, day: string): Promise<DisplayAppointment[]> => {
    const rows = await listAppointments(userId, `${day}T00:00:00`, `${day}T23:59:59`);
    return rows
        .map((row): DisplayAppointment => ({
            title: text(row.title),
            start: text(row.start_time).replace(' ', 'T').slice(0, 19),
            end: row.end_time ? text(row.end_time).replace(' ', 'T').slice(0, 19) : null,
            allDay: Boolean(row.is_all_day),
            location: row.location ? text(row.location) : null,
            members: toMembers(row.family_members_data),
        }))
        // All-day entries first, then by time; something that began on an
        // earlier day sorts with the all-day ones.
        .sort((a, b) => {
            const rank = (item: DisplayAppointment) => (item.allDay || item.start.slice(0, 10) < day ? 0 : 1);
            return rank(a) - rank(b) || a.start.localeCompare(b.start);
        });
};

export const loadDisplaySnapshot = async (userId: string, now: Date = new Date()): Promise<DisplaySnapshot> => {
    const today = localDay(now);
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrow = localDay(nextDay);

    const owner = await query('SELECT disabled_modules FROM users WHERE id = $1', [userId]);
    const disabled = new Set(parseDisabledModules(owner.rows[0]?.disabled_modules));
    const modules = { meals: !disabled.has('meals'), planning: !disabled.has('planning'), notes: !disabled.has('notes') };

    const [appointmentsToday, appointmentsTomorrow, members, meals, planning, tasks, taskCount, shopping, shoppingCount, notes] = await Promise.all([
        dayAppointments(userId, today),
        dayAppointments(userId, tomorrow),
        query('SELECT id, name FROM family_members WHERE user_id = $1', [userId]),
        modules.meals
            ? query(
                `SELECT mp.meal_type, mp.custom_meal, r.name AS recipe_name
                 FROM meal_plans mp LEFT JOIN recipes r ON r.id = mp.recipe_id
                 WHERE mp.user_id = $1 AND mp.date = $2::date`,
                [userId, today],
            )
            : null,
        modules.planning
            ? query(
                // The same entries the planning shows for this weekday: the weekly
                // ones, minus the dates they were cancelled for, plus the one-offs.
                `SELECT se.title, se.start_time, se.end_time, fm.name AS member_name, fm.color AS member_color,
                        COALESCE((
                            SELECT json_agg(json_build_object('name', m.name, 'color', m.color)
                                            ORDER BY (m.id = se.family_member_id) DESC, m.name)
                            FROM schedule_entry_members sem
                            JOIN family_members m ON m.id = sem.family_member_id
                            WHERE sem.entry_id = se.id
                        ), '[]'::json) AS participants
                 FROM schedule_entries se
                 JOIN family_members fm ON fm.id = se.family_member_id
                 WHERE se.user_id = $1 AND se.day_of_week = $2
                   AND (se.specific_date IS NULL OR se.specific_date = $3::date)
                   AND NOT EXISTS (
                       SELECT 1 FROM schedule_entry_exceptions e
                       WHERE e.entry_id = se.id AND e.excluded_date = $3::date
                   )
                 ORDER BY se.start_time, se.title`,
                [userId, isoWeekday(now), today],
            )
            : null,
        query(
            `SELECT title, assigned_to FROM tasks
             WHERE user_id = $1 AND is_completed = false
             ORDER BY due_date ASC NULLS LAST, created_at DESC
             LIMIT $2`,
            [userId, DISPLAY_LIMITS.tasks],
        ),
        query('SELECT count(*)::int AS total FROM tasks WHERE user_id = $1 AND is_completed = false', [userId]),
        query(
            `SELECT name, quantity, unit FROM shopping_items
             WHERE user_id = $1 AND is_checked = false
             ORDER BY created_at DESC
             LIMIT $2`,
            [userId, DISPLAY_LIMITS.shopping],
        ),
        query('SELECT count(*)::int AS total FROM shopping_items WHERE user_id = $1 AND is_checked = false', [userId]),
        modules.notes
            ? query(
                `SELECT content, author_name FROM family_notes
                 WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > $2)
                 ORDER BY created_at DESC
                 LIMIT $3`,
                [userId, localDateTime(now), DISPLAY_LIMITS.notes],
            )
            : null,
    ]);

    const memberNames = new Map<string, string>(members.rows.map((row: { id: string; name: string }) => [row.id, row.name]));

    return {
        generatedAt: now,
        today,
        tomorrow,
        modules,
        appointmentsToday,
        appointmentsTomorrow,
        meals: (meals?.rows ?? [])
            .map((row: { meal_type: string; custom_meal: string | null; recipe_name: string | null }) => ({
                type: row.meal_type,
                name: text(row.recipe_name || row.custom_meal).trim(),
            }))
            .filter((meal: { name: string }) => meal.name !== '')
            .sort((a: { type: string }, b: { type: string }) => MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type)),
        planning: (planning?.rows ?? []).map((row: {
            title: string; start_time: string; end_time: string; member_name: string; member_color: string; participants: unknown;
        }) => {
            const participants = toMembers(row.participants);
            return {
                title: row.title,
                start: text(row.start_time),
                end: text(row.end_time),
                members: participants.length > 0 ? participants : [{ name: row.member_name, color: row.member_color }],
            };
        }),
        tasks: tasks.rows.map((row: { title: string; assigned_to: unknown }) => ({
            title: row.title,
            assignees: (Array.isArray(row.assigned_to) ? row.assigned_to : [])
                .map((id) => memberNames.get(String(id)))
                .filter((name): name is string => Boolean(name)),
        })),
        tasksTotal: taskCount.rows[0]?.total ?? 0,
        shopping: shopping.rows.map((row: { name: string; quantity: string | number | null; unit: string | null }) => {
            // 2.00 is "2": the column is a decimal.
            const amount = row.quantity === null || row.quantity === undefined ? '' : String(Number(row.quantity));
            return {
                name: row.name,
                quantity: amount && amount !== 'NaN' && amount !== '0' ? `${amount}${row.unit ? ` ${row.unit}` : ''}` : null,
            };
        }),
        shoppingTotal: shoppingCount.rows[0]?.total ?? 0,
        notes: (notes?.rows ?? []).map((row: { content: string; author_name: string }) => ({
            content: row.content,
            author: row.author_name,
        })),
    };
};
