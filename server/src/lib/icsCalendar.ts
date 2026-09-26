/**
 * Reads an iCalendar file (RFC 5545) into OpenFamily appointments: a file
 * exported from Google Calendar, Outlook, Apple Calendar, Proton, a school's
 * website, or the "secret address" of a Google calendar.
 *
 * - Times are converted to the family's local wall-clock time, the way every
 *   appointment is stored (naive 'YYYY-MM-DDTHH:mm:ss').
 * - A simple repeat rule (every N days, weeks, months or years, until a date or
 *   for a count) becomes a native OpenFamily series; a weekly rule on several
 *   days becomes one series per day. Removed dates (EXDATE, cancelled
 *   instances) become skipped occurrences and moved or edited instances become
 *   per-date overrides, exactly as if they had been edited in OpenFamily.
 * - Any other rule (the 2nd Tuesday of the month, the last weekday...) is
 *   expanded into single events inside a window of time.
 */
import ICAL from 'ical.js';

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface IcsException {
    date: string;
    type: 'skip' | 'override';
    data?: Record<string, unknown>;
}

export interface IcsEvent {
    uid: string;
    title: string;
    description: string | null;
    location: string | null;
    start: string;
    end: string | null;
    allDay: boolean;
    recurrence: { frequency: Frequency; interval: number; until: string | null } | null;
    exceptions: IcsException[];
}

export interface IcsParseOptions {
    /** IANA zone the family lives in; every time is converted to it. */
    timeZone: string;
    /** Events that ended before this are left out (null keeps everything). */
    windowStart: Date | null;
    /** Rules OpenFamily cannot represent are expanded up to this date. */
    windowEnd: Date;
    /** Title for an event without a SUMMARY. */
    untitled: string;
    maxEvents: number;
}

export interface IcsParseResult {
    name: string | null;
    events: IcsEvent[];
    truncated: boolean;
}

export class IcsError extends Error {
    constructor(public code: 'NOT_ICS' | 'EMPTY', message?: string) {
        super(message ?? code);
    }
}

// ─── time zones ──────────────────────────────────────────────────────────────

// Outlook and Exchange name zones the Windows way; the usual ones in this app's
// languages, mapped to IANA. Files that define their zones (VTIMEZONE) do not
// need this; ical.js reads the definition.
const WINDOWS_ZONES: Record<string, string> = {
    'Romance Standard Time': 'Europe/Paris',
    'W. Europe Standard Time': 'Europe/Berlin',
    'Central Europe Standard Time': 'Europe/Budapest',
    'Central European Standard Time': 'Europe/Warsaw',
    'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Atlantic/Reykjavik',
    'E. Europe Standard Time': 'Europe/Chisinau',
    'FLE Standard Time': 'Europe/Kiev',
    'Russian Standard Time': 'Europe/Moscow',
    'E. South America Standard Time': 'America/Sao_Paulo',
    'Eastern Standard Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Canada Central Standard Time': 'America/Regina',
    'Atlantic Standard Time': 'America/Halifax',
    'China Standard Time': 'Asia/Shanghai',
    'Tokyo Standard Time': 'Asia/Tokyo',
    'Morocco Standard Time': 'Africa/Casablanca',
    'W. Central Africa Standard Time': 'Africa/Lagos',
    'Mexico Standard Time': 'America/Mexico_City',
    'Central Standard Time (Mexico)': 'America/Mexico_City',
    'SA Pacific Standard Time': 'America/Bogota',
    'Argentina Standard Time': 'America/Buenos_Aires',
    'UTC': 'UTC',
};

const validZones = new Map<string, boolean>();
const isIanaZone = (zone: string): boolean => {
    if (!validZones.has(zone)) {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: zone });
            validZones.set(zone, true);
        } catch {
            validZones.set(zone, false);
        }
    }
    return validZones.get(zone)!;
};

const normalizeZoneName = (tzid: string): string => {
    // Some producers prefix zones: "/mozilla.org/20050126_1/Europe/Paris", "/Europe/Paris".
    const stripped = tzid.replace(/^"|"$/g, '').replace(/^\/(?:[^/]+\/[^/]+\/)?/, '');
    return WINDOWS_ZONES[stripped] ?? stripped;
};

const partsFormatter = new Map<string, Intl.DateTimeFormat>();
const wallParts = (instant: number, zone: string) => {
    let fmt = partsFormatter.get(zone);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: zone, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        partsFormatter.set(zone, fmt);
    }
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(instant))) {
        if (part.type !== 'literal') p[part.type] = Number(part.value);
    }
    return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
};

