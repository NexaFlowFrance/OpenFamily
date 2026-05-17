// =============================================================================
// AI configuration
//
// All settings come from env vars (12-factor). This module is responsible for
// reading and validating them at boot. Misconfigurations should fail loud
// rather than crashing later in the middle of a request.
//
// `AI_ENABLED=false` disables the feature entirely without removing any code,
// useful for the open-source self-hoster who has no provider key.
//
// Provider selection (AI_PROVIDER):
//   - nvidia (default — backwards compatible): uses NVIDIA NIM
//   - gemini: uses Google Gemini through its OpenAI-compatible endpoint
// Both speak the OpenAI chat-completions dialect, so the provider code is a
// thin HTTP client per provider with the right baseUrl and key.
// =============================================================================
import logger from '../lib/logger';

export type AiProviderName = 'nvidia' | 'gemini';

export interface AiConfig {
    enabled: boolean;
    provider: AiProviderName;
    nvidia: {
        apiKey: string;
        baseUrl: string;
    };
    gemini: {
        apiKey: string;
        baseUrl: string;
    };
    models: {
        default: string;
        heavy: string;
        vision: string;
    };
    requestTimeoutMs: number;
    streamingEnabled: boolean;
    monthlyTokenLimitPerUser: number; // 0 = unlimited
}

const parseBoolEnv = (raw: string | undefined, fallback: boolean): boolean => {
    if (raw === undefined) return fallback;
    const v = raw.toLowerCase().trim();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
    return fallback;
};

const parseIntEnv = (raw: string | undefined, fallback: number): number => {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const parseProviderEnv = (raw: string | undefined): AiProviderName => {
    const v = (raw ?? '').toLowerCase().trim();
    if (v === 'gemini') return 'gemini';
    return 'nvidia'; // default; covers '', 'nvidia', and any unknown value
};

// Per-provider model defaults. Picked so that a fresh deploy "just works"
// without forcing the operator to know the model catalogue of every provider.
// Override individually with AI_MODEL_DEFAULT / _HEAVY / _VISION env vars.
const DEFAULT_MODELS: Record<AiProviderName, { default: string; heavy: string; vision: string }> = {
    nvidia: {
        default: 'meta/llama-3.1-8b-instruct',
        heavy: 'meta/llama-3.3-70b-instruct',
        vision: 'meta/llama-3.2-90b-vision-instruct',
    },
    gemini: {
        // gemini-2.5-flash-lite on every slot. The "lite" variant has NO
        // built-in thinking, which matters because:
        //   * Gemini's OpenAI-compatible REST endpoint silently ignores both
        //     the `extra_body.google.thinking_config` shape (a Python SDK
        //     convention) and the standard `reasoning_effort: "none"` field.
        //   * Thinking-enabled 2.5 models therefore consume a large slice of
        //     the `max_tokens` budget on hidden reasoning, which truncates
        //     visible JSON on long structured outputs (vacation plans, luggage
        //     checklists ~4 KB).
        //   * 2.5-flash-lite is on the free tier, natively multimodal, and
        //     fast enough that "heavy" tasks still complete in a few seconds.
        //
        // Override AI_MODEL_HEAVY=gemini-2.5-pro for deeper reasoning, but be
        // ready to bump AI_REQUEST_TIMEOUT_MS and accept the thinking caveat.
        default: 'gemini-2.5-flash-lite',
        heavy: 'gemini-2.5-flash-lite',
        vision: 'gemini-2.5-flash-lite',
    },
};

let cached: AiConfig | null = null;

/**
 * Read the AI configuration from process.env. Cached after the first call so
 * env mutations during a single process lifetime don't surprise callers.
 *
 * Throws if AI_ENABLED is true but the API key for the selected provider is
 * missing — we want this to crash at boot, not when a user finally tries to
 * use the chat feature.
 */
export const getAiConfig = (): AiConfig => {
    if (cached) return cached;

    const enabled = parseBoolEnv(process.env.AI_ENABLED, true);
    const provider = parseProviderEnv(process.env.AI_PROVIDER);

    const nvidiaKey = process.env.NVIDIA_API_KEY?.trim() ?? '';
    const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? '';

    if (enabled) {
        if (provider === 'nvidia') {
            if (!nvidiaKey) {
                throw new Error(
                    'AI_ENABLED=true and AI_PROVIDER=nvidia but NVIDIA_API_KEY is missing. ' +
                        'Either set the key, switch AI_PROVIDER, or set AI_ENABLED=false.',
                );
            }
            // NVIDIA NIM keys start with "nvapi-" — catch obvious copy-paste mistakes
            // (e.g. someone pasting an OpenAI key by accident).
            if (!nvidiaKey.startsWith('nvapi-')) {
                logger.warn('ai.api_key_unexpected_prefix', {
                    provider: 'nvidia',
                    hint: 'NVIDIA NIM keys usually start with "nvapi-". Double-check the value.',
                });
            }
        } else if (provider === 'gemini') {
            if (!geminiKey) {
                throw new Error(
                    'AI_ENABLED=true and AI_PROVIDER=gemini but GEMINI_API_KEY is missing. ' +
                        'Either set the key, switch AI_PROVIDER, or set AI_ENABLED=false.',
                );
            }
            // Google AI Studio keys start with "AIza" — catch obvious mistakes.
            if (!geminiKey.startsWith('AIza')) {
                logger.warn('ai.api_key_unexpected_prefix', {
                    provider: 'gemini',
                    hint: 'Gemini API keys usually start with "AIza". Double-check the value.',
                });
            }
        }
    }

    const providerDefaults = DEFAULT_MODELS[provider];

    cached = {
        enabled,
        provider,
        nvidia: {
            apiKey: nvidiaKey,
            baseUrl:
                process.env.NVIDIA_API_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1',
        },
        gemini: {
            apiKey: geminiKey,
            baseUrl:
                process.env.GEMINI_API_BASE_URL?.trim() ||
                'https://generativelanguage.googleapis.com/v1beta/openai',
        },
        models: {
            default: process.env.AI_MODEL_DEFAULT?.trim() || providerDefaults.default,
            heavy: process.env.AI_MODEL_HEAVY?.trim() || providerDefaults.heavy,
            vision: process.env.AI_MODEL_VISION?.trim() || providerDefaults.vision,
        },
        // 60s default: heavy structured outputs (vacation plan day-by-day,
        // weekly meal analysis) routinely need 35-50s on Gemini 2.5-flash-lite
        // for a single attempt. 30s was too tight and produced spurious
        // TIMEOUTs; 60s × 3 retries = 3 min worst-case still bounds latency
        // when the provider is actually down.
        requestTimeoutMs: parseIntEnv(process.env.AI_REQUEST_TIMEOUT_MS, 60_000),
        streamingEnabled: parseBoolEnv(process.env.AI_STREAMING_ENABLED, true),
        monthlyTokenLimitPerUser: parseIntEnv(
            process.env.AI_MONTHLY_TOKEN_LIMIT_PER_USER,
            2_000_000,
        ),
    };

    logger.info('ai.config_loaded', {
        enabled: cached.enabled,
        provider: cached.provider,
        baseUrl: cached.provider === 'nvidia' ? cached.nvidia.baseUrl : cached.gemini.baseUrl,
        modelDefault: cached.models.default,
        modelHeavy: cached.models.heavy,
        // Never log the key, even partially.
    });

    return cached;
};

// Exposed for tests that want to mutate env between test cases.
export const resetAiConfigCache = (): void => {
    cached = null;
};
