import cron from 'node-cron';
import { format } from 'date-fns';
import { query } from '../db';
import { sendPushToUser } from './pushService';
import logger from './logger';

interface AppointmentRow {
    id: string;
    user_id: string;
    title: string;
    start_time: Date;
    location?: string;
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
            `SELECT a.id, a.user_id, a.title, a.start_time, a.location
             FROM appointments a
             WHERE a.reminder_30min = true
               AND a.start_time BETWEEN $1 AND $2
               AND NOT EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.related_id = a.id
                   AND n.type = 'reminder_30min'
               )`,
            [w30Start.toISOString(), w30End.toISOString()]
        );

        for (const appt of appts30 as AppointmentRow[]) {
            const timeStr = format(new Date(appt.start_time), 'HH:mm');
            const title = `⏰ Rappel : ${appt.title}`;
            const body  = `Dans 30 minutes — ${timeStr}${appt.location ? ` · ${appt.location}` : ''}`;

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
            `SELECT a.id, a.user_id, a.title, a.start_time, a.location
             FROM appointments a
             WHERE a.reminder_1hour = true
               AND a.start_time BETWEEN $1 AND $2
               AND NOT EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.related_id = a.id
                   AND n.type = 'reminder_1hour'
               )`,
            [w60Start.toISOString(), w60End.toISOString()]
        );

        for (const appt of appts60 as AppointmentRow[]) {
            const timeStr = format(new Date(appt.start_time), 'HH:mm');
            const title = `⏰ Rappel : ${appt.title}`;
            const body  = `Dans 1 heure — ${timeStr}${appt.location ? ` · ${appt.location}` : ''}`;

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
