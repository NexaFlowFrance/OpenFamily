import { isLanguage, Language } from './languages';
import { DISPLAY_STRINGS } from './displayStrings';
import type { DisplayAppointment, DisplayMember, DisplaySnapshot } from './displaySnapshot';

// The page behind a display link: the family's day as one complete HTML
// document, for a screen nobody can sign in on (an e-paper frame fed by a
// screenshot tool such as InkyPi, an e-reader's browser, a wall tablet).
//
// It is rendered here, not in the web app, and carries no script: screenshot
// tools capture a page as soon as it has loaded, before an app would have
// fetched anything, and an e-reader's browser cannot run the app at all.
//
// Sized for a screen of any resolution: type scales with the viewport, so the
// same number of lines fits a 7-inch 800x480 panel and a 13-inch 1600x1200 one.
// What does not fit is left out whole (see the wrapping columns in the CSS),
// never cut through the middle of a line. Black on white, no grey text: grey
// is dithered on e-paper.

export const DISPLAY_SECTIONS = ['schedule', 'meals', 'planning', 'tasks', 'shopping', 'notes'] as const;
export type DisplaySection = typeof DISPLAY_SECTIONS[number];

export interface DisplayOptions {
    language: Language;
    /** BCP 47 tag the dates and times are written in: "en-US" gives 3:00 PM, "fr-FR" 15:00. */
    locale: string;
    /** The blocks to show, in order. */
    sections: DisplaySection[];
    /** Seconds before the page reloads itself, for a browser left open on it. 0 = never. */
    refreshSeconds: number;
    /** Multiplies the size of everything: above 1 for a screen read from afar. */
    scale: number;
}

const DEFAULT_LOCALE: Record<Language, string> = {
    fr: 'fr-FR', en: 'en-GB', pt: 'pt-BR', ru: 'ru-RU', es: 'es-ES', zh: 'zh-CN', de: 'de-DE',
};

const DEFAULT_REFRESH_SECONDS = 300;
const MIN_REFRESH_SECONDS = 30;
const MAX_REFRESH_SECONDS = 86_400;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

const TODAY_LIMIT = 6;
const TOMORROW_LIMIT = 3;

const languageOf = (locale: string): Language | null => {
    const primary = locale.split('-')[0].toLowerCase();
    return isLanguage(primary) ? primary : null;
};

/**
 * The locale a link is created with (the browser's, sent by the app), kept only
 * if it is a real locale tag in one of the app's languages.
 */
export const normalizeDisplayLocale = (value: unknown, fallback: Language = 'en'): string => {
    if (typeof value === 'string' && value.length <= 35) {
        try {
            const [canonical] = Intl.getCanonicalLocales(value.trim());
            if (canonical && languageOf(canonical)) return canonical;
        } catch {
            // Not a locale tag.
        }
    }
    return DEFAULT_LOCALE[fallback];
};

const first = (value: unknown): string => {
    const single = Array.isArray(value) ? value[0] : value;
    return typeof single === 'string' ? single.trim() : '';
};

/** The link's own locale, adjusted by what the address asks for (?lang, ?show, ?refresh, ?scale). */
export const displayOptions = (params: Record<string, unknown>, storedLocale: string): DisplayOptions => {
    let locale = normalizeDisplayLocale(storedLocale);
    let language = languageOf(locale) ?? 'en';
    const lang = first(params.lang).toLowerCase();
    if (isLanguage(lang) && lang !== language) {
        language = lang;
        locale = DEFAULT_LOCALE[lang];
    }

    const asked = first(params.show).toLowerCase().split(',').map((name) => name.trim());
    const chosen = asked.filter((name, index): name is DisplaySection =>
        (DISPLAY_SECTIONS as readonly string[]).includes(name) && asked.indexOf(name) === index);

    const refresh = Number.parseInt(first(params.refresh), 10);
    const scale = Number.parseFloat(first(params.scale));

    return {
        language,
        locale,
        sections: chosen.length > 0 ? chosen : [...DISPLAY_SECTIONS],
        refreshSeconds: Number.isNaN(refresh)
            ? DEFAULT_REFRESH_SECONDS
            : refresh <= 0 ? 0 : Math.min(Math.max(refresh, MIN_REFRESH_SECONDS), MAX_REFRESH_SECONDS),
        scale: Number.isFinite(scale) ? Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE) : 1,
    };
};

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Everything the family typed goes through here before it reaches the page. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

