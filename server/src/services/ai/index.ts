// Local-first AI assistant — provider abstraction.
//
// A single entry point, aiComplete(), takes a system prompt, a user prompt and
// a JSON schema, dispatches to the configured provider (Ollama / OpenAI-compatible /
// Anthropic) and returns a PARSED JSON object. The model output is never trusted:
// callers must still structurally validate the result.

import { ollamaComplete } from './ollama';
import { openaiComplete } from './openai';
import { anthropicComplete } from './anthropic';

export type AiProvider = 'ollama' | 'openai' | 'anthropic';

export interface AiSettings {
    provider: AiProvider;
    /** Base URL (ollama / openai-compatible only — ignored for anthropic). */
    base_url: string | null;
    /** Decrypted API key (openai / anthropic — never needed for ollama). */
    api_key: string | null;
    model: string;
}

export interface AiCompletionRequest {
    system: string;
    user: string;
    /** JSON schema of the expected response object (additionalProperties:false everywhere). */
    jsonSchema: Record<string, unknown>;
}

export type AiErrorCode =
    | 'AI_UNREACHABLE'
    | 'AI_UNAUTHORIZED'
    | 'AI_MODEL_NOT_FOUND'
    | 'AI_INVALID_RESPONSE'
    | 'AI_PROVIDER_ERROR';

export class AiError extends Error {
    constructor(public code: AiErrorCode, message: string) {
        super(message);
        this.name = 'AiError';
    }
}

/** All providers share the same hard timeout. */
export const AI_TIMEOUT_MS = 60_000;

export const DEFAULT_BASE_URLS: Record<AiProvider, string | null> = {
    ollama: 'http://localhost:11434',
    openai: 'https://api.openai.com',
    anthropic: null,
};

/**
 * fetch() with the shared 60s AbortController timeout AND SSRF-safe redirect
 * handling: redirects are followed manually and re-validated on every hop
 * (safeFetch), so a user-set base_url cannot 302 the server to a blocked /
 * internal / cloud-metadata address that bypassed the initial guard. The base
 * URL itself is still validated by each provider before calling aiFetch.
 * Network-level failures are mapped to AI_UNREACHABLE with a readable message.
 *
 * Imported lazily to avoid a circular import (safeFetch imports AI_TIMEOUT_MS
 * from this module).
 */
export async function aiFetch(url: string, init: RequestInit): Promise<Response> {
    const { safeFetch } = await import('../../lib/safeFetch');
    try {
        // LAN/private targets stay legitimate here (local Ollama, LM Studio…);
        // the guard always blocks metadata endpoints regardless.
        return await safeFetch(url, { ...init, timeoutMs: AI_TIMEOUT_MS });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new AiError('AI_UNREACHABLE', `Le fournisseur IA n'a pas répondu en ${AI_TIMEOUT_MS / 1000}s`);
        }
        throw new AiError('AI_UNREACHABLE', error instanceof Error ? error.message : 'Fournisseur IA injoignable');
    }
}

/**
 * Defensive JSON extraction: strips markdown code fences, then parses the
 * substring between the first '{' and the last '}'. Models occasionally wrap
 * their JSON in prose even when asked not to.
 */
export function extractJson(text: string): Record<string, unknown> {
    const withoutFences = text.replace(/```(?:json)?/gi, '');
    const start = withoutFences.indexOf('{');
    const end = withoutFences.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        throw new AiError('AI_INVALID_RESPONSE', 'La réponse du modèle ne contient pas de JSON');
    }
    try {
        const parsed = JSON.parse(withoutFences.slice(start, end + 1));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('not an object');
        }
        return parsed as Record<string, unknown>;
    } catch {
        throw new AiError('AI_INVALID_RESPONSE', 'La réponse du modèle est un JSON invalide');
    }
}

export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface AiCompletionWithUsageResult {
    data: Record<string, unknown>;
    usage: TokenUsage | null;
}

/** Single entry point: run a JSON completion through the configured provider. */
export async function aiComplete(
    settings: AiSettings,
    request: AiCompletionRequest
): Promise<Record<string, unknown>> {
    const { data } = await aiCompleteWithUsage(settings, request);
    return data;
}

/** Variant of aiComplete that also returns token usage metrics alongside the data object. */
export async function aiCompleteWithUsage(
    settings: AiSettings,
    request: AiCompletionRequest
): Promise<AiCompletionWithUsageResult> {
    switch (settings.provider) {
        case 'ollama':
            return ollamaComplete(settings, request);
        case 'openai':
            return openaiComplete(settings, request);
        case 'anthropic':
            return anthropicComplete(settings, request);
        default:
            throw new AiError('AI_PROVIDER_ERROR', `Fournisseur IA inconnu: ${settings.provider}`);
    }
}
