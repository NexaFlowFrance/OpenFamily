// =============================================================================
// date-fns locale bridge
//
// date-fns formatting (format/formatDistance/…) needs a `locale` option to
// translate month/day names. This module maps the active i18n language to the
// matching date-fns locale so dates follow the UI language.
//
//   - getDateFnsLocale(): for non-React call sites (uses the i18n singleton).
//   - useDateLocale():    React hook; re-renders the component when the user
//                         switches language, so dates update live.
// =============================================================================
import { fr, enUS, type Locale } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

const LOCALES: Record<string, Locale> = { fr, en: enUS };

function resolve(language: string | undefined): Locale {
    return LOCALES[(language ?? 'fr').split('-')[0]] ?? fr;
}

export function getDateFnsLocale(): Locale {
    return resolve(i18n.language);
}

export function useDateLocale(): Locale {
    const { i18n: instance } = useTranslation();
    return resolve(instance.language);
}
