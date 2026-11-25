// Single sign-on through the server's identity provider.
//
// The tab that starts a sign-in keeps a random secret (the verifier) and sends
// the server only its SHA-256 (the challenge). When the provider sends the
// browser back, the server hands over a one-time code in the URL fragment; the
// code is only redeemable together with the verifier, so a code copied from a
// log or a crafted link cannot sign anyone in.
//
// The hash is computed with @noble/hashes rather than crypto.subtle, which
// browsers only offer on https and localhost: plenty of self-hosted servers are
// reached over plain http on the home network.
import { sha256 } from '@noble/hashes/sha2';
import { api } from './api';
import { isNative } from './serverConfig';

const STORAGE_KEY = 'openfamily.sso';

export type SsoMode = 'login' | 'link';

interface PendingSso {
    verifier: string;
    mode: SsoMode;
    invite: string | null;
    startedAt: number;
}

const base64url = (bytes: Uint8Array): string => {
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** base64url(SHA-256(verifier)), the PKCE S256 transform (RFC 7636). */
export const challengeFor = (verifier: string): string =>
    base64url(sha256(new TextEncoder().encode(verifier)));

/** SSO needs a real random source; without one the button is not offered. */
export const ssoSupported = (): boolean =>
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';

/** Asks the server for the provider's sign-in address and goes there. */
export const startSso = async (mode: SsoMode, invite?: string | null): Promise<void> => {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const pending: PendingSso = { verifier, mode, invite: invite ?? null, startedAt: Date.now() };
    // In the Android app the sign-in happens in the phone's browser, and the
    // system may stop the app meanwhile: the secret has to outlive it.
    const native = isNative();
    (native ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(pending));

    const response = await api.post<{ success: boolean; data: { authorizationUrl: string } }>(
        '/api/auth/oidc/start',
        { clientChallenge: challengeFor(verifier), inviteToken: invite ?? undefined, link: mode === 'link', native: native || undefined },
    );
    // In the app, an address outside the app opens in the phone's browser;
    // the server then sends the person back through an openfamily:// link.
    window.location.assign(response.data.authorizationUrl);
};

// What the server sent back to the Android app ("code=..." or "error=..."),
// kept from the moment the link arrives until the callback page reads it.
let nativeReturn: string | null = null;
export const deliverNativeSsoReturn = (fragment: string): void => { nativeReturn = fragment; };
export const takeNativeSsoReturn = (): string => {
    const fragment = nativeReturn ?? '';
    nativeReturn = null;
    return fragment;
};

/**
 * Calls `reset` when the page is restored from the back/forward cache, as when
 * someone comes back from the provider with the Back button: the page returns
 * exactly as it was left, its buttons still busy. Returns the cleanup.
 */
export const onPageRestored = (reset: () => void): (() => void) => {
    const listener = (event: PageTransitionEvent) => {
        if (event.persisted) reset();
    };
    // The Android app is not left: it comes back to the front, as it was.
    const visible = () => { if (isNative() && document.visibilityState === 'visible') reset(); };
    window.addEventListener('pageshow', listener);
    document.addEventListener('visibilitychange', visible);
    return () => {
        window.removeEventListener('pageshow', listener);
        document.removeEventListener('visibilitychange', visible);
    };
};

/** Reads and forgets the sign-in this tab started, if any. */
export const takePendingSso = (): PendingSso | null => {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const pending = JSON.parse(raw) as PendingSso;
        return typeof pending.verifier === 'string' ? pending : null;
    } catch {
        return null;
    }
};
