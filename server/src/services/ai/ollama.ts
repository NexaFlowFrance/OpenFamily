// Ollama provider — fully local, no API key, the privacy-first default.
// POST {base_url}/api/chat with `format` set to the JSON schema (Ollama accepts a
// JSON schema object in `format`; we fall back to the plain 'json' mode if the
// schema is rejected by an older Ollama version).

import { assertSafeIntegrationUrl, UnsafeUrlError } from '../../utils/urlGuard';
import {
    AiError,
    aiFetch,
    extractJson,
    DEFAULT_BASE_URLS,
    type AiSettings,
    type AiCompletionRequest,
    type TokenUsage,
} from './index';

export async function ollamaComplete(
    settings: AiSettings,
    request: AiCompletionRequest
): Promise<{ data: Record<string, unknown>; usage: TokenUsage | null }> {
    const baseUrl = (settings.base_url || DEFAULT_BASE_URLS.ollama!).replace(/\/+$/, '');

    try {
        // Private LAN targets are legitimate here (local Ollama is the whole point);
        // the guard still always blocks cloud metadata endpoints.
        await assertSafeIntegrationUrl(baseUrl);
    } catch (e) {
        throw new AiError('AI_UNREACHABLE', e instanceof UnsafeUrlError ? e.message : 'URL invalide');
    }

    const doRequest = (format: unknown) =>
        aiFetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    { role: 'system', content: request.system },
                    { role: 'user', content: request.user },
                ],
                stream: false,
                format,
            }),
        }, request.timeoutMs);

    let response = await doRequest(request.jsonSchema);
    if (response.status === 400) {
        // Older Ollama versions only accept format: 'json' — retry once.
        response = await doRequest('json');
    }

    if (!response.ok) {
        const detail = await safeErrorText(response);
        if (response.status === 404) {
            throw new AiError('AI_MODEL_NOT_FOUND', detail || `Modèle introuvable: ${settings.model}`);
        }
        throw new AiError('AI_PROVIDER_ERROR', detail || `Ollama a répondu HTTP ${response.status}`);
    }

    const data = (await response.json().catch(() => null)) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
    } | null;
    const content = data?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
        throw new AiError('AI_INVALID_RESPONSE', 'Réponse Ollama vide');
    }
    const result = extractJson(content);
    const pTokens = data?.prompt_eval_count ?? 0;
    const cTokens = data?.eval_count ?? 0;
    const usage = (pTokens || cTokens) ? {
        prompt_tokens: pTokens,
        completion_tokens: cTokens,
        total_tokens: pTokens + cTokens,
    } : null;

    return { data: result, usage };
}

async function safeErrorText(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { error?: string };
        return typeof body?.error === 'string' ? body.error : '';
    } catch {
        return '';
    }
}

/** The models installed on an Ollama server, named as it names them ("qwen3.5:4b"). */
export async function ollamaListModels(baseUrl: string | null, timeoutMs: number): Promise<string[]> {
    const base = (baseUrl || DEFAULT_BASE_URLS.ollama!).replace(/\/+$/, '');
    try {
        await assertSafeIntegrationUrl(base);
    } catch (e) {
        throw new AiError('AI_UNREACHABLE', e instanceof UnsafeUrlError ? e.message : 'URL invalide');
    }
    const response = await aiFetch(`${base}/api/tags`, { method: 'GET' }, timeoutMs);
    if (!response.ok) {
        throw new AiError('AI_PROVIDER_ERROR', `${base} a répondu HTTP ${response.status} à /api/tags : est-ce bien l'adresse d'un serveur Ollama ?`);
    }
    const data = (await response.json().catch(() => null)) as { models?: Array<{ name?: unknown }> } | null;
    if (!data || !Array.isArray(data.models)) {
        throw new AiError('AI_PROVIDER_ERROR', `${base} ne répond pas comme un serveur Ollama`);
    }
    return data.models.map((model) => (typeof model.name === 'string' ? model.name : '')).filter(Boolean);
}

/** "qwen3.5" names "qwen3.5:latest"; otherwise the name must match, tag included. */
export const ollamaHasModel = (installed: string[], model: string): boolean => {
    const wanted = model.trim().toLowerCase();
    return installed.some((name) => name.toLowerCase() === wanted || name.toLowerCase() === `${wanted}:latest`);
};
