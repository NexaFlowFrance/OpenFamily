export interface LanguageConfig {
    label: string;
    currencyDefault?: {
        replace: readonly string[];
        with: string;
        replaceMissing?: boolean;
    };
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
        currencyDefault: {
            replace: ['EUR', 'USD'],
            with: 'BRL',
            replaceMissing: true,
        },
    },
    zh: {
        label: '中文',
        currencyDefault: {
            replace: ['EUR'],
            with: 'CNY',
            replaceMissing: true,
        },
    },
};

export const CONFIGURED_LANGUAGE_ORDER = Object.keys(LANGUAGE_CONFIG);
