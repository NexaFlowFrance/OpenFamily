import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty } from '../lib/normalize';
import { broadcast } from '../lib/broadcaster';

const router = Router();
router.use(authMiddleware);

type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

const VALID_RECURRENCE_FREQUENCIES = new Set<RecurrenceFrequency>([
    'none',
    'daily',
    'weekly',
    'monthly',
    'yearly',
]);

const normalizeRecurrenceFrequency = (value: unknown): RecurrenceFrequency => {
    if (typeof value !== 'string') return 'none';

    const normalized = value.trim().toLowerCase() as RecurrenceFrequency;
    return VALID_RECURRENCE_FREQUENCIES.has(normalized) ? normalized : 'none';
};

const normalizeRecurrenceInterval = (value: unknown): number => {
    const interval = Number(value);
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
        return 1;
    }
    return interval;
};

const normalizeAppointmentColor = (value: unknown): string => {
    if (typeof value !== 'string') return '#DC4A60';

    const normalized = value.trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : '#DC4A60';
};

const ensureMembersBelongToUser = async (memberIds: string[], userId: string) => {
    for (const memberId of memberIds) {
        const member = await query(
            'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
            [memberId, userId]
        );
        if (member.rows.length === 0) {
            throw new Error('INVALID_MEMBER');
        }
    }
};

const enrichAppointmentsWithMembers = async (appointments: any[], userId: string) => {
    if (appointments.length === 0) return appointments;
    const membersResult = await query(
        'SELECT id, name, color FROM family_members WHERE user_id = $1',
        [userId]
    );
    const membersById = new Map(membersResult.rows.map((m: any) => [m.id, m]));
    return appointments.map((apt) => {
        const familyMemberIds: string[] = Array.isArray(apt.family_member_ids) ? apt.family_member_ids : [];
        return {
            ...apt,
            family_member_ids: familyMemberIds,
            family_members_data: familyMemberIds.map((id) => membersById.get(id)).filter(Boolean),
        };
    });
};

const parseNaiveDateTime = (value: string): Date | null => {
    const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (!match) return null;

    const [, year, month, day, hour, minute, second = '0'] = match;
    const date = new Date(Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
    ));

    return Number.isNaN(date.getTime()) ? null : date;
};

const formatNaiveDateTime = (date: Date): string => {
    const pad = (value: number) => String(value).padStart(2, '0');

    return [
        date.getUTCFullYear(),
        '-',
        pad(date.getUTCMonth() + 1),
        '-',
        pad(date.getUTCDate()),
        'T',
        pad(date.getUTCHours()),
        ':',
        pad(date.getUTCMinutes()),
        ':',
        pad(date.getUTCSeconds()),
    ].join('');
};

const formatDateOnly = (date: Date): string => {
    return formatNaiveDateTime(date).slice(0, 10);
};

const getOccurrenceDate = (
    base: Date,
    frequency: RecurrenceFrequency,
    interval: number,
    occurrenceIndex: number
): Date | null => {
    if (occurrenceIndex === 0) {
        return new Date(base.getTime());
    }

    if (frequency === 'daily') {
        const date = new Date(base.getTime());
        date.setUTCDate(date.getUTCDate() + occurrenceIndex * interval);
        return date;
    }

    if (frequency === 'weekly') {
        const date = new Date(base.getTime());
        date.setUTCDate(date.getUTCDate() + occurrenceIndex * interval * 7);
        return date;
    }

    if (frequency === 'monthly') {
        const baseMonth = base.getUTCFullYear() * 12 + base.getUTCMonth();
        const targetMonth = baseMonth + occurrenceIndex * interval;
        const year = Math.floor(targetMonth / 12);
        const month = targetMonth % 12;
        const day = base.getUTCDate();

        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

        // A monthly event on the 29th, 30th or 31st skips months that
        // do not contain that calendar date rather than silently moving it.
        if (day > daysInMonth) {
            return null;
        }

        return new Date(Date.UTC(
            year,
            month,
            day,
            base.getUTCHours(),
            base.getUTCMinutes(),
            base.getUTCSeconds()
        ));
    }

    if (frequency === 'yearly') {
        const year = base.getUTCFullYear() + occurrenceIndex * interval;
        const month = base.getUTCMonth();
        const day = base.getUTCDate();

        const date = new Date(Date.UTC(
            year,
            month,
            day,
            base.getUTCHours(),
            base.getUTCMinutes(),
            base.getUTCSeconds()
        ));

        // Feb 29 yearly events occur only in leap years.
        if (date.getUTCMonth() !== month || date.getUTCDate() !== day) {
            return null;
        }

        return date;
    }

    return null;
};

