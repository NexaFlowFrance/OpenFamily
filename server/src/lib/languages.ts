/** The languages of the interface, e-mails, notifications and reminders. French is the default. */
export const LANGUAGES = ['fr', 'en', 'pt', 'ru', 'es', 'zh', 'de'] as const;

export type Language = typeof LANGUAGES[number];

export const isLanguage = (value: unknown): value is Language =>
    typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
