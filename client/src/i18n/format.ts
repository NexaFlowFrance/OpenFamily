import type { Day, Locale } from 'date-fns';
import { enUS, fr, es, de, it, ptBR, nl, ru, zhCN } from 'date-fns/locale';
import i18n from './index';

// date-fns locales for the languages we may ship. Adding a new app language
// only needs an extra entry here (falls back to English otherwise).
const DATE_LOCALES: Record<string, Locale> = { en: enUS, fr, es, de, it, pt: ptBR, nl, ru, zh: zhCN };
// BCP-47 tags for Intl.* — falls back to the bare language code.
const INTL_TAGS: Record<string, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR', ru: 'ru-RU', zh: 'zh-CN', es: 'es-ES' };

const lang = () => (i18n.language || 'en').split('-')[0];

/** date-fns locale matching the active UI language. */
export function dateLocale(): Locale {
    return DATE_LOCALES[lang()] || enUS;
}

let accountWeekStartDay: number | null = null;

/**
 * Keep the member's week-start choice available to date helpers without
 * coupling every call site to AuthContext. ISO numbering, null = automatic.
 */
export function applyRegionalPreferences(weekStartDay?: number | null): void {
    accountWeekStartDay = Number.isInteger(weekStartDay) && Number(weekStartDay) >= 1 && Number(weekStartDay) <= 7
        ? Number(weekStartDay)
        : null;
}

/**
 * BCP-47 tag for Intl.*: the browser's own regional variant when it matches the
 * active UI language (en-GB rather than en-US, fr-CA rather than fr-FR), the
 * language default otherwise.
 */
export function intlLocale(): string {
    const active = lang();
    if (typeof navigator !== 'undefined') {
        const detected = (navigator.languages || [navigator.language]).find(
            (candidate) => candidate?.split('-')[0].toLowerCase() === active.toLowerCase()
        );
        if (detected) return detected;
    }
    return INTL_TAGS[active] || active;
}

const isoToDateFns = (isoDay: number): Day => (isoDay === 7 ? 0 : isoDay) as Day;
const dateFnsToIso = (day: Day): number => (day === 0 ? 7 : day);

/**
 * First visible day of the week (date-fns numbering, Sunday = 0). The member's
 * explicit choice wins; automatic follows the regional week data the browser
 * knows (Monday in France, Sunday in the US), then the date-fns locale.
 */
export function weekStartsOn(): Day {
    if (accountWeekStartDay !== null) return isoToDateFns(accountWeekStartDay);
    try {
        const LocaleCtor = (Intl as unknown as {
            Locale?: new (tag: string) => { getWeekInfo?: () => { firstDay?: number }; weekInfo?: { firstDay?: number } };
        }).Locale;
        if (LocaleCtor) {
            const locale = new LocaleCtor(intlLocale());
            const firstDay = Number((locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay);
            if (Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7) return isoToDateFns(firstDay);
        }
    } catch {
        // Fall through to the date-fns locale default.
    }
    return (dateLocale().options?.weekStartsOn ?? 1) as Day;
}

/** ISO weekday (Monday = 1 ... Sunday = 7) shown at a given offset of the visible week. */
export function isoWeekdayAtOffset(offset: number): number {
    return ((dateFnsToIso(weekStartsOn()) - 1 + offset) % 7) + 1;
}

/** Offset (0 ... 6) of an ISO weekday from the visible week start. */
export function offsetForIsoWeekday(isoDay: number): number {
    return (isoDay - dateFnsToIso(weekStartsOn()) + 7) % 7;
}

/** Reorder a Monday-first array (ISO order) to start on the visible first day. */
export function orderIsoWeekdays<T>(values: readonly T[]): T[] {
    const start = dateFnsToIso(weekStartsOn()) - 1;
    return [...values.slice(start), ...values.slice(0, start)];
}

/**
 * A clock time the way the member's region writes it: "14:30" in France,
 * "2:30 PM" in the US, "14.30" in Finland. Every screen goes through here,
 * so an appointment and a planning entry never show two different styles
 * side by side (issue #120). Accepts a Date, a naive local datetime string
 * ("2026-10-21T14:30:00") or a bare "HH:mm[:ss]" as the planning stores it.
 */
export function formatTime(value: Date | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    let date: Date;
    if (value instanceof Date) {
        date = value;
    } else if (/^\d{1,2}:\d{2}/.test(value)) {
        const [hours, minutes] = value.split(':').map(Number);
        date = new Date(2000, 0, 1, hours, minutes);
    } else {
        date = new Date(value);
    }
    if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 5) : '';
    return new Intl.DateTimeFormat(intlLocale(), { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Date and time together, in the member's language and region ("21 Oct 2026, 2:30 PM"). */
export function formatDateTime(value: Date | string, dateStyle: 'short' | 'medium' | 'long' = 'medium'): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
    return new Intl.DateTimeFormat(intlLocale(), { dateStyle, timeStyle: 'short' }).format(date);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(intlLocale(), options).format(value);
}
