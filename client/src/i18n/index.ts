import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { CONFIGURED_LANGUAGE_ORDER } from './languages';

// Auto-import every locale file: ./locales/<lng>/<namespace>.json
// Dropping a new JSON file in that folder is enough — no manual wiring needed.
const modules = import.meta.glob('./locales/*/*.json', { eager: true });

type NamespaceBundle = Record<string, unknown>;
const resources: Record<string, Record<string, NamespaceBundle>> = {};

for (const filePath in modules) {
    const match = filePath.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;
    const [, lng, ns] = match;
    const mod = modules[filePath] as { default: NamespaceBundle };
    if (!resources[lng]) resources[lng] = {};
    resources[lng][ns] = mod.default;
}

// Languages are discovered from the locale folders themselves: to add a new
// language, just drop a `locales/<lng>/` folder of JSON files — it appears in
// the switcher automatically. Configured languages are listed first in config
// order, followed by unconfigured locale folders A→Z.
const discovered = Object.keys(resources);
export const SUPPORTED_LANGUAGES: string[] = [
    ...CONFIGURED_LANGUAGE_ORDER.filter((l) => discovered.includes(l)),
    ...discovered.filter((l) => !CONFIGURED_LANGUAGE_ORDER.includes(l)).sort(),
];

const namespaces = Array.from(
    new Set(Object.values(resources).flatMap((r) => Object.keys(r)))
);

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        supportedLngs: SUPPORTED_LANGUAGES.length ? SUPPORTED_LANGUAGES : ['en'],
        // English is the default for any browser that is not French.
        fallbackLng: 'en',
        load: 'languageOnly',
        nonExplicitSupportedLngs: true,
        ns: namespaces.length ? namespaces : ['common'],
        defaultNS: 'common',
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'i18nextLng',
            caches: ['localStorage'],
        },
        interpolation: { escapeValue: false },
        returnNull: false,
        saveMissing: import.meta.env.DEV,
        missingKeyHandler: (_lngs: readonly string[], ns: string, key: string) => {
            if (import.meta.env.DEV) {
                console.warn(`[i18n] missing key: ${ns}:${key}`);
            }
        },
    });

export default i18n;
