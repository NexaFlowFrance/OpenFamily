// =============================================================================
// Gemini provider (Google AI Studio, OpenAI-compatible endpoint)
//
// Google exposes Gemini under an OpenAI-compatible surface at
// https://generativelanguage.googleapis.com/v1beta/openai — same `messages`
// shape, same Authorization header, same `chat/completions` path. So this
// provider is intentionally structured like NvidiaProvider: a thin HTTPS client
// with retry + timeout + structured error mapping.
//
// Differences worth noting vs NvidiaProvider:
//   * Model names follow the Gemini catalogue (gemini-2.5-flash / -pro / etc.)
//     not the meta/* names — see config.ts for the per-provider defaults.
//   * Gemini's OpenAI-compat layer accepts `response_format: { type: 'json_object' }`
//     but the model occasionally still emits a leading sentence. The same JSON
//     extraction guard in AIService.safeParseJson handles this case for
//     either provider, so we forward jsonMode the same way as NvidiaProvider
//     and let the consumer parse defensively.
//   * Gemini multimodal (image_url content parts) works the same as OpenAI —
//     no transformation needed; the upstream layer translates to its native
//     `inline_data` format.
//
// As with NvidiaProvider, we do NOT depend on an SDK. The Node 20+ fetch
// implementation is enough.
// =============================================================================
import logger from '../../lib/logger';
import { AiError } from '../errors';
import type {
    BaseProvider,
    ChatRequest,
    ChatResponse,
    ChatUsage,
    ProviderHealth,
    ToolCall,
} from './BaseProvider';

interface GeminiProviderOptions {
    apiKey: string;
    baseUrl: string;
    requestTimeoutMs: number;
    healthModel: string;
}

// Provider response shape (only the subset we use). Anything else is ignored.
interface GeminiChatChoice {
    index: number;
    message: {
        role: string;
        content: string | null;
        tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
}
interface GeminiChatResponse {
    id?: string;
    model?: string;
    choices: GeminiChatChoice[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const shouldRetry = (status: number): boolean => status === 429 || status >= 500;

const RETRYABLE_AI_CODES = new Set(['RATE_LIMITED', 'PROVIDER_ERROR', 'TIMEOUT']);

export class GeminiProvider implements BaseProvider {
    readonly name = 'gemini';
    private readonly opts: GeminiProviderOptions;

    constructor(opts: GeminiProviderOptions) {
        this.opts = opts;
    }

    async chat(req: ChatRequest): Promise<ChatResponse> {
        const started = Date.now();

        const body: Record<string, unknown> = {
            model: req.model,
            messages: req.messages.map((m) => {
                const out: Record<string, unknown> = { role: m.role };
                if (m.content !== null) out.content = m.content;
                if (m.name) out.name = m.name;
                if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
                if (m.tool_calls) out.tool_calls = m.tool_calls;
                return out;
            }),
        };
        if (req.temperature !== undefined) body.temperature = req.temperature;
        if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
        if (req.jsonMode) body.response_format = { type: 'json_object' };
        if (req.tools && req.tools.length > 0) body.tools = req.tools;
        if (req.toolChoice !== undefined) body.tool_choice = req.toolChoice;

        // Disable Gemini 2.5 "thinking" tokens. Without this, models in the
        // 2.5 family silently consume the `max_tokens` budget on internal
        // reasoning before emitting a single visible token, which truncates
        // long structured outputs (vacation plans, luggage checklists).
        //
        // The Gemini OpenAI-compatible REST endpoint reads the standard OpenAI
        // `reasoning_effort` field and maps "none" onto Google's
        // `thinking_config.thinking_budget = 0`. The `extra_body` convention
        // from the OpenAI Python SDK is NOT honored over REST — it gets
        // silently ignored — so we send the canonical field instead.
        // Harmless on non-thinking models (1.5, 2.0): the field is ignored.
        body.reasoning_effort = 'none';

        const parsed = await this.postWithRetry<GeminiChatResponse>('/chat/completions', body);
        const choice = parsed.choices?.[0];
        if (!choice) {
            throw new AiError('PROVIDER_ERROR', 'Provider returned no choices');
        }

        const usage: ChatUsage = {
            promptTokens: parsed.usage?.prompt_tokens ?? 0,
            completionTokens: parsed.usage?.completion_tokens ?? 0,
            totalTokens: parsed.usage?.total_tokens ?? 0,
        };

        const finishMap: Record<string, ChatResponse['finishReason']> = {
            stop: 'stop',
            tool_calls: 'tool_calls',
            length: 'length',
            content_filter: 'content_filter',
        };

        return {
            content: choice.message?.content ?? null,
            toolCalls: choice.message?.tool_calls ?? [],
            usage,
            finishReason: finishMap[choice.finish_reason ?? ''] ?? 'unknown',
            model: parsed.model ?? req.model,
            latencyMs: Date.now() - started,
        };
    }

    async health(): Promise<ProviderHealth> {
        const started = Date.now();
        try {
            await this.postWithRetry<GeminiChatResponse>('/chat/completions', {
                model: this.opts.healthModel,
                messages: [
                    { role: 'system', content: 'ping' },
                    { role: 'user', content: 'pong' },
                ],
                max_tokens: 1,
            });
            return {
                ok: true,
                provider: this.name,
                model: this.opts.healthModel,
                latencyMs: Date.now() - started,
            };
        } catch (error) {
            return {
                ok: false,
                provider: this.name,
                model: this.opts.healthModel,
                latencyMs: Date.now() - started,
                detail: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async postWithRetry<T>(pathSuffix: string, body: unknown): Promise<T> {
        const url = `${this.opts.baseUrl}${pathSuffix}`;
        let lastError: AiError | null = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.opts.apiKey}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                if (res.ok) {
                    const data = (await res.json()) as T;
                    return data;
                }

                const text = await res.text().catch(() => '');
                const code =
                    res.status === 401 || res.status === 403
                        ? 'UNAUTHORIZED'
                        : res.status === 429
                          ? 'RATE_LIMITED'
                          : res.status >= 500
                            ? 'PROVIDER_ERROR'
                            : 'BAD_REQUEST';
                lastError = new AiError(
                    code,
                    `Provider returned ${res.status}: ${text.slice(0, 500)}`,
                );

                if (!shouldRetry(res.status) || attempt === MAX_RETRIES - 1) {
                    throw lastError;
                }
            } catch (err) {
                if (err instanceof AiError) {
                    if (!RETRYABLE_AI_CODES.has(err.code)) throw err;
                    lastError = err;
                    if (attempt === MAX_RETRIES - 1) throw err;
                } else if (
                    err instanceof Error &&
                    (err.name === 'AbortError' || /aborted/i.test(err.message))
                ) {
                    lastError = new AiError('TIMEOUT', 'Provider request timed out');
                    if (attempt === MAX_RETRIES - 1) throw lastError;
                } else {
                    lastError = new AiError(
                        'PROVIDER_ERROR',
                        err instanceof Error ? err.message : String(err),
                        err,
                    );
                    if (attempt === MAX_RETRIES - 1) throw lastError;
                }
            } finally {
                clearTimeout(timer);
            }

            const delay = RETRY_BASE_DELAY_MS * Math.pow(3, attempt);
            logger.warn('ai.provider_retry', {
                provider: this.name,
                attempt: attempt + 1,
                nextDelayMs: delay,
                lastError: lastError?.message,
            });
            await sleep(delay);
        }

        throw lastError ?? new AiError('UNKNOWN', 'Retry loop ended without resolution');
    }
}
