import cron from 'node-cron';
import { format } from 'date-fns';
import { query } from '../db';
import { sendPushToUser } from './pushService';
import logger from './logger';
import { expandRecurringAppointments } from './appointmentRecurrence';
import { ALL_DAY_REMINDER_HOUR, MAX_REMINDER_MINUTES, normalizeReminderMinutes } from './reminders';

type ReminderLanguage = 'fr' | 'en' | 'pt' | 'ru' | 'es' | 'zh';

interface Occurrence {
    id: string;
    user_id: string;
    title: string;
    /** Naive local timestamp string ('YYYY-MM-DDTHH:mm:ss') — see the pg type parser in db.ts */
    start_time: string;
    location?: string | null;
    is_all_day?: boolean;
    reminder_minutes?: unknown;
    language: string;
}

// appointments.start_time is a naive TIMESTAMP holding LOCAL wall-clock time, so
// the comparison windows are formatted as naive server-local strings — NOT
// toISOString(), which is UTC and would shift them by the server's UTC offset.
const toLocalNaive = (d: Date): string => format(d, "yyyy-MM-dd'T'HH:mm:ss");
// Parsed without a zone suffix, a naive string is read as server-local time.
const fromLocalNaive = (value: string): Date => new Date(value.slice(0, 19));

// A reminder whose moment passed while the server was busy or restarting is
// still sent if it is less than this late; older ones are dropped, not spammed.
const GRACE_MS = 15 * 60 * 1000;

const LANGUAGES: ReminderLanguage[] = ['fr', 'en', 'pt', 'ru', 'es', 'zh'];
const TITLE_PREFIX: Record<ReminderLanguage, string> = {
    fr: '⏰ Rappel : ',
    en: '⏰ Reminder: ',
    pt: '⏰ Lembrete: ',
    ru: '⏰ Напоминание: ',
    es: '⏰ Recordatorio: ',
    zh: '⏰ 提醒：',
};
const NOW_TEXT: Record<ReminderLanguage, string> = {
    fr: 'Maintenant',
    en: 'Now',
    pt: 'Agora',
    ru: 'Сейчас',
    es: 'Ahora',
    zh: '现在',
};
const LOCALE: Record<ReminderLanguage, string> = {
    fr: 'fr-FR', en: 'en-GB', pt: 'pt-BR', ru: 'ru-RU', es: 'es-ES', zh: 'zh-CN',
};

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** "In 30 minutes", "In 2 hours", "Tomorrow", "Next week", in the member's language. */
export function describeLeadTime(minutes: number, lang: ReminderLanguage): string {
    if (minutes === 0) return NOW_TEXT[lang];
    const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto' });
    if (minutes % (7 * 24 * 60) === 0) return capitalize(rtf.format(minutes / (7 * 24 * 60), 'week'));
    if (minutes % (24 * 60) === 0) return capitalize(rtf.format(minutes / (24 * 60), 'day'));
    if (minutes % 60 === 0) return capitalize(rtf.format(minutes / 60, 'hour'));
    return capitalize(rtf.format(minutes, 'minute'));
}