const estimateOccurrenceIndex = (
    base: Date,
    target: Date,
    frequency: RecurrenceFrequency,
    interval: number
): number => {
    if (target.getTime() <= base.getTime()) return 0;

    if (frequency === 'daily' || frequency === 'weekly') {
        const days = Math.floor((target.getTime() - base.getTime()) / 86400000);
        const stepDays = frequency === 'weekly' ? interval * 7 : interval;
        return Math.max(0, Math.floor(days / stepDays) - 1);
    }

    if (frequency === 'monthly') {
        const months =
            (target.getUTCFullYear() - base.getUTCFullYear()) * 12 +
            (target.getUTCMonth() - base.getUTCMonth());

        return Math.max(0, Math.floor(months / interval) - 1);
    }

    if (frequency === 'yearly') {
        const years = target.getUTCFullYear() - base.getUTCFullYear();
        return Math.max(0, Math.floor(years / interval) - 1);
    }

    return 0;
};

const expandRecurringAppointments = (
    appointments: any[],
    rangeStartValue: string,
    rangeEndValue: string,
    exceptionsByAppointment: Map<string, Map<string, any>>
): any[] => {
    const rangeStart = parseNaiveDateTime(rangeStartValue);
    const rangeEnd = parseNaiveDateTime(rangeEndValue);

    if (!rangeStart || !rangeEnd) {
        return appointments;
    }

    const expanded: any[] = [];

    for (const appointment of appointments) {
        const frequency = normalizeRecurrenceFrequency(appointment.recurrence_frequency);

        if (frequency === 'none') {
            expanded.push(appointment);
            continue;
        }

        const baseStart = parseNaiveDateTime(String(appointment.start_time));
        if (!baseStart) {
            expanded.push(appointment);
            continue;
        }

        const baseEnd = appointment.end_time
            ? parseNaiveDateTime(String(appointment.end_time))
            : null;

        const durationMs = baseEnd
            ? Math.max(0, baseEnd.getTime() - baseStart.getTime())
            : 0;

        const interval = normalizeRecurrenceInterval(appointment.recurrence_interval);
        const recurrenceUntil = appointment.recurrence_until
            ? String(appointment.recurrence_until).slice(0, 10)
            : null;

        // Look back by the event duration so an occurrence beginning before
        // the requested range but ending inside it is still included.
        const searchStart = new Date(rangeStart.getTime() - durationMs);
        let occurrenceIndex = estimateOccurrenceIndex(
            baseStart,
            searchStart,
            frequency,
            interval
        );

        // The estimate places us close to the requested range, avoiding a
        // potentially huge loop for old daily/weekly recurring events.
        for (let safety = 0; safety < 10000; safety++, occurrenceIndex++) {
            const occurrenceStart = getOccurrenceDate(
                baseStart,
                frequency,
                interval,
                occurrenceIndex
            );

            // Invalid monthly/yearly dates are intentionally skipped.
            if (!occurrenceStart) {
                continue;
            }

            if (occurrenceStart.getTime() > rangeEnd.getTime()) {
                break;
            }

            const occurrenceDate = formatDateOnly(occurrenceStart);

            if (recurrenceUntil && occurrenceDate > recurrenceUntil) {
                break;
            }

            const exception =
                exceptionsByAppointment
                    .get(String(appointment.id))
                    ?.get(occurrenceDate);

            if (exception?.exception_type === 'skip') {
                continue;
            }

            const occurrenceEnd = new Date(
                occurrenceStart.getTime() + durationMs
            );

            if (
                occurrenceEnd.getTime() < rangeStart.getTime() ||
                occurrenceStart.getTime() > rangeEnd.getTime()
            ) {
                continue;
            }

            const overrideData =
                exception?.override_data &&
                typeof exception.override_data === 'object' &&
                !Array.isArray(exception.override_data)
                    ? exception.override_data
                    : {};

            expanded.push({
                ...appointment,
                ...overrideData,

                id: appointment.id,
                series_id: appointment.id,
                occurrence_id: `${appointment.id}:${occurrenceDate}`,
                occurrence_date: occurrenceDate,
                is_recurring_occurrence: true,
                series_start_time: appointment.start_time,
                series_end_time: appointment.end_time,

                start_time:
                    typeof overrideData.start_time === 'string'
                        ? overrideData.start_time
                        : formatNaiveDateTime(occurrenceStart),

                end_time:
                    overrideData.end_time !== undefined
                        ? overrideData.end_time
                        : appointment.end_time
                            ? formatNaiveDateTime(occurrenceEnd)
                            : null,
            });
        }
    }

    return expanded.sort((a, b) =>
        String(a.start_time).localeCompare(String(b.start_time))
    );
};

