// OpenAI-compatible provider — works with OpenAI, LM Studio, vLLM, Mistral,
// OpenRouter… anything that speaks POST {base_url}/v1/chat/completions.
// JSON is requested via response_format json_object (the schema itself is
// described in the prompt, then strictly validated server-side).

import { assertSafeIntegrationUrl, UnsafeUrlError } from '../../utils/urlGuard';
import {
    AiError,
    aiFetch,
    extractJson,
    DEFAULT_BASE_URLS,
    type AiSettings,
    type AiCompletionRequest,
} from './index';

export async function openaiComplete(
    settings: AiSettings,
    request: AiCompletionRequest
): Promise<Record<string, unknown>> {
    // Accept both "https://host" and "https://host/v1" forms.
    const baseUrl = (settings.base_url || DEFAULT_BASE_URLS.openai!)
        .replace(/\/+$/, '')
        .replace(/\/v1$/, '');

    try {
        // LAN targets (LM Studio, vLLM on a NAS…) are legitimate; metadata
        // endpoints are always blocked.
        await assertSafeIntegrationUrl(baseUrl);
    } catch (e) {
        throw new AiError('AI_UNREACHABLE', e instanceof UnsafeUrlError ? e.message : 'URL invalide');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.api_key) {
        headers['Authorization'] = `Bearer ${settings.api_key}`;
    }

    const response = await aiFetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: settings.model,
            messages: [
                { role: 'system', content: request.system },
                { role: 'user', content: request.user },
            ],
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const detail = await safeErrorMessage(response);
        if (response.status === 401 || response.status === 403) {
            throw new AiError('AI_UNAUTHORIZED', detail || 'Clé API refusée');
        }
        if (response.status === 404 || /model/i.test(detail) && /not\s*found|does not exist/i.test(detail)) {
            throw new AiError('AI_MODEL_NOT_FOUND', detail || `Modèle introuvable: ${settings.model}`);
        }
        throw new AiError('AI_PROVIDER_ERROR', detail || `Le fournisseur a répondu HTTP ${response.status}`);
    }

    const data = (await response.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string } }>;
    } | null;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
        throw new AiError('AI_INVALID_RESPONSE', 'Réponse du fournisseur vide');
    }
    return extractJson(content);
}

async function safeErrorMessage(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { error?: { message?: string } | string };
        if (typeof body?.error === 'string') return body.error;
        return typeof body?.error?.message === 'string' ? body.error.message : '';
    } catch {
        return '';
    }
}
