import { query } from '../db';
import { createLocalizedNotification, LocalizedTexts } from './notifications';
import { Language, LANGUAGES, writingLanguage } from './languages';
import logger from './logger';
import { dayInZone, familyTimeZone, naiveInZone } from './timeZone';

// Birthdays come from the dates of birth on the Family page. Nobody types them
// a second time: they are worked out each time the calendar is read, and shown
// by everything that shows the calendar (the app, the kiosk, a display link,
// the calendar feed, the API). On the day, the family is told in the morning.

/** "Léa's birthday", in the languages the server writes in. */
export const BIRTHDAY_TITLE: Record<Language, (name: string) => string> = {
    fr: (name) => `Anniversaire de ${name}`,
    en: (name) => `${name}'s birthday`,
    pt: (name) => `Aniversário de ${name}`,
    ru: (name) => `День рождения: ${name}`,
    es: (name) => `Cumpleaños de ${name}`,
    ca: (name) => `Aniversari: ${name}`,
    zh: (name) => `${name}的生日`,
    de: (name) => `Geburtstag von ${name}`,
    ja: (name) => `${name}の誕生日`,
};

/** What the notification of the day says under its title. */
const BIRTHDAY_TODAY: Record<Language, string> = {
    fr: "C'est aujourd'hui !",
    en: 'It is today!',
    pt: 'É hoje!',
    ru: 'Сегодня!',
    es: '¡Es hoy!',
    ca: 'És avui!',
    zh: '就是今天！',
    de: 'Heute ist es so weit!',
    ja: '今日です！',
};

/** The hours of the day, on the family's clocks, between which the family is told. */
export const BIRTHDAY_NOTICE_FROM_HOUR = 8;
export const BIRTHDAY_NOTICE_UNTIL_HOUR = 20;

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The day a birthday falls on in a given year. Someone born on 29 February is celebrated on the 28th in the years without one. */
export const birthdayIn = (birthDate: string, year: number): string => {
    const monthDay = birthDate.slice(5, 10);
    return `${String(year).padStart(4, '0')}-${monthDay === '02-29' && !isLeapYear(year) ? '02-28' : monthDay}`;
};

export interface Birthday {
    memberId: string;
    name: string;
    color: string;
    /** The day of the birthday, YYYY-MM-DD. */
    date: string;
    /** The age reached that day. */
    age: number;
    birthDate: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}/;
// A range is a few weeks, a year, or the three years of the calendar feed.
const MAX_YEARS = 10;

/** The family's birthdays between two days, both included, in the order they come. */
export const birthdaysBetween = async (userId: string, from: string, to: string): Promise<Birthday[]> => {
    if (!DAY.test(from) || !DAY.test(to)) return [];
    const fromDay = from.slice(0, 10);
    const toDay = to.slice(0, 10);
    const firstYear = Number(fromDay.slice(0, 4));
    const lastYear = Math.min(Number(toDay.slice(0, 4)), firstYear + MAX_YEARS);

    const { rows } = await query(
        `SELECT id, name, color, birth_date FROM family_members
         WHERE user_id = $1 AND birth_date IS NOT NULL`,
        [userId],
    );

    const birthdays: Birthday[] = [];
    for (const member of rows as Array<{ id: string; name: string; color: string; birth_date: string }>) {
        const birthDate = String(member.birth_date).slice(0, 10);
        const birthYear = Number(birthDate.slice(0, 4));
        // The day of birth itself is not a birthday: the first one is a year later.
        for (let year = Math.max(firstYear, birthYear + 1); year <= lastYear; year += 1) {
            const date = birthdayIn(birthDate, year);
            if (date < fromDay || date > toDay) continue;
            birthdays.push({ memberId: member.id, name: member.name, color: member.color, date, age: year - birthYear, birthDate });
        }
    }
    return birthdays.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
};

/** The id of a birthday in the list of appointments. Not a UUID: nothing is stored under it. */
export const BIRTHDAY_ID_PREFIX = 'birthday-';
export const isBirthdayId = (id: unknown): boolean => typeof id === 'string' && id.startsWith(BIRTHDAY_ID_PREFIX);

