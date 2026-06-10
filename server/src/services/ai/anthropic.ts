// Anthropic provider — official SDK with structured outputs
// (output_config.format json_schema guarantees valid JSON matching the schema).
//
// Schema constraints: every object carries additionalProperties:false and the
// schemas never use minLength/maxLength/minimum/maximum (unsupported by
// structured outputs) — those bounds are enforced server-side after parsing.
// No temperature/top_p: removed on recent models, sending them would 400.

import Anthropic from '@anthropic-ai/sdk';
import { AiError, AI_TIMEOUT_MS, extractJson, type AiSettings, type AiCompletionRequest } from './index';

export async function anthropicComplete(
    settings: AiSettings,
    request: AiCompletionRequest
): Promise<Record<string, unknown>> {
    if (!settings.api_key) {
        throw new AiError('AI_UNAUTHORIZED', 'Clé API Anthropic manquante');
    }

    const client = new Anthropic({ apiKey: settings.api_key, maxRetries: 1 });

    let message: Anthropic.Message;
    try {
        message = await client.messages.create(
            {
                model: settings.model,
                max_tokens: 2048,
                system: request.system,
                messages: [{ role: 'user', content: request.user }],
                output_config: {
                    format: { type: 'json_schema', schema: request.jsonSchema },
                },
            },
            { timeout: AI_TIMEOUT_MS }
        );
    } catch (error) {
        if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
            throw new AiError('AI_UNAUTHORIZED', 'Clé API Anthropic refusée');
        }
        if (error instanceof Anthropic.NotFoundError) {
            throw new AiError('AI_MODEL_NOT_FOUND', `Modèle introuvable: ${settings.model}`);
        }
        if (error instanceof Anthropic.APIConnectionError) {
            throw new AiError('AI_UNREACHABLE', 'API Anthropic injoignable');
        }
        if (error instanceof Anthropic.APIError) {
            throw new AiError('AI_PROVIDER_ERROR', error.message);
        }
        throw new AiError('AI_UNREACHABLE', error instanceof Error ? error.message : 'API Anthropic injoignable');
    }

    const textBlock = message.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    if (!textBlock || !textBlock.text.trim()) {
        throw new AiError('AI_INVALID_RESPONSE', 'Réponse Anthropic vide');
    }
    // Structured outputs already guarantee valid JSON, but stay defensive anyway.
    return extractJson(textBlock.text);
}