// Get all appointments
router.get('/', async (req: AuthRequest, res) => {
    try {
        const { start_date, end_date } = req.query;

        let queryText = 'SELECT * FROM appointments WHERE user_id = $1';
        const params: any[] = [req.userId];

        const nonRecurringConditions: string[] = [];
        const recurringConditions: string[] = [];

        if (start_date) {
            params.push(start_date);
            const parameter = `$${params.length}`;

            nonRecurringConditions.push(
                `COALESCE(end_time, start_time) >= ${parameter}`
            );
            recurringConditions.push(
                `(recurrence_until IS NULL OR recurrence_until >= (${parameter})::date)`
            );
        }

        if (end_date) {
            params.push(end_date);
            const parameter = `$${params.length}`;

            nonRecurringConditions.push(`start_time <= ${parameter}`);
            recurringConditions.push(`start_time <= ${parameter}`);
        }

        if (nonRecurringConditions.length > 0) {
            queryText += ` AND (
                (
                    recurrence_frequency = 'none'
                    AND ${nonRecurringConditions.join(' AND ')}
                )
                OR
                (
                    recurrence_frequency <> 'none'
                    AND ${recurringConditions.join(' AND ')}
                )
            )`;
        }

        queryText += ' ORDER BY start_time ASC';

        const result = await query(queryText, params);

        const exceptionsByAppointment = new Map<string, Map<string, any>>();

        if (start_date && end_date && result.rows.length > 0) {
            const recurringIds = result.rows
                .filter((row: any) => row.recurrence_frequency !== 'none')
                .map((row: any) => row.id);

            if (recurringIds.length > 0) {
                const exceptionResult = await query(
                    `SELECT appointment_id, occurrence_date, exception_type, override_data
                     FROM appointment_recurrence_exceptions
                     WHERE appointment_id = ANY($1::uuid[])
                       AND occurrence_date BETWEEN ($2)::date AND ($3)::date`,
                    [
                        recurringIds,
                        String(start_date).slice(0, 10),
                        String(end_date).slice(0, 10),
                    ]
                );

                for (const exception of exceptionResult.rows) {
                    const appointmentId = String(exception.appointment_id);
                    const occurrenceDate = String(exception.occurrence_date).slice(0, 10);

                    if (!exceptionsByAppointment.has(appointmentId)) {
                        exceptionsByAppointment.set(appointmentId, new Map());
                    }

                    exceptionsByAppointment
                        .get(appointmentId)!
                        .set(occurrenceDate, exception);
                }
            }
        }

        const rows =
            start_date && end_date
                ? expandRecurringAppointments(
                    result.rows,
                    String(start_date),
                    String(end_date),
                    exceptionsByAppointment
                )
                : result.rows;

        const appointments = await enrichAppointmentsWithMembers(
            rows,
            req.userId!
        );

        res.json({ success: true, data: appointments });
    } catch (error) {
        console.error('Get appointments error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create appointment
router.post('/', async (req: AuthRequest, res) => {
    try {
        const {
            title,
            description,
            start_time,
            end_time,
            location,
            family_member_ids,
            reminder_30min,
            reminder_1hour,
            notes,
            recurrence_frequency,
            recurrence_interval,
            recurrence_until,
            color,
            is_all_day,
        } = req.body;

        const cleanedTitle = typeof title === 'string' ? title.trim() : '';
        const startTime = toNullIfEmpty(start_time);
        const recurrenceFrequency = normalizeRecurrenceFrequency(recurrence_frequency);
        const recurrenceInterval = recurrenceFrequency === 'none'
            ? 1
            : normalizeRecurrenceInterval(recurrence_interval);
        const recurrenceUntil = recurrenceFrequency === 'none'
            ? null
            : toNullIfEmpty(recurrence_until);

        if (!cleanedTitle || !startTime) {
            return res.status(400).json({ success: false, error: 'Title and start_time are required' });
        }

        if (recurrenceUntil) {
            const startDate = String(startTime).slice(0, 10);
            if (String(recurrenceUntil).slice(0, 10) < startDate) {
                return res.status(400).json({
                    success: false,
                    error: 'recurrence_until cannot be before start_time',
                });
            }
        }

        const memberIds: string[] = Array.isArray(family_member_ids)
            ? family_member_ids.filter((id: any) => typeof id === 'string' && id.trim())
            : [];
        await ensureMembersBelongToUser(memberIds, req.userId!);

        const result = await query(
            `INSERT INTO appointments (
                user_id, title, description, start_time, end_time, location,
                family_member_ids, reminder_30min, reminder_1hour, notes,
                recurrence_frequency, recurrence_interval, recurrence_until, color,
                is_all_day
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10,
                $11, $12, $13, $14, $15
            ) RETURNING *`,
            [
                req.userId,
                cleanedTitle,
                toNullIfEmpty(description),
                startTime,
                toNullIfEmpty(end_time),
                toNullIfEmpty(location),
                JSON.stringify(memberIds),
                Boolean(reminder_30min),
                Boolean(reminder_1hour),
                toNullIfEmpty(notes),
                recurrenceFrequency,
                recurrenceInterval,
                recurrenceUntil,
                normalizeAppointmentColor(color),
                Boolean(is_all_day),
            ]
        );

        const [enriched] = await enrichAppointmentsWithMembers([result.rows[0]], req.userId!);
        broadcast(req.userId!, { type: 'update', entity: 'appointments', action: 'created' });
        res.json({ success: true, data: enriched });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Family member not found' });
        }

        console.error('Create appointment error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update appointment
router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            start_time,
            end_time,
            location,
            family_member_ids,
            reminder_30min,
            reminder_1hour,
            notes,
            recurrence_frequency,
            recurrence_interval,
            recurrence_until,
            color,
            is_all_day,
        } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        const pushUpdate = (field: string, value: any) => {
            values.push(value);
            updates.push(`${field} = $${values.length}`);
        };

        if (title !== undefined) {
            const cleanedTitle = typeof title === 'string' ? title.trim() : '';
            if (!cleanedTitle) {
                return res.status(400).json({ success: false, error: 'Title cannot be empty' });
            }
            pushUpdate('title', cleanedTitle);
        }

        if (description !== undefined) {
            pushUpdate('description', toNullIfEmpty(description));
        }

        if (start_time !== undefined) {
            const startTime = toNullIfEmpty(start_time);
            if (!startTime) {
                return res.status(400).json({ success: false, error: 'start_time cannot be empty' });
            }
            pushUpdate('start_time', startTime);
        }

        if (end_time !== undefined) {
            pushUpdate('end_time', toNullIfEmpty(end_time));
        }

        if (location !== undefined) {
            pushUpdate('location', toNullIfEmpty(location));
        }

        if (family_member_ids !== undefined) {
            const memberIds: string[] = Array.isArray(family_member_ids)
                ? family_member_ids.filter((mid: any) => typeof mid === 'string' && mid.trim())
                : [];
            await ensureMembersBelongToUser(memberIds, req.userId!);
            values.push(JSON.stringify(memberIds));
            updates.push(`family_member_ids = $${values.length}::jsonb`);
        }

        if (reminder_30min !== undefined) {
            pushUpdate('reminder_30min', Boolean(reminder_30min));
        }

        if (reminder_1hour !== undefined) {
            pushUpdate('reminder_1hour', Boolean(reminder_1hour));
        }

        if (notes !== undefined) {
            pushUpdate('notes', toNullIfEmpty(notes));
        }

        if (is_all_day !== undefined) {
            pushUpdate('is_all_day', Boolean(is_all_day));
        }

        if (color !== undefined) {
            pushUpdate('color', normalizeAppointmentColor(color));
        }

        if (recurrence_frequency !== undefined) {
            const frequency = normalizeRecurrenceFrequency(recurrence_frequency);
            pushUpdate('recurrence_frequency', frequency);

            if (frequency === 'none') {
                pushUpdate('recurrence_interval', 1);
                pushUpdate('recurrence_until', null);
            }
        }

        if (recurrence_interval !== undefined && recurrence_frequency !== 'none') {
            pushUpdate('recurrence_interval', normalizeRecurrenceInterval(recurrence_interval));
        }

        if (recurrence_until !== undefined && recurrence_frequency !== 'none') {
            pushUpdate('recurrence_until', toNullIfEmpty(recurrence_until));
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const result = await query(
            `UPDATE appointments
       SET ${updates.join(', ')}
       WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
       RETURNING *`,
            [...values, id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        const [enriched] = await enrichAppointmentsWithMembers([result.rows[0]], req.userId!);
        broadcast(req.userId!, { type: 'update', entity: 'appointments', action: 'updated' });
        res.json({ success: true, data: enriched });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Family member not found' });
        }

        console.error('Update appointment error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update one occurrence from a recurring appointment
router.put('/:id/occurrences/:date', async (req: AuthRequest, res) => {
    try {
        const { id, date } = req.params;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ success: false, error: 'Invalid occurrence date' });
        }

        const appointmentResult = await query(
            `SELECT *
             FROM appointments
             WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );

        if (appointmentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        const appointment = appointmentResult.rows[0];

        if (appointment.recurrence_frequency === 'none') {
            return res.status(400).json({
                success: false,
                error: 'Appointment is not recurring',
            });
        }

        const allowedFields = [
            'title',
            'description',
            'start_time',
            'end_time',
            'location',
            'family_member_ids',
            'reminder_30min',
            'reminder_1hour',
            'notes',
            'color',
            'is_all_day',
        ];

        const overrideData: Record<string, any> = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                overrideData[field] = req.body[field];
            }
        }

        if (overrideData.title !== undefined) {
            const cleanedTitle =
                typeof overrideData.title === 'string'
                    ? overrideData.title.trim()
                    : '';

            if (!cleanedTitle) {
                return res.status(400).json({
                    success: false,
                    error: 'Title cannot be empty',
                });
            }

            overrideData.title = cleanedTitle;
        }

        if (overrideData.color !== undefined) {
            overrideData.color = normalizeAppointmentColor(overrideData.color);
        }

        if (overrideData.family_member_ids !== undefined) {
            const memberIds: string[] = Array.isArray(overrideData.family_member_ids)
                ? overrideData.family_member_ids.filter(
                    (memberId: any) =>
                        typeof memberId === 'string' && memberId.trim()
                )
                : [];

            await ensureMembersBelongToUser(memberIds, req.userId!);
            overrideData.family_member_ids = memberIds;
        }

        await query(
            `INSERT INTO appointment_recurrence_exceptions
                (appointment_id, occurrence_date, exception_type, override_data)
             VALUES ($1, $2::date, 'override', $3::jsonb)
             ON CONFLICT (appointment_id, occurrence_date)
             DO UPDATE SET
                exception_type = 'override',
                override_data = EXCLUDED.override_data`,
            [id, date, JSON.stringify(overrideData)]
        );

        broadcast(req.userId!, {
            type: 'update',
            entity: 'appointments',
            action: 'updated',
        });

        res.json({
            success: true,
            message: 'Appointment occurrence updated',
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({
                success: false,
                error: 'Family member not found',
            });
        }

        console.error('Update appointment occurrence error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

// Delete one occurrence from a recurring appointment
router.delete('/:id/occurrences/:date', async (req: AuthRequest, res) => {
    try {
        const { id, date } = req.params;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ success: false, error: 'Invalid occurrence date' });
        }

        const appointmentResult = await query(
            `SELECT id, recurrence_frequency
             FROM appointments
             WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );

        if (appointmentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        if (appointmentResult.rows[0].recurrence_frequency === 'none') {
            return res.status(400).json({
                success: false,
                error: 'Appointment is not recurring',
            });
        }

        await query(
            `INSERT INTO appointment_recurrence_exceptions
                (appointment_id, occurrence_date, exception_type, override_data)
             VALUES ($1, $2::date, 'skip', NULL)
             ON CONFLICT (appointment_id, occurrence_date)
             DO UPDATE SET
                exception_type = 'skip',
                override_data = NULL`,
            [id, date]
        );

        broadcast(req.userId!, {
            type: 'update',
            entity: 'appointments',
            action: 'updated',
        });

        res.json({
            success: true,
            message: 'Appointment occurrence deleted',
        });
    } catch (error) {
        console.error('Delete appointment occurrence error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete appointment
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM appointments WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        broadcast(req.userId!, { type: 'update', entity: 'appointments', action: 'deleted' });
        res.json({ success: true, message: 'Appointment deleted' });
    } catch (error) {
        console.error('Delete appointment error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
