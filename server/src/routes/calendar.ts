import crypto from 'node:crypto';
import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { addDays, dayInZone, familyTimeZone, instantInZone } from '../lib/timeZone';
import { listAppointments } from './appointments';

// How far the calendar feed reaches around today.
const FEED_DAYS_BEHIND = 365;
const FEED_DAYS_AHEAD = 730;

const router = Router();

// ─── iCalendar helpers ──────────────────────────────────────────────────────

const escapeICS = (value: string): string =>
    value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');

// Fold lines to 75 octets as required by RFC 5545.
const foldLine = (line: string): string => {
    if (line.length <= 75) return line;
    const chunks: string[] = [];
    let remaining = line;
    chunks.push(remaining.slice(0, 75));
    remaining = remaining.slice(75);
    while (remaining.length > 0) {
        chunks.push(' ' + remaining.slice(0, 74));
        remaining = remaining.slice(74);
    }
    return chunks.join('\r\n');
};

// A moment as iCalendar writes it in UTC: 20260610T123000Z. Appointments are
// stored as the family's wall-clock times; the feed gives each one as the
// instant it is in the family's zone (lib/timeZone), so that it lands at the
// right time in a calendar set to any zone.
const formatICSInstant = (instant: Date): string => `${instant.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
// A calendar day, for an all-day event: 20260610.
const formatICSDay = (day: string): string => day.replace(/-/g, '');

const HOUR_MS = 60 * 60 * 1000;

export const buildICS = (appointments: any[], zone: string, now: Date = new Date()): string => {
    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//OpenFamily//Calendrier//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:OpenFamily',
        `X-WR-TIMEZONE:${zone}`,
    ];

    const stamp = formatICSInstant(now);

    for (const apt of appointments) {
        const start = String(apt.start_time);

        lines.push('BEGIN:VEVENT');
        // A series is written out one event per occurrence, each with its own identity.
        lines.push(`UID:${String(apt.occurrence_id ?? apt.id).replace(':', '_')}@openfamily`);
        lines.push(`DTSTAMP:${stamp}`);
        if (apt.is_all_day) {
            // Whole days carry no time and no zone; the end is exclusive.
            const firstDay = start.slice(0, 10);
            const endDay = typeof apt.end_time === 'string' && apt.end_time.slice(0, 10) > firstDay
                ? apt.end_time.slice(0, 10)
                : firstDay;
            lines.push(`DTSTART;VALUE=DATE:${formatICSDay(firstDay)}`);
            lines.push(`DTEND;VALUE=DATE:${formatICSDay(addDays(endDay, 1))}`);
        } else {
            const startAt = instantInZone(start, zone);
            const endAt = apt.end_time ? instantInZone(String(apt.end_time), zone) : null;
            lines.push(`DTSTART:${formatICSInstant(startAt)}`);
            // Without an end, or with one before the start: an hour.
            lines.push(`DTEND:${formatICSInstant(endAt && endAt > startAt ? endAt : new Date(startAt.getTime() + HOUR_MS))}`);
        }
        lines.push(foldLine(`SUMMARY:${escapeICS(apt.title || 'Rendez-vous')}`));
        if (apt.description) lines.push(foldLine(`DESCRIPTION:${escapeICS(apt.description)}`));
        if (apt.location) lines.push(foldLine(`LOCATION:${escapeICS(apt.location)}`));
        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
};

// ─── Authenticated token management ──────────────────────────────────────────

// GET /api/calendar/token — returns the current user's feed token (creating one if needed)
router.get('/token', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const existing = await query('SELECT calendar_token FROM users WHERE id = $1', [req.userId]);
        let token: string | null = existing.rows[0]?.calendar_token ?? null;
        if (!token) {
            token = crypto.randomBytes(24).toString('hex');
            await query('UPDATE users SET calendar_token = $1 WHERE id = $2', [token, req.userId]);
        }
        res.json({ success: true, data: { token } });
    } catch (error) {
        console.error('Get calendar token error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/calendar/token/reset — regenerates the feed token (invalidates the old URL)
router.post('/token/reset', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const token = crypto.randomBytes(24).toString('hex');
        await query('UPDATE users SET calendar_token = $1 WHERE id = $2', [token, req.userId]);
        res.json({ success: true, data: { token } });
    } catch (error) {
        console.error('Reset calendar token error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ─── Public iCal feed (no auth — secured by the unguessable token) ────────────

// GET /api/calendar/:token/openfamily.ics
router.get('/:token/openfamily.ics', async (req, res) => {
    try {
        const token = req.params.token;
        if (!token || token.length < 16) {
            return res.status(404).send('Not found');
        }

        const userResult = await query('SELECT id FROM users WHERE calendar_token = $1', [token]);
        if (userResult.rows.length === 0) {
            return res.status(404).send('Not found');
        }
        const userId = userResult.rows[0].id;

        // A year behind, two ahead, in the family's zone. Recurring appointments
        // come expanded into their occurrences, as the calendar shows them.
        const zone = await familyTimeZone(userId);
        const today = dayInZone(new Date(), zone);
        const appointments = await listAppointments(
            userId,
            `${addDays(today, -FEED_DAYS_BEHIND)}T00:00:00`,
            `${addDays(today, FEED_DAYS_AHEAD)}T23:59:59`,
        );

        const ics = buildICS(appointments, zone);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="openfamily.ics"');
        res.send(ics);
    } catch (error) {
        console.error('Calendar feed error:', error);
        res.status(500).send('Internal server error');
    }
});

export default router;
