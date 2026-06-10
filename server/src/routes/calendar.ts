import crypto from 'node:crypto';
import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

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

// Format a timestamp as an iCal floating local time (YYYYMMDDTHHMMSS — no 'Z', no TZID).
// Accepts either a naive local ISO string ('YYYY-MM-DDTHH:mm:ss', as returned by the pg
// TIMESTAMP type parser in db.ts) or a Date (formatted using local getters, never UTC).
const formatICSDate = (value: string | Date): string => {
    if (typeof value === 'string') {
        // '2026-06-10T14:30:00' → '20260610T143000'
        return value.replace(/[-:]/g, '').slice(0, 15);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}` +
        `T${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}`
    );
};

const buildICS = (appointments: any[]): string => {
    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//OpenFamily//Calendrier//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:OpenFamily',
        'X-WR-TIMEZONE:Europe/Paris',
    ];

    const stamp = formatICSDate(new Date());

    for (const apt of appointments) {
        // start_time/end_time arrive as naive local strings — keep them floating local.
        // Default end: start + 1h (new Date(naiveString) parses as local time, and
        // formatICSDate(Date) emits local components, so no UTC shift occurs).
        const end = apt.end_time ?? new Date(new Date(apt.start_time).getTime() + 60 * 60 * 1000);

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${apt.id}@openfamily`);
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART:${formatICSDate(apt.start_time)}`);
        lines.push(`DTEND:${formatICSDate(end)}`);
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

        const appointments = await query(
            'SELECT id, title, description, start_time, end_time, location FROM appointments WHERE user_id = $1 ORDER BY start_time ASC',
            [userId]
        );

        const ics = buildICS(appointments.rows);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="openfamily.ics"');
        res.send(ics);
    } catch (error) {
        console.error('Calendar feed error:', error);
        res.status(500).send('Internal server error');
    }
});

export default router;