/** "Today", "Tomorrow", "In 3 days": how far the day of an all-day event is. */
function describeDay(occurrenceDay: string, now: Date, lang: ReminderLanguage): string {
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const [y, m, d] = occurrenceDay.split('-').map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
    return capitalize(new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto' }).format(days, 'day'));
}

export function buildReminderTexts(
    occurrence: Pick<Occurrence, 'title' | 'start_time' | 'location' | 'is_all_day' | 'language'>,
    minutes: number,
    now: Date
): { title: string; body: string } {
    const lang = (LANGUAGES as string[]).includes(occurrence.language)
        ? occurrence.language as ReminderLanguage
        : 'fr';
    const start = String(occurrence.start_time);
    const where = occurrence.location ? ` · ${occurrence.location}` : '';
    const body = occurrence.is_all_day
        ? `${describeDay(start.slice(0, 10), now, lang)}${where}`
        // start_time is 'YYYY-MM-DDTHH:mm:ss' — HH:mm straight from the string.
        : `${describeLeadTime(minutes, lang)} — ${start.slice(11, 16)}${where}`;
    return { title: `${TITLE_PREFIX[lang]}${occurrence.title}`.slice(0, 255), body };
}

/** When a reminder is due: its offset back from the start, or from 09:00 on an all-day event's day. */
export function reminderMoment(occurrence: Pick<Occurrence, 'start_time' | 'is_all_day'>, minutes: number): Date {
    const start = String(occurrence.start_time);
    const reference = occurrence.is_all_day
        ? `${start.slice(0, 10)}T${String(ALL_DAY_REMINDER_HOUR).padStart(2, '0')}:00:00`
        : start;
    return new Date(fromLocalNaive(reference).getTime() - minutes * 60 * 1000);
}

async function checkReminders(): Promise<void> {
    const now = new Date();
    // Every occurrence that can have a reminder due now: starting at most four
    // weeks ahead, or up to a day ago (an all-day event's reminders count from
    // 09:00, and a late reminder is still sent within the grace period).
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000 - GRACE_MS);
    const to = new Date(now.getTime() + (MAX_REMINDER_MINUTES + 24 * 60) * 60 * 1000);
    const fromNaive = toLocalNaive(from);
    const toNaive = toLocalNaive(to);

    try {
        const { rows } = await query(
            `SELECT a.id, a.user_id, a.title, a.start_time, a.end_time, a.location, a.is_all_day,
                    a.reminder_minutes, a.recurrence_frequency, a.recurrence_interval, a.recurrence_until,
                    COALESCE(u.language, 'fr') AS language
             FROM appointments a
             JOIN users u ON u.id = a.user_id
             WHERE a.start_time <= $2
               AND (
                    (a.recurrence_frequency = 'none' AND a.start_time >= $1 AND cardinality(a.reminder_minutes) > 0)
                    OR (
                        a.recurrence_frequency <> 'none'
                        AND (a.recurrence_until IS NULL OR a.recurrence_until >= ($1)::date)
                        AND (
                            cardinality(a.reminder_minutes) > 0
                            OR EXISTS (
                                SELECT 1 FROM appointment_recurrence_exceptions e
                                WHERE e.appointment_id = a.id
                                  AND e.occurrence_date >= ($1)::date
                                  AND e.override_data ? 'reminder_minutes'
                            )
                        )
                    )
               )`,
            [fromNaive, toNaive]
        );
        if (rows.length === 0) return;

        const recurringIds = rows.filter((r: any) => r.recurrence_frequency !== 'none').map((r: any) => r.id);
        const exceptions = new Map<string, Map<string, any>>();
        if (recurringIds.length > 0) {
            const ex = await query(
                `SELECT appointment_id, occurrence_date, exception_type, override_data
                 FROM appointment_recurrence_exceptions
                 WHERE appointment_id = ANY($1::uuid[])
                   AND occurrence_date BETWEEN ($2)::date AND ($3)::date`,
                [recurringIds, fromNaive.slice(0, 10), toNaive.slice(0, 10)]
            );
            for (const row of ex.rows) {
                const key = String(row.appointment_id);
                if (!exceptions.has(key)) exceptions.set(key, new Map());
                exceptions.get(key)!.set(String(row.occurrence_date).slice(0, 10), row);
            }
        }

        const occurrences = expandRecurringAppointments(rows, fromNaive, toNaive, exceptions) as Occurrence[];
        for (const occurrence of occurrences) {
            for (const minutes of normalizeReminderMinutes(occurrence.reminder_minutes)) {
                const due = reminderMoment(occurrence, minutes).getTime();
                if (due > now.getTime() || due <= now.getTime() - GRACE_MS) continue;

                // One row per occurrence and offset: claimed before sending, so a
                // reminder goes out once even if two ticks overlap.
                const claimed = await query(
                    `INSERT INTO appointment_reminder_log (appointment_id, occurrence_start, minutes_before)
                     VALUES ($1, $2, $3)
                     ON CONFLICT DO NOTHING
                     RETURNING 1`,
                    [occurrence.id, String(occurrence.start_time).slice(0, 19), minutes]
                );
                if (claimed.rows.length === 0) continue;

                const { title, body } = buildReminderTexts(occurrence, minutes, now);
                await query(
                    `INSERT INTO notifications (user_id, title, message, type, related_id)
                     VALUES ($1, $2, $3, 'appointment_reminder', $4)`,
                    [occurrence.user_id, title, body, occurrence.id]
                );
                await sendPushToUser(occurrence.user_id, {
                    title,
                    body,
                    url: '/calendar',
                    tag: `reminder-${occurrence.id}-${String(occurrence.start_time).slice(0, 16)}-${minutes}`,
                });
                logger.info('reminder.sent', { appointmentId: occurrence.id, minutesBefore: minutes });
            }
        }
    } catch (err) {
        logger.error('reminder.scheduler_error', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

async function pruneReminderLog(): Promise<void> {
    try {
        await query("DELETE FROM appointment_reminder_log WHERE sent_at < now() - interval '60 days'");
    } catch (err) {
        logger.error('reminder.prune_error', { error: err instanceof Error ? err.message : String(err) });
    }
}

export function startReminderScheduler(): void {
    const tz = process.env.TZ ?? 'Europe/Paris';

    // Run every minute
    cron.schedule('* * * * *', () => {
        void checkReminders();
    }, { timezone: tz });
    cron.schedule('17 3 * * *', () => {
        void pruneReminderLog();
    }, { timezone: tz });

    logger.info('reminder.scheduler_started', { timezone: tz });
}