// A member's colour goes into a style attribute: only a plain hex colour may.
const safeColor = (value: string): string => (/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000');

const CSS = `
*{box-sizing:border-box}
html{font-size:calc(3.1vh*var(--s))}
body{margin:0;background:#fff;color:#000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","DejaVu Sans",Arial,sans-serif;line-height:1.3}
.page{height:100vh;padding:1.1rem 1.5rem .7rem;display:flex;flex-direction:column;overflow:hidden}
header{flex:none;border-bottom:.16rem solid #000;padding-bottom:.45rem;margin-bottom:.8rem}
h1{margin:0;font-size:2.1rem;line-height:1.1;font-weight:800}
h1::first-letter{text-transform:uppercase}
h2{margin:0 0 .3rem;padding-bottom:.15rem;border-bottom:.07rem solid #000;font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;display:flex;justify-content:space-between}
.cols{flex:1;min-height:0;display:grid;grid-template-columns:1.35fr 1fr;column-gap:1.7rem}
.cols.single{grid-template-columns:1fr}
/* A column lays its blocks out top to bottom and wraps: a block that does not
   fit starts a second column, which lies outside the visible area. So a block
   is shown whole or not at all. The first one always stays. */
.col{min-width:0;height:100%;display:flex;flex-direction:column;flex-wrap:wrap;align-content:flex-start;column-gap:6rem;overflow:hidden}
.sec,.item{width:100%}
.sec{margin-bottom:.85rem}
.appt{display:grid;grid-template-columns:5.4rem minmax(0,1fr);column-gap:.7rem;padding:.38rem 0;border-bottom:.07rem solid #000}
.t{font-weight:800;font-size:1.05rem;font-variant-numeric:tabular-nums;white-space:nowrap}
.t.wide{font-size:.8rem;line-height:1.15;white-space:normal}
.n{font-weight:700;font-size:1.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m{margin-top:.1rem;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m>span+span{margin-left:.7rem}
.dot{display:inline-block;width:.62em;height:.62em;margin-right:.3em;border:.09em solid #000;border-radius:50%}
.more{padding:.3rem 0;font-size:.85rem;font-weight:700}
.tomorrow{margin-top:.75rem}
.tomorrow .appt{padding:.16rem 0;border-bottom:0}
.tomorrow .t{font-size:.95rem}
.tomorrow .n{font-size:1rem;font-weight:600}
.w{margin-left:.6em;font-size:.85em;font-weight:400}
.row{display:flex;align-items:baseline;gap:.6rem;padding:.12rem 0;font-size:.98rem}
.k{flex:none;font-weight:700}
.v{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.x{flex:none;max-width:45%;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.list{margin:0;max-height:4.05em;font-size:.98rem;line-height:1.35;overflow:hidden}
.note{margin:0 0 .3rem;font-size:.95rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.empty{margin:0;font-size:.95rem}
footer{flex:none;margin-top:.3rem;display:flex;justify-content:space-between;font-size:.68rem}
/* Upright screen: one column, every block in the same wrapping flow. */
@media (max-aspect-ratio:1/1){
html{font-size:calc(3.4vw*var(--s))}
.cols,.cols.single{display:flex;flex-direction:column;flex-wrap:wrap;align-content:flex-start;column-gap:6rem;overflow:hidden}
.col{display:contents}
.col+.col>:first-child{margin-top:.85rem}
}
`.trim();

export const renderDisplayPage = (snapshot: DisplaySnapshot, options: DisplayOptions): string => {
    const strings = DISPLAY_STRINGS[options.language];
    const timeFormat = new Intl.DateTimeFormat(options.locale, { hour: 'numeric', minute: '2-digit' });
    const dateFormat = new Intl.DateTimeFormat(options.locale, { weekday: 'long', day: 'numeric', month: 'long' });

    const clock = (value: Date): string => timeFormat.format(value);
    // A local "YYYY-MM-DDTHH:mm:ss", or a planning time "HH:mm:ss".
    const time = (value: string): string => {
        const parsed = /^\d{1,2}:\d{2}/.test(value)
            ? new Date(2000, 0, 1, Number(value.split(':')[0]), Number(value.split(':')[1]))
            : new Date(value);
        return Number.isNaN(parsed.getTime()) ? value.slice(0, 5) : clock(parsed);
    };

    const who = (member: DisplayMember): string =>
        `<span><span class="dot" style="background:${safeColor(member.color)}"></span>${escapeHtml(member.name)}</span>`;

    // `compact` is tomorrow's form: one line, the title then who it is for.
    const appointment = (item: DisplayAppointment, day: string, compact = false): string => {
        const beganEarlier = item.start.slice(0, 10) < day;
        const endsLater = item.end ? item.end.slice(0, 10) > day : false;
        let label = time(item.start);
        let wide = false;
        if (item.allDay || (beganEarlier && (endsLater || !item.end))) {
            label = strings.allDay;
            wide = true;
        } else if (beganEarlier && item.end) {
            label = strings.until.replace('{time}', time(item.end));
            wide = true;
        }
        const when = `<div class="t${wide ? ' wide' : ''}">${escapeHtml(label)}</div>`;
        if (compact) {
            const names = item.members.map((member) => member.name).join(', ');
            return `<div class="appt">${when}<div class="n">${escapeHtml(item.title)}`
                + `${names ? `<span class="w">${escapeHtml(names)}</span>` : ''}</div></div>`;
        }
        const details = [
            item.location ? `<span>${escapeHtml(item.location)}</span>` : '',
            ...item.members.map(who),
        ].filter(Boolean).join('');
        return `<div class="item appt">${when}`
            + `<div><div class="n">${escapeHtml(item.title)}</div>${details ? `<div class="m">${details}</div>` : ''}</div></div>`;
    };

    // Shows `limit` rows, or one fewer and a "+N more" line when there are more.
    const capped = (items: DisplayAppointment[], limit: number, day: string, compact = false): string[] => {
        if (items.length <= limit) return items.map((item) => appointment(item, day, compact));
        const shown = items.slice(0, limit - 1).map((item) => appointment(item, day, compact));
        return [...shown, `<div class="item more">${escapeHtml(strings.more.replace('{n}', String(items.length - shown.length)))}</div>`];
    };

    const heading = (title: string, count?: number): string =>
        `<h2><span>${escapeHtml(title)}</span>${count ? `<span>${count}</span>` : ''}</h2>`;
    const section = (title: string, body: string, count?: number): string =>
        `<section class="sec">${heading(title, count)}${body}</section>`;
    const empty = (message: string): string => `<p class="empty">${escapeHtml(message)}</p>`;

    const schedule = (): string => {
        const today = capped(snapshot.appointmentsToday, TODAY_LIMIT, snapshot.today);
        // The heading stays with the first appointment: it is never left alone at the foot of the column.
        const head = `<div class="item">${heading(strings.today)}${today[0] ?? empty(strings.emptySchedule)}</div>`;
        const tomorrow = snapshot.appointmentsTomorrow.length > 0
            ? `<div class="item tomorrow">${heading(strings.tomorrow)}${capped(snapshot.appointmentsTomorrow, TOMORROW_LIMIT, snapshot.tomorrow, true).join('')}</div>`
            : '';
        return `<div class="col">${head}${today.slice(1).join('')}${tomorrow}</div>`;
    };

    const side: Record<Exclude<DisplaySection, 'schedule'>, () => string> = {
        meals: () => !snapshot.modules.meals ? '' : section(strings.meals, snapshot.meals.length === 0
            ? empty(strings.emptyMeals)
            : snapshot.meals.map((meal) =>
                `<div class="row"><span class="k">${escapeHtml(strings.mealTypes[meal.type] ?? meal.type)}</span>`
                + `<span class="v">${escapeHtml(meal.name)}</span></div>`).join('')),
        planning: () => !snapshot.modules.planning ? '' : section(strings.planning, snapshot.planning.length === 0
            ? empty(strings.emptyPlanning)
            : snapshot.planning.map((entry) =>
                `<div class="row"><span class="k">${entry.members.map(who).join(' ')}</span>`
                + `<span class="v">${escapeHtml(entry.title)}</span>`
                + `<span class="x">${escapeHtml(`${time(entry.start)}–${time(entry.end)}`)}</span></div>`).join('')),
        tasks: () => section(strings.tasks, snapshot.tasks.length === 0
            ? empty(strings.emptyTasks)
            : snapshot.tasks.map((task) =>
                `<div class="row"><span class="v">${escapeHtml(task.title)}</span>`
                + `${task.assignees.length > 0 ? `<span class="x">${escapeHtml(task.assignees.join(', '))}</span>` : ''}</div>`).join(''),
        snapshot.tasksTotal),
        shopping: () => section(strings.shopping, snapshot.shopping.length === 0
            ? empty(strings.emptyShopping)
            : `<p class="list">${snapshot.shopping.map((item) =>
                escapeHtml(item.quantity ? `${item.name} (${item.quantity})` : item.name)).join(' · ')}</p>`,
        snapshot.shoppingTotal),
        // Nothing to say when there is no note: the block is simply absent.
        notes: () => !snapshot.modules.notes || snapshot.notes.length === 0 ? '' : section(strings.notes,
            snapshot.notes.map((note) =>
                `<p class="note"><b>${escapeHtml(note.author)}</b> ${escapeHtml(note.content)}</p>`).join('')),
    };

    const main = options.sections.includes('schedule') ? schedule() : '';
    const others = options.sections
        .filter((name): name is Exclude<DisplaySection, 'schedule'> => name !== 'schedule')
        .map((name) => side[name]())
        .join('');
    const columns = [main, others ? `<div class="col">${others}</div>` : ''].filter(Boolean);

    return '<!doctype html>\n'
        + `<html lang="${options.language}" style="--s:${options.scale}">\n<head>\n`
        + '<meta charset="utf-8">\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + '<meta name="robots" content="noindex, nofollow">\n'
        + '<meta name="referrer" content="no-referrer">\n'
        + (options.refreshSeconds > 0 ? `<meta http-equiv="refresh" content="${options.refreshSeconds}">\n` : '')
        + '<title>OpenFamily</title>\n'
        + `<style>${CSS}</style>\n</head>\n<body>\n<div class="page">\n`
        + `<header><h1>${escapeHtml(dateFormat.format(snapshot.generatedAt))}</h1></header>\n`
        + `<main class="cols${columns.length < 2 ? ' single' : ''}">${columns.join('\n')}</main>\n`
        + `<footer><span>OpenFamily</span><span>${escapeHtml(strings.updated.replace('{time}', clock(snapshot.generatedAt)))}</span></footer>\n`
        + '</div>\n</body>\n</html>\n';
};

/** The answer for an unknown or revoked link: says nothing about why. */
export const renderDisplayNotFound = (): string => '<!doctype html>\n'
    + '<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">\n'
    + '<title>OpenFamily</title>\n</head>\n'
    + '<body style="margin:2rem;font-family:system-ui,sans-serif;background:#fff;color:#000">\n'
    + '<p>This display link does not exist or has been revoked.</p>\n</body>\n</html>\n';
