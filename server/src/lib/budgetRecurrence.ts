// Occurrence arithmetic for recurring budget items, shared by the Budget and
// Kakeibo routes so both count the same occurrences in a month.

const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const VALID_RECURRING_FREQUENCIES = new Set<RecurringFrequency>([
    'daily',
    'weekly',
    'monthly',
    'yearly',
]);

export const normalizeRecurringFrequency = (value: unknown): RecurringFrequency => {
    if (typeof value !== 'string') return 'monthly';
    const normalized = value.trim().toLowerCase() as RecurringFrequency;
    return VALID_RECURRING_FREQUENCIES.has(normalized) ? normalized : 'monthly';
};

export const normalizeRecurringInterval = (value: unknown): number => {
    const interval = Number(value);
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
        return 1;
    }
    return interval;
};

export const parseDateOnly = (value: unknown): Date | null => {
    const raw = value instanceof Date
        ? [
            value.getUTCFullYear(),
            String(value.getUTCMonth() + 1).padStart(2, '0'),
            String(value.getUTCDate()).padStart(2, '0'),
        ].join('-')
        : String(value ?? '').slice(0, 10);

    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

    if (
        date.getUTCFullYear() !== Number(year) ||
        date.getUTCMonth() !== Number(month) - 1 ||
        date.getUTCDate() !== Number(day)
    ) {
        return null;
    }

    return date;
};

export const formatDateOnly = (date: Date): string => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

// Money follows the last-day rule, not the calendar's skip rule: a bill due on
// the 31st is paid on the 30th or the 28th, it does not vanish for five months
// a year. Monthly series are anchored on debit_day (the day the family chose),
// so a series that started on a clamped day still returns to the 31st.
export const getRecurringOccurrenceDate = (
    base: Date,
    frequency: RecurringFrequency,
    interval: number,
    occurrenceIndex: number,
    anchorDay?: number
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
        const day = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : base.getUTCDate();
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

        return new Date(Date.UTC(year, month, Math.min(day, daysInMonth)));
    }

    const year = base.getUTCFullYear() + occurrenceIndex * interval;
    const month = base.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    // A yearly debit on Feb. 29 falls on Feb. 28 outside leap years.
    return new Date(Date.UTC(year, month, Math.min(base.getUTCDate(), daysInMonth)));
};

export const estimateRecurringOccurrenceIndex = (
    base: Date,
    target: Date,
    frequency: RecurringFrequency,
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

    const years = target.getUTCFullYear() - base.getUTCFullYear();
    return Math.max(0, Math.floor(years / interval) - 1);
};

export const expandRecurringTransactions = (
    recurringExpenses: any[],
    rangeStartValue: string,
    rangeEndValue: string
): any[] => {
    const rangeStart = parseDateOnly(rangeStartValue);
    const rangeEnd = parseDateOnly(rangeEndValue);

    if (!rangeStart || !rangeEnd) return [];

    const occurrences: any[] = [];

    for (const recurring of recurringExpenses) {
        const base = parseDateOnly(recurring.start_date);
        if (!base) continue;

        const frequency = normalizeRecurringFrequency(recurring.recurrence_frequency);
        const interval = normalizeRecurringInterval(recurring.recurrence_interval);
        const recurrenceUntil = recurring.recurrence_until
            ? String(recurring.recurrence_until).slice(0, 10)
            : null;

        let occurrenceIndex = estimateRecurringOccurrenceIndex(
            base,
            rangeStart,
            frequency,
            interval
        );

        for (let safety = 0; safety < 10000; safety++, occurrenceIndex++) {
            const occurrenceDate = getRecurringOccurrenceDate(
                base,
                frequency,
                interval,
                occurrenceIndex,
                toNumber(recurring.debit_day)
            );

            if (!occurrenceDate) continue;

            if (occurrenceDate.getTime() > rangeEnd.getTime()) break;

            const occurrenceDateValue = formatDateOnly(occurrenceDate);

            if (recurrenceUntil && occurrenceDateValue > recurrenceUntil) {
                break;
            }

            if (occurrenceDate.getTime() < rangeStart.getTime()) {
                continue;
            }

            occurrences.push({
                ...recurring,
                series_id: recurring.id,
                occurrence_id: `${recurring.id}:${occurrenceDateValue}`,
                occurrence_date: occurrenceDateValue,
            });
        }
    }

    return occurrences;
};
