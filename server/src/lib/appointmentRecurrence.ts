/**
 * Recurring appointments: occurrences are computed from the series (start,
 * frequency, interval, until) and its per-date exceptions, never stored.
 * Shared by the appointments API and the reminder scheduler.
 *
 * Times are naive local wall-clock strings ('YYYY-MM-DDTHH:mm:ss'); they are
 * handled as UTC Date objects internally only so that no timezone or DST rule
 * can shift them.
 */

export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export const VALID_RECURRENCE_FREQUENCIES = new Set<RecurrenceFrequency>([
    'none',
    'daily',
    'weekly',
    'monthly',
    'yearly',
]);

export const normalizeRecurrenceFrequency = (value: unknown): RecurrenceFrequency => {
    if (typeof value !== 'string') return 'none';

    const normalized = value.trim().toLowerCase() as RecurrenceFrequency;
    return VALID_RECURRENCE_FREQUENCIES.has(normalized) ? normalized : 'none';
};

export const normalizeRecurrenceInterval = (value: unknown): number => {
    const interval = Number(value);
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
        return 1;
    }
    return interval;
};

export const parseNaiveDateTime = (value: string): Date | null => {
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

export const formatNaiveDateTime = (date: Date): string => {
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

export const formatDateOnly = (date: Date): string => {
    return formatNaiveDateTime(date).slice(0, 10);
};

export const getOccurrenceDate = (
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

export const estimateOccurrenceIndex = (
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

export const expandRecurringAppointments = (
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
