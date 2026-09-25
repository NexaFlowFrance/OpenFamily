export interface LanguageConfig {
    label: string;
}

// UI metadata and optional locale defaults for configured languages. Locale
// folders remain the source of truth for availability; an unconfigured folder
// still appears in the switcher with its language code as the label.
export const LANGUAGE_CONFIG: Record<string, LanguageConfig> = {
    fr: {
        label: 'FR',
    },
    en: {
        label: 'EN',
    },
    pt: {
        label: 'PT-BR',
    },
    ru: {
        label: 'RU',
    },
    zh: {
        label: '中文',
    },
};

export const CONFIGURED_LANGUAGE_ORDER = Object.keys(LANGUAGE_CONFIG);
