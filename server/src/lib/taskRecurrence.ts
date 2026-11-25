/**
 * Recurring tasks: a chore done today has to be done again tomorrow.
 *
 * A task with a frequency is one row. Ticking it completes the current
 * occurrence (and pays its points); when the next occurrence starts, on the
 * family's clocks, the row is opened again. The points already earned stay:
 * only un-ticking by hand takes them back.
 *
 *   - with a due date, the task follows it: it opens again the day after the
 *     one it was due (or done, when done late), and the due date moves to the
 *     next occurrence;
 *   - without one, it follows the calendar: the next day, the next week
 *     (Monday), the first of the next month, and so on.
 *
 * A chore a child ticked and a parent has not approved yet waits for the
 * parent: it is not opened again under them.
 */
import { query } from '../db';
import { broadcast } from './broadcaster';
import { logger } from './logger';
import { addDays, dayInZone, familyTimeZone, isoWeekdayOf } from './timeZone';

/** How many months a frequency spans, for those counted in months. */
const MONTHS: Record<string, number> = {
    Mensuel: 1,
    Trimestriel: 3,
    Quadrimestriel: 4,
    Annuel: 12,
};

export const isRecurringFrequency = (frequency: unknown): frequency is string =>
    frequency === 'Quotidien' || frequency === 'Hebdomadaire' || (typeof frequency === 'string' && frequency in MONTHS);

const pad = (value: number) => String(value).padStart(2, '0');

/** A calendar day moved by whole months, kept inside the month it lands in (31 Jan + 1 = 28 or 29 Feb). */
const addMonths = (day: string, months: number, anchorDate?: number): string => {
    const [year, month, date] = day.split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(anchorDate ?? date, last))}`;
};

/** The occurrence after `day`, one step of the frequency later. */
const step = (day: string, frequency: string, steps: number, anchorDate: number): string => {
    if (frequency === 'Quotidien') return addDays(day, steps);
    if (frequency === 'Hebdomadaire') return addDays(day, 7 * steps);
    return addMonths(day, MONTHS[frequency] * steps, anchorDate);
};

/** The first day of the calendar period after the one `day` is in. */
const nextPeriodStart = (day: string, frequency: string): string => {
    if (frequency === 'Quotidien') return addDays(day, 1);
    if (frequency === 'Hebdomadaire') return addDays(day, 8 - isoWeekdayOf(day));
    const [year, month] = day.split('-').map(Number);
    const span = MONTHS[frequency];
    // Months are grouped from January: quarters, thirds of a year, years.
    const startOfNext = Math.floor((month - 1) / span) * span + span;
    const first = new Date(Date.UTC(year, startOfNext, 1));
    return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-01`;
};

export interface NextOccurrence {
    /** The first day the task is to do again. */
    opensOn: string;
    /** Its new due date, when it had one. */
    dueOn: string | null;
}

/**
 * When a task done on `completedOn` is to do again.
 * Returns null for a task that does not repeat.
 */
export const nextOccurrence = (frequency: unknown, completedOn: string, dueOn: string | null): NextOccurrence | null => {
    if (!isRecurringFrequency(frequency)) return null;
    if (!dueOn) return { opensOn: nextPeriodStart(completedOn, frequency), dueOn: null };

    // The next due date is the first one after the day it was done: a task
    // done three weeks late does not come back already overdue.
    const anchorDate = Number(dueOn.slice(8, 10));
    let steps = 1;
    let next = step(dueOn, frequency, steps, anchorDate);
    while (next <= completedOn) {
        steps += 1;
        next = step(dueOn, frequency, steps, anchorDate);
    }
    const lastDay = dueOn > completedOn ? dueOn : completedOn;
    return { opensOn: addDays(lastDay, 1), dueOn: next };
};

/**
 * Opens again every completed recurring task whose next occurrence has
 * started. One family when `ownerId` is given (before its tasks are read),
 * every family otherwise (the scheduler). Returns how many were opened.
 */
export const reopenRecurringTasks = async (now: Date = new Date(), ownerId?: string): Promise<number> => {
    // completed_at and due_date are timestamps without a zone: completed_at
    // was written by NOW() in the session's zone, due_date is a calendar date.
    const result = await query(
        `SELECT id, user_id, frequency,
                EXTRACT(EPOCH FROM (completed_at AT TIME ZONE current_setting('TimeZone'))) AS completed_epoch,
                to_char(due_date, 'YYYY-MM-DD') AS due_day
         FROM tasks
         WHERE is_completed = true AND pending_approval = false AND completed_at IS NOT NULL
           AND frequency IS NOT NULL AND frequency <> 'Une fois'
           ${ownerId ? 'AND user_id = $1' : ''}`,
        ownerId ? [ownerId] : [],
    );

    const families = new Set<string>();
    let opened = 0;
    for (const task of result.rows) {
        const zone = await familyTimeZone(task.user_id);
        const completedOn = dayInZone(new Date(Number(task.completed_epoch) * 1000), zone);
        const next = nextOccurrence(task.frequency, completedOn, task.due_day);
        if (!next || dayInZone(now, zone) < next.opensOn) continue;

        // The condition on completed_at makes two runs at once open it once.
        const updated = await query(
            `UPDATE tasks
             SET is_completed = false, completed_at = NULL,
                 due_date = CASE WHEN $2::text IS NULL THEN due_date ELSE $2::date + due_date::time END
             WHERE id = $1 AND is_completed = true AND pending_approval = false
             RETURNING id`,
            [task.id, next.dueOn],
        );
        if (updated.rows.length > 0) {
            opened += 1;
            families.add(task.user_id);
        }
    }

    for (const family of families) {
        broadcast(family, { type: 'update', entity: 'tasks', action: 'updated' });
    }
    return opened;
};

/** The scheduler's run: never throws. */
export const checkRecurringTasks = async (): Promise<void> => {
    try {
        const opened = await reopenRecurringTasks();
        if (opened > 0) logger.info('tasks.recurring_reopened', { count: opened });
    } catch (err) {
        logger.error('tasks.recurring_error', { error: err instanceof Error ? err.message : String(err) });
    }
};
