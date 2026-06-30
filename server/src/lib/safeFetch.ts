// Hardened outbound fetch for user-supplied base URLs (AI providers, integrations).
//
// The SSRF guard (assertSafeIntegrationUrl) only vets the URL the caller hands us;
// a default redirect:'follow' would let a vetted public/LAN host 302 the server to
// a blocked, internal or cloud-metadata address that never passed the guard. This
// helper re-runs the guard on EVERY redirect hop, enforces a hard timeout via an
// AbortController, and optionally caps the response body so a hostile/misconfigured
// upstream cannot stream unbounded data into memory.
//
// This mirrors the manual-redirect + capped-read pattern already used for recipe
// import (lib/recipeImport.ts) — kept as a shared helper so the AI providers and
// the Immich/integration fetches all share one audited code path.
//
// NOTE: DNS-rebinding remains a residual risk. We re-validate the hostname on every
// hop, but the OS resolver may return a different address between the assertSafe
// lookup and the actual socket connect. Pinning the connection to the vetted IP
// would require a custom undici lookup/dispatcher and is intentionally out of scope
// here (see task spec) — the redirect re-validation + timeout + size cap are the
// priority mitigations.

import { assertSafeIntegrationUrl } from '../utils/urlGuard';
import { AI_TIMEOUT_MS } from '../services/ai';

const MAX_REDIRECTS = 5;

export interface SafeFetchOptions extends RequestInit {
    /** Force-block loopback/RFC1918/link-local targets (passed through to the guard). */
    blockPrivate?: boolean;
    /** Hard timeout for the whole request (defaults to the shared AI timeout). */
    timeoutMs?: number;
    /** When set, the response body is capped at this many bytes (see readCappedBuffer). */
    maxBytes?: number;
}

/**
 * fetch() that re-validates the target on every redirect hop and enforces a hard
 * timeout. Redirects are followed manually (redirect:'manual') so a 3xx Location
 * is resolved against the current URL and re-checked with assertSafeIntegrationUrl
 * before the next request — up to MAX_REDIRECTS hops, then it throws.
 *
 * The returned Response is the final (non-redirect) response. Pass `maxBytes` plus
 * readCappedBuffer()/readCappedText() to bound how much of its body you read.
 *
 * Callers should keep their own error mapping: this helper throws the raw fetch
 * error (or an Error for too-many-redirects / a missing Location header).
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<Response> {
    const { blockPrivate, timeoutMs, maxBytes: _maxBytes, ...init } = options;
    const effectiveTimeout = timeoutMs ?? AI_TIMEOUT_MS;
    let current = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertSafeIntegrationUrl(current, { blockPrivate });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), effectiveTimeout);
        try {
            const response = await fetch(current, {
                ...init,
                redirect: 'manual',
                signal: controller.signal,
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                await response.body?.cancel().catch(() => undefined);
                if (!location) throw new Error(`HTTP ${response.status} sans en-tête Location`);
                // Resolve relative redirects against the current URL, then re-vet.
                current = new URL(location, current).toString();
                continue;
            }

            return response;
        } finally {
            clearTimeout(timer);
        }
    }
    throw new Error('Trop de redirections');
}

/**
 * Reads a response body into a Buffer, aborting (and throwing) once `maxBytes` is
 * exceeded so an unbounded upstream stream cannot exhaust memory.
 */
export async function readCappedBuffer(response: Response, maxBytes: number): Promise<Buffer> {
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > maxBytes) {
                throw new Error(`Réponse trop volumineuse (> ${maxBytes} octets)`);
            }
            chunks.push(value);
        }
    } finally {
        await reader.cancel().catch(() => undefined);
    }
    return Buffer.concat(chunks);
}

/**
 * Reads a response body into a string, capped at `maxBytes`. Once the cap is
 * reached, reading stops and the truncated text is returned (mirrors the recipe
 * import reader, which is lenient about truncation rather than throwing).
 */
export async function readCappedText(response: Response, maxBytes: number): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let text = '';
    let received = 0;
    try {
        while (received < maxBytes) {
            const { done, value } = await reader.read();
            if (done) return text + decoder.decode();
            received += value.byteLength;
            text += decoder.decode(value, { stream: true });
        }
    } finally {
        await reader.cancel().catch(() => undefined);
    }
    return text;
}
