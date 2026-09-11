// Google Gemini provider — direct REST call to the Gemini API, no SDK.
//
// The key travels in the x-goog-api-key header and never in the URL, so it
// cannot end up in a proxy or access log. Structured output is requested with
// the same JSON schema the other providers receive (responseJsonSchema takes
// standard JSON Schema, including additionalProperties:false), so Gemini plugs
// into the same validated completion pipeline.

import {
    AiError,
    aiFetch,
    extractJson,
    type AiSettings,
    type AiCompletionRequest,
    type TokenUsage,
} from './index';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function geminiComplete(
    settings: AiSettings,
    request: AiCompletionRequest
): Promise<{ data: Record<string, unknown>; usage: TokenUsage | null }> {
    if (!settings.api_key) {
        throw new AiError('AI_UNAUTHORIZED', 'Clé API Google Gemini manquante');
    }

    const model = settings.model.trim();
    if (!model) {
        throw new AiError('AI_MODEL_NOT_FOUND', 'Modèle Gemini manquant');
    }

    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;

    const response = await aiFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': settings.api_key,
        },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: request.system }] },
            contents: [{ role: 'user', parts: [{ text: request.user }] }],
            generationConfig: {
                responseMimeType: 'application/json',
                responseJsonSchema: request.jsonSchema,
            },
        }),
    });

    if (!response.ok) {
        const { message, status, reason } = await readError(response);

        // A bad key is NOT a 401 on this API: Google answers 400 INVALID_ARGUMENT
        // with reason API_KEY_INVALID (verified against the live endpoint), so the
        // structured status and reason are checked before the HTTP code.
        if (
            response.status === 401 ||
            response.status === 403 ||
            reason === 'API_KEY_INVALID' ||
            status === 'UNAUTHENTICATED' ||
            status === 'PERMISSION_DENIED'
        ) {
            throw new AiError('AI_UNAUTHORIZED', message || 'Clé API Google Gemini refusée');
        }
        // Unknown model: 404 NOT_FOUND, "models/x is not found for API version
        // v1beta, or is not supported for generateContent".
        if (
            response.status === 404 ||
            status === 'NOT_FOUND' ||
            (/model/i.test(message) && /not found|not supported|does not exist/i.test(message))
        ) {
            throw new AiError('AI_MODEL_NOT_FOUND', message || `Modèle Gemini introuvable: ${model}`);
        }
        throw new AiError('AI_PROVIDER_ERROR', message || `Google Gemini a répondu HTTP ${response.status}`);
    }

    const body = (await response.json().catch(() => null)) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
        };
    } | null;

    const parts = body?.candidates?.[0]?.content?.parts ?? [];
    const content = parts
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();

    if (!content) {
        throw new AiError('AI_INVALID_RESPONSE', 'Réponse Google Gemini vide');
    }

    // Structured output already guarantees valid JSON, but stay defensive anyway.
    const result = extractJson(content);

    const usage = body?.usageMetadata
        ? {
              prompt_tokens: body.usageMetadata.promptTokenCount ?? 0,
              completion_tokens: body.usageMetadata.candidatesTokenCount ?? 0,
              total_tokens: body.usageMetadata.totalTokenCount ?? 0,
          }
        : null;

    return { data: result, usage };
}

/**
 * Google's error envelope: { error: { code, status, message, details: [...] } }
 * where details may carry a google.rpc.ErrorInfo with a machine-readable reason.
 * Everything is optional and the body may not be JSON at all.
 */
async function readError(response: Response): Promise<{ message: string; status: string; reason: string }> {
    try {
        const body = (await response.json()) as {
            error?: { message?: string; status?: string; details?: Array<{ reason?: string }> };
        };
        const error = body?.error;
        const info = error?.details?.find((d) => typeof d?.reason === 'string');
        return {
            message: typeof error?.message === 'string' ? error.message : '',
            status: typeof error?.status === 'string' ? error.status : '',
            reason: info?.reason ?? '',
        };
    } catch {
        return { message: '', status: '', reason: '' };
    }
}
