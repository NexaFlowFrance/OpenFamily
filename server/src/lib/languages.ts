/** The languages the server writes in: e-mails, notifications, reminders, display pages. */
export const LANGUAGES = ['fr', 'en', 'pt', 'ru', 'es', 'ca', 'zh', 'de'] as const;

export type Language = typeof LANGUAGES[number];

export const isLanguage = (value: unknown): value is Language =>
    typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/**
 * A language code as the interface names its languages ("it", "nl"). The
 * interface is translated by the community one language at a time, ahead of
 * the server's own texts: such a language is kept as the person's choice all
 * the same, so that the interface opens in it on every device.
 */
export const isLanguageCode = (value: unknown): value is string =>
    typeof value === 'string' && /^[a-z]{2,3}$/.test(value);

/**
 * The language the server writes in for someone whose language is `value`:
 * theirs when the server has its texts, English when only the interface has
 * it (what the interface itself shows for a string not translated yet), and
 * French when nothing usable is stored, as for accounts older than the setting.
 */
export const writingLanguage = (value: unknown): Language => {
    const primary = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(primary)) return primary;
    return isLanguageCode(primary) ? 'en' : 'fr';
};
