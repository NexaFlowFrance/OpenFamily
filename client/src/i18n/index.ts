// =============================================================================
// i18n bootstrap
//
// KeurTonux is built FR-first but distributed as open source — the strings
// in components hardcoded in French migrate to translation keys so non-FR
// forks become possible without a fork-and-replace exercise.
//
// This module is imported once from main.tsx and self-initializes.
//
// Translation sources are split per feature (one JSON file per top-level key)
// to keep each file reviewable, then merged here into a single `common`
// namespace per language. Convention: each feature file owns exactly ONE
// top-level key (e.g. tasks.json -> { "tasks": {...} }), so a shallow spread
// merge never collides.
//
// Adding a new language: drop a sibling set of JSON files under
// ./locales/<code>/, mirror the imports below, and list the code in
// SUPPORTED_LANGUAGES.
// =============================================================================
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import frCommon from './locales/fr/common.json';
import frVacations from './locales/fr/vacations.json';
import frSettings from './locales/fr/settings.json';
import frLogin from './locales/fr/login.json';
import frDashboard from './locales/fr/dashboard.json';
import frTasks from './locales/fr/tasks.json';
import frShopping from './locales/fr/shopping.json';
import frCalendar from './locales/fr/calendar.json';
import frPlanning from './locales/fr/planning.json';
import frRecipes from './locales/fr/recipes.json';
import frMeals from './locales/fr/meals.json';
import frBudget from './locales/fr/budget.json';
import frFamily from './locales/fr/family.json';
import frHouse from './locales/fr/house.json';
import frDialogs from './locales/fr/dialogs.json';
import frDomain from './locales/fr/domain.json';

import enCommon from './locales/en/common.json';
import enVacations from './locales/en/vacations.json';
import enSettings from './locales/en/settings.json';
import enLogin from './locales/en/login.json';
import enDashboard from './locales/en/dashboard.json';
import enTasks from './locales/en/tasks.json';
import enShopping from './locales/en/shopping.json';
import enCalendar from './locales/en/calendar.json';
import enPlanning from './locales/en/planning.json';
import enRecipes from './locales/en/recipes.json';
import enMeals from './locales/en/meals.json';
import enBudget from './locales/en/budget.json';
import enFamily from './locales/en/family.json';
import enHouse from './locales/en/house.json';
import enDialogs from './locales/en/dialogs.json';
import enDomain from './locales/en/domain.json';

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const fr = {
    ...frCommon,
    ...frVacations,
    ...frSettings,
    ...frLogin,
    ...frDashboard,
    ...frTasks,
    ...frShopping,
    ...frCalendar,
    ...frPlanning,
    ...frRecipes,
    ...frMeals,
    ...frBudget,
    ...frFamily,
    ...frHouse,
    ...frDialogs,
    ...frDomain,
};

const en = {
    ...enCommon,
    ...enVacations,
    ...enSettings,
    ...enLogin,
    ...enDashboard,
    ...enTasks,
    ...enShopping,
    ...enCalendar,
    ...enPlanning,
    ...enRecipes,
    ...enMeals,
    ...enBudget,
    ...enFamily,
    ...enHouse,
    ...enDialogs,
    ...enDomain,
};

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            fr: { common: fr },
            en: { common: en },
        },
        fallbackLng: 'fr',
        defaultNS: 'common',
        supportedLngs: SUPPORTED_LANGUAGES,
        nonExplicitSupportedLngs: true, // map 'fr-FR' -> 'fr', 'en-US' -> 'en'
        interpolation: {
            // React already escapes; double-escaping breaks accented strings.
            escapeValue: false,
        },
        detection: {
            // Persist user choice in localStorage so navigation across reloads
            // keeps the same language.
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'openfamily.language',
            caches: ['localStorage'],
        },
        // FR has all keys; missing keys in other languages fall back silently.
        returnNull: false,
    });

export default i18n;