/** The instant at which a wall-clock time happens in a zone. */
const zonedToInstant = (y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): number => {
    const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
    let guess = asUtc;
    for (let i = 0; i < 3; i++) {
        const p = wallParts(guess, zone);
        const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
        const next = asUtc - offset;
        if (next === guess) break;
        guess = next;
    }
    return guess;
};

const pad = (n: number) => String(n).padStart(2, '0');
const naive = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
    `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}`;

/**
 * Local wall-clock time of an ical.js time in the family's zone. `tzidHint`
 * is the TZID written on the property, used when the file did not define it.
 */
export function toLocalNaive(time: ICAL.Time, timeZone: string, tzidHint?: string | null): string {
    if (time.isDate) return naive(time.year, time.month, time.day);
    const zoneId = time.zone?.tzid;
    let instant: number | null = null;
    if (zoneId === 'UTC' || time.zone === ICAL.Timezone.utcTimezone) {
        instant = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
    } else {
        const declared = zoneId && zoneId !== 'floating' ? zoneId : tzidHint;
        const iana = declared ? normalizeZoneName(declared) : null;
        if (iana && isIanaZone(iana)) {
            instant = zonedToInstant(time.year, time.month, time.day, time.hour, time.minute, time.second, iana);
        } else if (zoneId && zoneId !== 'floating' && time.zone !== ICAL.Timezone.localTimezone) {
            // A zone defined only inside the file, under a name Intl does not know.
            instant = time.toUnixTime() * 1000;
        }
    }
    if (instant === null) {
        // Floating time: the same wall clock wherever you are.
        return naive(time.year, time.month, time.day, time.hour, time.minute, time.second);
    }
    const p = wallParts(instant, timeZone);
    return naive(p.year, p.month, p.day, p.hour, p.minute, p.second);
}

const addDays = (day: string, n: number): string => {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + n));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

// ─── events ──────────────────────────────────────────────────────────────────

const text = (comp: ICAL.Component, name: string, max: number): string | null => {
    const value = comp.getFirstPropertyValue(name);
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s ? s.slice(0, max) : null;
};

const tzidOf = (comp: ICAL.Component, name: string): string | null => {
    const prop = comp.getFirstProperty(name);
    const tzid = prop?.getParameter('tzid');
    return typeof tzid === 'string' ? tzid : null;
};

