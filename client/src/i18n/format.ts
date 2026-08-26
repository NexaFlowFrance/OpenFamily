import type { Locale } from 'date-fns';
import { enUS, fr, es, de, it, ptBR, nl, zhCN } from 'date-fns/locale';
import i18n from './index';

// date-fns locales for the languages we may ship. Adding a new app language
// only needs an extra entry here (falls back to English otherwise).
const DATE_LOCALES: Record<string, Locale> = { en: enUS, fr, es, de, it, pt: ptBR, nl, zh: zhCN };
// BCP-47 tags for Intl.* — falls back to the bare language code.
const INTL_TAGS: Record<string, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR', zh: 'zh-CN' };

const lang = () => (i18n.language || 'en').split('-')[0];

/** date-fns locale matching the active UI language. */
export function dateLocale(): Locale {
    return DATE_LOCALES[lang()] || enUS;
}

/** BCP-47 tag matching the active UI language, for Intl.* APIs. */
export function intlLocale(): string {
    const l = lang();
    return INTL_TAGS[l] || l;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(intlLocale(), options).format(value);
}
