import { query } from '../db';

/**
 * Time zones, in one place.
 *
 * OpenFamily stores what a family types: "dentist at 09:30" is the wall-clock
 * time 2026-11-15T09:30:00, with no zone attached. That reads right on every
 * screen of the family, whatever the device. It only becomes a moment in time
 * once a zone is named, and the server needs that moment: to send a reminder
 * on time, to know which day "today" is for a wall display, to tell another
 * calendar when an event starts.
 *
 * The zone is the family's: the one a parent chose in Settings, or, when none
 * was chosen, the one the server runs in (the TZ variable). Until now the
 * server's was the only one, which is wrong as soon as the server runs
 * somewhere else than the family lives.
 */

const FALLBACK = 'Europe/Paris';

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (zone: string): Intl.DateTimeFormat => {
    let formatter = formatters.get(zone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: zone,
            hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        formatters.set(zone, formatter);
    }
    return formatter;
};

/** True for an IANA zone name this runtime knows ("Europe/Paris", "UTC"). */
export const isTimeZone = (value: unknown): value is string => {
    if (typeof value !== 'string' || value === '' || value.length > 64) return false;
    try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
    } catch {
        return false;
    }
};

/** The zone's canonical spelling: "europe/paris" becomes "Europe/Paris". */
export const canonicalTimeZone = (zone: string): string =>
    new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;

/** The zone the server runs in: TZ when it names one, else the system's. */
export const serverTimeZone = (): string => {
    if (isTimeZone(process.env.TZ)) return process.env.TZ;
    const system = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(system) ? system : FALLBACK;
};

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

/** The wall-clock fields of an instant in a zone, as if they were UTC. */
const wallAsUtc = (ms: number, zone: string): number => {
    const parts: Record<string, number> = {};
    for (const part of formatterFor(zone).formatToParts(new Date(ms))) {
        if (part.type !== 'literal') parts[part.type] = Number(part.value);
    }
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
};

/** What the clocks of a zone show at an instant: 'YYYY-MM-DDTHH:mm:ss'. */
export const naiveInZone = (instant: Date, zone: string): string => {
    const wall = new Date(wallAsUtc(instant.getTime(), zone));
    return `${pad(wall.getUTCFullYear(), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`
        + `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}`;
};

/** The calendar day of an instant in a zone: 'YYYY-MM-DD'. */
export const dayInZone = (instant: Date, zone: string): string => naiveInZone(instant, zone).slice(0, 10);

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instant at which the clocks of a zone show a wall-clock time. An
 * invalid string gives an invalid Date. On the night the clocks go back, the
 * hour that happens twice is taken the first time; an hour skipped when they
 * go forward is carried over the gap (02:30 becomes 03:30), as calendars do.
 */
export const instantInZone = (naive: string, zone: string): Date => {
    const match = NAIVE.exec(String(naive));
    if (!match) return new Date(NaN);
    const wall = Date.UTC(
        Number(match[1]), Number(match[2]) - 1, Number(match[3]),
        Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0),
    );
    // The zone's offset a day before and a day after: the same, except around
    // a clock change, where the wall-clock time can exist twice or not at all.
    const offsetAt = (ms: number): number => wallAsUtc(ms, zone) - ms;
    const candidates = [wall - offsetAt(wall - DAY_MS), wall - offsetAt(wall + DAY_MS)];
    const exact = candidates.filter((candidate) => wallAsUtc(candidate, zone) === wall);
    return new Date(exact.length > 0 ? Math.min(...exact) : Math.max(...candidates));
};

/** The day after (or before) a calendar day: a pure date sum, no zone involved. */
export const addDays = (day: string, days: number): string => {
    const [year, month, date] = day.split('-').map(Number);
    const moved = new Date(Date.UTC(year, month - 1, date + days));
    return `${pad(moved.getUTCFullYear(), 4)}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
};

/** ISO weekday of a calendar day: Monday = 1 ... Sunday = 7. */
export const isoWeekdayOf = (day: string): number => {
    const [year, month, date] = day.split('-').map(Number);
    return ((new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7) + 1;
};

// A family's zone is read on every display page and appointment list: kept a
// minute, and dropped at once when a parent changes it.
const CACHE_MS = 60_000;
const cache = new Map<string, { zone: string; at: number }>();

/** The zone of a family, given its owner's id: the one chosen in Settings, or the server's. */
export const familyTimeZone = async (ownerId: string): Promise<string> => {
    const hit = cache.get(ownerId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.zone;
    const result = await query('SELECT timezone FROM users WHERE id = $1', [ownerId]);
    const stored = result.rows[0]?.timezone;
    const zone = isTimeZone(stored) ? stored : serverTimeZone();
    cache.set(ownerId, { zone, at: Date.now() });
    return zone;
};

/** Forgets what was read: after a change of zone, or of owner. */
export const forgetFamilyTimeZones = (): void => cache.clear();