/**
 * The same birthdays, shaped like all-day appointments. Their title is in the
 * language of the family's owner, like the appointments a parent types, and
 * `kind` and `birthday` let a program tell them apart and write its own words.
 */
export const birthdayAppointments = async (userId: string, from: string, to: string): Promise<any[]> => {
    const birthdays = await birthdaysBetween(userId, from, to);
    if (birthdays.length === 0) return [];
    const owner = await query('SELECT language FROM users WHERE id = $1', [userId]);
    const title = BIRTHDAY_TITLE[writingLanguage(owner.rows[0]?.language)];

    return birthdays.map((birthday) => ({
        id: `${BIRTHDAY_ID_PREFIX}${birthday.memberId}`,
        occurrence_id: `${BIRTHDAY_ID_PREFIX}${birthday.memberId}-${birthday.date.slice(0, 4)}`,
        occurrence_date: birthday.date,
        kind: 'birthday',
        user_id: userId,
        title: title(birthday.name),
        description: null,
        start_time: `${birthday.date}T00:00:00`,
        end_time: `${birthday.date}T23:59:00`,
        location: null,
        notes: null,
        is_all_day: true,
        color: birthday.color,
        family_member_ids: [birthday.memberId],
        reminder_minutes: [],
        recurrence_frequency: 'none',
        recurrence_interval: 1,
        recurrence_until: null,
        subscription_id: null,
        birthday: { member_id: birthday.memberId, name: birthday.name, age: birthday.age, birth_date: birthday.birthDate },
    }));
};

const titlesFor = (name: string): LocalizedTexts => Object.fromEntries(
    LANGUAGES.map((language) => [language, { title: BIRTHDAY_TITLE[language](name), message: BIRTHDAY_TODAY[language] }]),
) as LocalizedTexts;

/**
 * One pass of the birthday notices: every account of a family is told, once,
 * on the morning of a member's birthday, by the family's clocks. Exported for
 * the tests; the reminder scheduler calls it.
 */
export async function checkBirthdays(now: Date = new Date()): Promise<void> {
    try {
        // Whatever the zone, "today" is one of these three days.
        const around = [-1, 0, 1].map((offset) => new Date(now.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(5, 10));
        // 28 February stands for the 29th three years out of four.
        const monthDays = around.includes('02-28') ? [...around, '02-29'] : around;
        const { rows } = await query(
            `SELECT id, user_id, name, birth_date FROM family_members
             WHERE birth_date IS NOT NULL AND to_char(birth_date, 'MM-DD') = ANY($1::text[])`,
            [monthDays],
        );

        for (const member of rows as Array<{ id: string; user_id: string; name: string; birth_date: string }>) {
            const zone = await familyTimeZone(member.user_id);
            const today = dayInZone(now, zone);
            const year = Number(today.slice(0, 4));
            const birthDate = String(member.birth_date).slice(0, 10);
            if (year <= Number(birthDate.slice(0, 4)) || birthdayIn(birthDate, year) !== today) continue;

            const hour = Number(naiveInZone(now, zone).slice(11, 13));
            if (hour < BIRTHDAY_NOTICE_FROM_HOUR || hour >= BIRTHDAY_NOTICE_UNTIL_HOUR) continue;

            // Claimed before anyone is told, so that two passes cannot both tell.
            const claimed = await query(
                `INSERT INTO birthday_notice_log (family_member_id, year) VALUES ($1, $2)
                 ON CONFLICT DO NOTHING RETURNING 1`,
                [member.id, year],
            );
            if (claimed.rows.length === 0) continue;

            const accounts = await query('SELECT id FROM users WHERE id = $1 OR family_owner_id = $1', [member.user_id]);
            for (const account of accounts.rows as Array<{ id: string }>) {
                await createLocalizedNotification({
                    userId: account.id,
                    type: 'birthday',
                    relatedId: member.id,
                    url: '/calendar',
                    texts: titlesFor(member.name),
                });
            }
            logger.info('birthday.notice_sent', { familyMemberId: member.id, accounts: accounts.rows.length });
        }
    } catch (err) {
        logger.error('birthday.notice_error', { error: err instanceof Error ? err.message : String(err) });
    }
}
