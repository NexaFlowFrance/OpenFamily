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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));

    const response = await api.post<{ success: boolean; data: { authorizationUrl: string } }>(
        '/api/auth/oidc/start',
        { clientChallenge: challengeFor(verifier), inviteToken: invite ?? undefined, link: mode === 'link' },
    );
    window.location.assign(response.data.authorizationUrl);
};

/** Reads and forgets the sign-in this tab started, if any. */
export const takePendingSso = (): PendingSso | null => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const pending = JSON.parse(raw) as PendingSso;
        return typeof pending.verifier === 'string' ? pending : null;
    } catch {
        return null;
    }
};
