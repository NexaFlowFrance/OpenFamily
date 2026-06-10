import cron from 'node-cron';
import { format } from 'date-fns';
import { query } from '../db';
import { sendPushToUser } from './pushService';
import logger from './logger';

interface AppointmentRow {
    id: string;
    user_id: string;
    title: string;
    /** Naive local timestamp string ('YYYY-MM-DDTHH:mm:ss') — see the pg type parser in db.ts */
    start_time: string;
    location?: string;
    /** Recipient's preferred language ('fr' | 'en'), defaults to 'fr' */
    language: string;
}

// appointments.start_time is a naive TIMESTAMP holding LOCAL wall-clock time, so the
// comparison windows must be formatted as naive server-local strings — NOT toISOString(),
// which is UTC and would shift the windows by the server's UTC offset.
const toLocalNaive = (d: Date): string => format(d, "yyyy-MM-dd'T'HH:mm:ss");

interface ReminderTexts {
    title: string;
    body: string;
}

function buildTexts(appt: AppointmentRow, kind: '30min' | '1hour'): ReminderTexts {
    // start_time is 'YYYY-MM-DDTHH:mm:ss' — extract HH:mm directly, no Date round-trip.
    const timeStr = appt.start_time.slice(11, 16);
    const suffix = `${timeStr}${appt.location ? ` · ${appt.location}` : ''}`;
    const lang = appt.language === 'en' ? 'en' : 'fr';

    if (lang === 'en') {
        return {
            title: `⏰ Reminder: ${appt.title}`,
            body: `${kind === '30min' ? 'In 30 minutes' : 'In 1 hour'} — ${suffix}`,
        };
    }
    return {
        title: `⏰ Rappel : ${appt.title}`,
        body: `${kind === '30min' ? 'Dans 30 minutes' : 'Dans 1 heure'} — ${suffix}`,
    };
}

async function checkReminders(): Promise<void> {
    const now = new Date();

    // Windows: 25–35 min from now (covers the "30 min before" cron tick)
    const w30Start = new Date(now.getTime() + 25 * 60 * 1000);
    const w30End   = new Date(now.getTime() + 35 * 60 * 1000);

    // Windows: 55–65 min from now (covers the "1 hour before" cron tick)
    const w60Start = new Date(now.getTime() + 55 * 60 * 1000);
    const w60End   = new Date(now.getTime() + 65 * 60 * 1000);

    try {
        // ── 30-minute reminders ──────────────────────────────────────────────
        const { rows: appts30 } = await query(
            `SELECT a.id, a.user_id, a.title, a.start_time, a.location,
                    COALESCE(u.language, 'fr') AS language
             FROM appointments a
             JOIN users u ON u.id = a.user_id
             WHERE a.reminder_30min = true
               AND a.start_time BETWEEN $1 AND $2
               AND NOT EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.related_id = a.id
                   AND n.type = 'reminder_30min'
               )`,
            [toLocalNaive(w30Start), toLocalNaive(w30End)]
        );

        for (const appt of appts30 as AppointmentRow[]) {
            const { title, body } = buildTexts(appt, '30min');

            await query(
                `INSERT INTO notifications (user_id, title, message, type, related_id)
                 VALUES ($1, $2, $3, 'reminder_30min', $4)`,
                [appt.user_id, title, body, appt.id]
            );

            await sendPushToUser(appt.user_id, { title, body, url: '/calendar', tag: `reminder-${appt.id}-30min` });
            logger.info('reminder.sent', { appointmentId: appt.id, type: '30min' });
        }

        // ── 1-hour reminders ─────────────────────────────────────────────────
        const { rows: appts60 } = await query(
            `SELECT a.id, a.user_id, a.title, a.start_time, a.location,
                    COALESCE(u.language, 'fr') AS language
             FROM appointments a
             JOIN users u ON u.id = a.user_id
             WHERE a.reminder_1hour = true
               AND a.start_time BETWEEN $1 AND $2
               AND NOT EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.related_id = a.id
                   AND n.type = 'reminder_1hour'
               )`,
            [toLocalNaive(w60Start), toLocalNaive(w60End)]
        );

        for (const appt of appts60 as AppointmentRow[]) {
            const { title, body } = buildTexts(appt, '1hour');

            await query(
                `INSERT INTO notifications (user_id, title, message, type, related_id)
                 VALUES ($1, $2, $3, 'reminder_1hour', $4)`,
                [appt.user_id, title, body, appt.id]
            );

            await sendPushToUser(appt.user_id, { title, body, url: '/calendar', tag: `reminder-${appt.id}-1hour` });
            logger.info('reminder.sent', { appointmentId: appt.id, type: '1hour' });
        }
    } catch (err) {
        logger.error('reminder.scheduler_error', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export function startReminderScheduler(): void {
    const tz = process.env.TZ ?? 'Europe/Paris';

    // Run every minute
    cron.schedule('* * * * *', () => {
        void checkReminders();
    }, { timezone: tz });

    logger.info('reminder.scheduler_started', { timezone: tz });
}
