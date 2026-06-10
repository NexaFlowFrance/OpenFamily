// Keeps the UI language and the server-stored account language in sync.
//
// Precedence rule:
//   1. An EXPLICIT local choice (the user clicked the language switcher on this
//      device) always wins. It is pushed to the server whenever the account
//      value diverges.
//   2. Otherwise (fresh device / browser-detector only), the server value is
//      applied on login/session load.
//
// The i18next detector caches even auto-detected languages in localStorage
// ('i18nextLng'), so we keep our own marker that is only written on explicit
// user action.
import i18n from '../i18n';
import { api } from './api';

const IS_DEMO = Boolean(import.meta.env.VITE_DEMO);
const EXPLICIT_LANGUAGE_KEY = 'i18nextLngExplicit';

const getExplicitChoice = (): string | null => {
    try {
        return localStorage.getItem(EXPLICIT_LANGUAGE_KEY);
    } catch {
        return null;
    }
};

const isAuthenticated = () => IS_DEMO || api.getToken() !== null;

/**
 * Persist the language on the server. Silently skipped when unauthenticated
 * (e.g. on the login page). Returns false when the server call failed so the
 * caller can show an error toast.
 */
export async function syncLanguageToServer(language: string): Promise<boolean> {
    if (!isAuthenticated()) return true;
    try {
        await api.put('/api/auth/language', { language });
        return true;
    } catch {
        return false;
    }
}

/**
 * Explicit user action: switch the UI language, remember the choice on this
 * device and sync it to the server (fire-and-forget for the caller).
 */
export async function changeAppLanguage(language: string): Promise<boolean> {
    try {
        localStorage.setItem(EXPLICIT_LANGUAGE_KEY, language);
    } catch {
        // localStorage unavailable: still switch the language for this session.
    }
    await i18n.changeLanguage(language);
    return syncLanguageToServer(language);
}

/**
 * Reconcile the account language on login/session load (call once per load).
 * Applies the precedence rule documented at the top of this file.
 */
export function applyServerLanguage(serverLanguage?: string | null): void {
    const explicit = getExplicitChoice();
    if (explicit) {
        // Local explicit choice wins; converge the server to it if it diverged
        // (e.g. the language was changed on another device or before login).
        if (serverLanguage && serverLanguage !== explicit) void syncLanguageToServer(explicit);
        return;
    }
    if (!serverLanguage) return;
    const current = (i18n.resolvedLanguage || i18n.language || '').split('-')[0];
    if (serverLanguage !== current) void i18n.changeLanguage(serverLanguage);
}
