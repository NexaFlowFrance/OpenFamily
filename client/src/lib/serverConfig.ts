// Runtime server configuration.
//
// On the web the app is served BY its own server, so the API/WebSocket origin is
// same-origin (empty base) — nothing to configure. In the native (Capacitor) app
// there is no server origin: the user points the app at THEIR self-hosted server,
// so the base URL is configured at runtime and persisted on the device.
//
// Everything here is a no-op on the web (guarded by `isNative()`), so the PWA and
// the static demo are completely unaffected.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const KEY = 'openfamily.serverUrl';

export const isNative = (): boolean => {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
};

const stripTrailingSlash = (u: string) => u.trim().replace(/\/+$/, '');

// Synchronously-cached value so the API client and WebSocket can stay sync.
let cachedServerUrl = '';

/** Load the saved server URL once, before the app renders. No-op on the web. */
export async function initServerConfig(): Promise<void> {
    if (!isNative()) return;
    try {
        const { value } = await Preferences.get({ key: KEY });
        if (value) {
            cachedServerUrl = stripTrailingSlash(value);
            return;
        }
    } catch {
        /* Preferences unavailable — fall back to localStorage below */
    }
    try {
        cachedServerUrl = stripTrailingSlash(localStorage.getItem(KEY) || '');
    } catch {
        cachedServerUrl = '';
    }
}

export function getServerUrl(): string {
    return cachedServerUrl;
}

export async function setServerUrl(url: string): Promise<void> {
    const clean = stripTrailingSlash(url);
    cachedServerUrl = clean;
    try { await Preferences.set({ key: KEY, value: clean }); } catch { /* ignore */ }
    try { localStorage.setItem(KEY, clean); } catch { /* ignore */ }
}

export async function clearServerUrl(): Promise<void> {
    cachedServerUrl = '';
    try { await Preferences.remove({ key: KEY }); } catch { /* ignore */ }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** True on the web always; on native only once a server URL has been saved. */
export function isServerConfigured(): boolean {
    return !isNative() || cachedServerUrl.length > 0;
}

// ─── API / WebSocket base resolution ─────────────────────────────────────────

const rawApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const WEB_API_BASE = rawApiUrl !== undefined
    ? rawApiUrl
    : (import.meta.env.PROD ? '' : 'http://localhost:3001');

const rawWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
const WEB_WS_BASE = rawWsUrl !== undefined
    ? rawWsUrl
    : (import.meta.env.PROD ? '' : 'ws://localhost:3001');

/** Base URL for HTTP API calls. Native → configured server; web → same-origin. */
export function apiBase(): string {
    return isNative() ? cachedServerUrl : WEB_API_BASE;
}

/** Base URL for the WebSocket. Native → derived from the server URL. */
export function wsBase(): string {
    if (isNative() && cachedServerUrl) {
        return cachedServerUrl.replace(/^http/i, 'ws'); // http→ws, https→wss
    }
    if (WEB_WS_BASE) return WEB_WS_BASE;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
}

/** Reachability + identity check used by the connect screen (hits /health). */
export async function pingServer(url: string): Promise<boolean> {
    const clean = stripTrailingSlash(url);
    if (!/^https?:\/\//i.test(clean)) return false;
    try {
        const res = await fetch(`${clean}/health`, { method: 'GET' });
        if (!res.ok) return false;
        const data = await res.json().catch(() => null);
        return Boolean(data && data.status === 'ok');
    } catch {
        return false;
    }
}
