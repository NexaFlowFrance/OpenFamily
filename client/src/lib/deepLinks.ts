// Native deep links (Android App Links).
//
// Tapping https://<app-domain>/join?invite=... or /reset-password?token=... on a
// phone that has the app installed opens the app here instead of the browser.
// The native shell uses HashRouter, so an incoming https URL has to be rewritten
// to the in-app hash route.
//
// No-op on the web (guarded by isNative()), where these URLs are already the
// app's own routes.
import { App as CapacitorApp } from '@capacitor/app';
import { isNative } from './serverConfig';

/** Routes we accept from an external link, with the query param each carries. */
const HANDLED_ROUTES: Record<string, string> = {
    '/join': 'invite',
    '/reset-password': 'token',
};

/**
 * Translate an incoming external URL into the app's hash route.
 * Returns null when the URL is not one we handle.
 */
export const toInAppRoute = (url: string): string | null => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    // Capacitor also reports the app's own custom-scheme URLs; those already
    // carry a hash route, so hand it back unchanged.
    if (parsed.hash.startsWith('#/')) {
        return parsed.hash.slice(1);
    }

    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    const param = HANDLED_ROUTES[path];
    if (!param) {
        return null;
    }

    const value = parsed.searchParams.get(param);
    return value ? `${path}?${param}=${encodeURIComponent(value)}` : path;
};

/**
 * Start listening for deep links. Also handles the URL that launched the app
 * from cold start. Safe to call once at boot; no-op on the web.
 */
export const initDeepLinks = async (): Promise<void> => {
    if (!isNative()) return;

    const navigate = (url: string) => {
        const route = toInAppRoute(url);
        if (route) {
            window.location.hash = `#${route}`;
        }
    };

    try {
        await CapacitorApp.addListener('appUrlOpen', (event) => navigate(event.url));
    } catch {
        /* Plugin unavailable: the app still works, only deep links are inert. */
    }

    try {
        const launch = await CapacitorApp.getLaunchUrl();
        if (launch?.url) navigate(launch.url);
    } catch {
        /* ignore */
    }
};
