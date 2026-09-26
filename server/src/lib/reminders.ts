/**
 * Appointment reminders: a list of offsets in minutes before the start
 * (0 = at the start), several per appointment, up to four weeks ahead.
 * All-day events have no start time; their reminders count back from 09:00
 * on the day, so "1 day before" arrives the day before at 09:00.
 */

export const MAX_REMINDERS = 5;
export const MAX_REMINDER_MINUTES = 4 * 7 * 24 * 60;
export const ALL_DAY_REMINDER_HOUR = 9;

/** Valid, distinct offsets in ascending order; anything else is dropped. */
export const normalizeReminderMinutes = (value: unknown): number[] => {
    if (!Array.isArray(value)) return [];
    const minutes = new Set<number>();
    for (const item of value) {
        const n = Number(item);
        if (Number.isInteger(n) && n >= 0 && n <= MAX_REMINDER_MINUTES) minutes.add(n);
    }
    return [...minutes].sort((a, b) => a - b).slice(0, MAX_REMINDERS);
};

/**
 * Older clients (the Android app before this change) still send the two
 * "30 minutes" and "1 hour" flags. They set or clear exactly those two
 * offsets and leave any other reminder as it was.
 */
export const applyLegacyReminderFlags = (
    current: number[],
    reminder30: unknown,
    reminder60: unknown
): number[] => {
    const next = new Set(current);
    if (reminder30 !== undefined) {
        if (reminder30) next.add(30); else next.delete(30);
    }
    if (reminder60 !== undefined) {
        if (reminder60) next.add(60); else next.delete(60);
    }
    return normalizeReminderMinutes([...next]);
};

/** The legacy flags, kept in step so older clients still show the boxes ticked. */
export const legacyReminderFlags = (minutes: number[]) => ({
    reminder_30min: minutes.includes(30),
    reminder_1hour: minutes.includes(60),
});