const isCancelled = (comp: ICAL.Component) =>
    String(comp.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';

interface Span { start: string; end: string | null; allDay: boolean }

/** Start and end in local time; an all-day event spans 00:00 to 23:59 of its days. */
function spanOf(start: ICAL.Time, end: ICAL.Time | null, zone: string, startTzid: string | null, endTzid: string | null): Span {
    if (start.isDate) {
        const first = naive(start.year, start.month, start.day).slice(0, 10);
        // DTEND of an all-day event is the day after its last day.
        let last = end ? (end.isDate ? addDays(naive(end.year, end.month, end.day).slice(0, 10), -1) : toLocalNaive(end, zone, endTzid).slice(0, 10)) : first;
        if (last < first) last = first;
        return { start: `${first}T00:00:00`, end: `${last}T23:59:00`, allDay: true };
    }
    const s = toLocalNaive(start, zone, startTzid);
    let e = end ? toLocalNaive(end, zone, endTzid ?? startTzid) : null;
    // No DTEND, or a zero-length event: no end, as when one is left out in OpenFamily.
    if (e && e <= s) e = null;
    return { start: s, end: e, allDay: false };
}

const FREQUENCIES: Record<string, Frequency> = {
    DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly',
};
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface SimpleRule {
    frequency: Frequency;
    interval: number;
    /** Weekly rules on several days: one series per day. */
    days: string[] | null;
}

/**
 * The rule as OpenFamily can store it, or null when it needs more than
 * "every N days/weeks/months/years" (then it is expanded instead).
 */
function simpleRule(rule: ICAL.Recur, start: ICAL.Time): SimpleRule | null {
    const frequency = FREQUENCIES[String(rule.freq)];
    if (!frequency) return null;
    const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;
    if (interval > 365) return null;
    const parts = Object.entries(rule.parts ?? {}).filter(([, v]) => Array.isArray(v) ? v.length > 0 : v != null);
    const only = (key: string, value: number) => {
        const v = (rule.parts as Record<string, unknown[]>)[key];
        return !v || (v.length === 1 && Number(v[0]) === value);
    };
    const startWeekday = WEEKDAYS[start.dayOfWeek() - 1];
    for (const [key] of parts) {
        if (frequency === 'weekly' && key === 'BYDAY') continue;
        if ((frequency === 'monthly' || frequency === 'yearly') && key === 'BYMONTHDAY' && only('BYMONTHDAY', start.day)) continue;
        if (frequency === 'yearly' && key === 'BYMONTH' && only('BYMONTH', start.month)) continue;
        return null;
    }
    if (frequency === 'weekly') {
        const byDay = ((rule.parts as Record<string, string[]>).BYDAY ?? []).map((d) => String(d).toUpperCase());
        if (byDay.some((d) => !WEEKDAYS.includes(d))) return null; // "1MO" and such
        const days = [...new Set(byDay)];
        if (days.length === 0 || (days.length === 1 && days[0] === startWeekday)) {
            return { frequency, interval, days: null };
        }
        return { frequency, interval, days };
    }
    return { frequency, interval, days: null };
}

/**
 * First date of a weekly-on-several-days split: the first `day` on or after
 * the start, counted in weeks that begin on WKST, as RFC 5545 does.
 */
function firstOfSplit(start: string, startWeekday: number, day: number, weekStart: number, interval: number): string {
    const posStart = (startWeekday - weekStart + 7) % 7;
    const posDay = (day - weekStart + 7) % 7;
    const offset = posDay >= posStart ? posDay - posStart : 7 * interval - (posStart - posDay);
    return addDays(start.slice(0, 10), offset) + start.slice(10);
}

const shiftSpan = (span: Span, newStart: string): Span => {
    if (!span.end) return { ...span, start: newStart };
    const delta = Date.parse(`${newStart}Z`) - Date.parse(`${span.start}Z`);
    const end = new Date(Date.parse(`${span.end}Z`) + delta).toISOString().slice(0, 19);
    return { ...span, start: newStart, end };
};

export function parseIcs(input: string, options: IcsParseOptions): IcsParseResult {
    if (!/BEGIN:VCALENDAR/i.test(input)) throw new IcsError('NOT_ICS');
    let jcal: any;
    try {
        jcal = ICAL.parse(input);
    } catch (error) {
        throw new IcsError('NOT_ICS', error instanceof Error ? error.message : undefined);
    }
    const roots: ICAL.Component[] = (Array.isArray(jcal[0]) ? jcal : [jcal])
        .map((j: any) => new ICAL.Component(j))
        .filter((c: ICAL.Component) => c.name === 'vcalendar');
    if (roots.length === 0) throw new IcsError('NOT_ICS');

    const zone = options.timeZone;
    const windowStartNaive = options.windowStart ? toLocalNaive(ICAL.Time.fromJSDate(options.windowStart, true), zone) : null;
    const windowEndNaive = toLocalNaive(ICAL.Time.fromJSDate(options.windowEnd, true), zone);
    const events: IcsEvent[] = [];
    let truncated = false;
    const push = (event: IcsEvent) => {
        if (events.length >= options.maxEvents) {
            truncated = true;
            return;
        }
        events.push(event);
    };

    // Masters and their modified instances, grouped by UID.
    const groups = new Map<string, { master: ICAL.Component | null; instances: ICAL.Component[] }>();
    for (const root of roots) {
        for (const comp of root.getAllSubcomponents('vevent')) {
            const uid = text(comp, 'uid', 500) ?? `nouid-${text(comp, 'dtstart', 40)}-${text(comp, 'summary', 80)}`;
            const group = groups.get(uid) ?? { master: null, instances: [] };
            if (comp.hasProperty('recurrence-id')) group.instances.push(comp);
            else if (!group.master) group.master = comp;
            groups.set(uid, group);
        }
    }

    const describe = (comp: ICAL.Component) => ({
        title: text(comp, 'summary', 255) ?? options.untitled,
        description: text(comp, 'description', 10000),
        location: text(comp, 'location', 1000),
    });

    const endsBeforeWindow = (span: Span) =>
        windowStartNaive !== null && (span.end ?? span.start) < windowStartNaive;

    for (const [uid, group] of groups) {
        if (truncated) break;

        // Instances whose series is not in the file: plain events.
        if (!group.master) {
            for (const comp of group.instances) {
                if (isCancelled(comp)) continue;
                const event = new ICAL.Event(comp);
                const span = spanOf(event.startDate, event.endDate ?? null, zone, tzidOf(comp, 'dtstart'), tzidOf(comp, 'dtend'));
                if (endsBeforeWindow(span)) continue;
                push({ uid: `${uid}@@${span.start}`, ...describe(comp), ...span, recurrence: null, exceptions: [] });
            }
            continue;
        }

        const master = group.master;
        if (isCancelled(master) || !master.hasProperty('dtstart')) continue;
        const event = new ICAL.Event(master);
        for (const instance of group.instances) event.relateException(instance);
        const startTzid = tzidOf(master, 'dtstart');
        const endTzid = tzidOf(master, 'dtend');
        const span = spanOf(event.startDate, event.endDate ?? null, zone, startTzid, endTzid);
        const base = describe(master);

        if (!event.isRecurring()) {
            if (endsBeforeWindow(span)) continue;
            push({ uid, ...base, ...span, recurrence: null, exceptions: [] });
            continue;
        }

        const rule = master.getFirstPropertyValue('rrule') as ICAL.Recur | null;
        const simple = rule && !master.hasProperty('rdate') && master.getAllProperties('rrule').length === 1
            ? simpleRule(rule, event.startDate)
            : null;

        if (simple && rule) {
            // End of the series: UNTIL, or the date of the COUNT-th occurrence.
            let until: string | null = null;
            if (rule.until) {
                until = toLocalNaive(rule.until, zone, startTzid).slice(0, 10);
            } else if (rule.count) {
                const it = event.iterator();
                let last: ICAL.Time | null = null;
                for (let i = 0, next = it.next(); next && i < rule.count && i < 5000; i++, next = it.next()) last = next;
                until = last ? toLocalNaive(last, zone, startTzid).slice(0, 10) : span.start.slice(0, 10);
            }
            if (until && windowStartNaive && until < windowStartNaive.slice(0, 10)) continue;

            const exceptions: IcsException[] = [];
            for (const prop of master.getAllProperties('exdate')) {
                const tzid = prop.getParameter('tzid');
                for (const value of prop.getValues()) {
                    if (value instanceof ICAL.Time) {
                        exceptions.push({ date: toLocalNaive(value, zone, typeof tzid === 'string' ? tzid : startTzid).slice(0, 10), type: 'skip' });
                    }
                }
            }
            for (const instance of group.instances) {
                const recurrenceId = instance.getFirstPropertyValue('recurrence-id');
                if (!(recurrenceId instanceof ICAL.Time)) continue;
                const date = toLocalNaive(recurrenceId, zone, tzidOf(instance, 'recurrence-id') ?? startTzid).slice(0, 10);
                if (isCancelled(instance)) {
                    exceptions.push({ date, type: 'skip' });
                    continue;
                }
                const moved = new ICAL.Event(instance);
                const movedSpan = spanOf(moved.startDate, moved.endDate ?? null, zone, tzidOf(instance, 'dtstart'), tzidOf(instance, 'dtend'));
                const info = describe(instance);
                exceptions.push({
                    date,
                    type: 'override',
                    data: {
                        title: info.title,
                        description: info.description,
                        location: info.location,
                        start_time: movedSpan.start,
                        end_time: movedSpan.end,
                        is_all_day: movedSpan.allDay,
                    },
                });
            }

            const recurrence = { frequency: simple.frequency, interval: simple.interval, until };
            if (!simple.days) {
                push({ uid, ...base, ...span, recurrence, exceptions });
                continue;
            }
            const startWeekday = event.startDate.dayOfWeek() - 1;
            // ical.js numbers weekdays 1 (Sunday) to 7; WKST defaults to Monday.
            const wkst = Number(rule.wkst);
            const weekStart = wkst >= 1 && wkst <= 7 ? wkst - 1 : 1;
            for (const day of simple.days) {
                const first = firstOfSplit(span.start, startWeekday, WEEKDAYS.indexOf(day), weekStart, simple.interval);
                if (until && first.slice(0, 10) > until) continue;
                push({ uid: `${uid}#${day}`, ...base, ...shiftSpan(span, first), recurrence, exceptions });
            }
            continue;
        }

        // A rule OpenFamily cannot store: one event per occurrence in the window.
        const it = event.iterator();
        for (let i = 0, next = it.next(); next && i < 5000; i++, next = it.next()) {
            const details = event.getOccurrenceDetails(next);
            const item = details.item.component;
            const occurrenceSpan = spanOf(details.startDate, details.endDate ?? null, zone,
                tzidOf(item, 'dtstart') ?? startTzid, tzidOf(item, 'dtend') ?? endTzid);
            if (occurrenceSpan.start > windowEndNaive) break;
            if (endsBeforeWindow(occurrenceSpan) || isCancelled(item)) continue;
            push({ uid: `${uid}@@${toLocalNaive(details.recurrenceId, zone, startTzid)}`, ...describe(item), ...occurrenceSpan, recurrence: null, exceptions: [] });
            if (truncated) break;
        }
    }

    const name = roots.map((r) => text(r, 'x-wr-calname', 100)).find(Boolean) ?? null;
    if (events.length === 0 && groups.size === 0) throw new IcsError('EMPTY');
    return { name, events, truncated };
}
