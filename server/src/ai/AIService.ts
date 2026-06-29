// =============================================================================
// AIService — high-level façade
//
// Routes and tools call this, not the provider directly. The service is
// responsible for:
//   - selecting the right model for a given feature
//   - enforcing quotas before issuing the call
//   - recording every interaction in ai_interactions
//   - converting provider errors into the AiError taxonomy
//
// Future feature methods (parseShoppingNL, generateWeeklyMealPlan, …) live
// here so the routes stay thin. PR #1 only exposes health() and a generic
// chat() — enough to validate the plumbing end-to-end.
// =============================================================================
import logger from '../lib/logger';
import { getAiConfig } from './config';
import { AiError } from './errors';
import { NvidiaProvider } from './providers/NvidiaProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import type {
    BaseProvider,
    ChatRequest,
    ChatResponse,
    ProviderHealth,
} from './providers/BaseProvider';
import { canSpend, recordInteraction } from './tokenAccounting';
import { lookupClassification, saveClassification } from './cache';
import {
    SHOPPING_CATEGORIES,
    type ShoppingCategory,
    buildClassifyShoppingItemUserPrompt,
    buildParseShoppingNLUserPrompt,
    classifyShoppingItemSystemPrompt,
    parseShoppingNaturalLanguageSystemPrompt,
} from './prompts/shoppingPrompts';
import {
    type ClothingKidInput,
    buildClothingUserPrompt,
    clothingSuggestionsSystemPrompt,
} from './prompts/clothingPrompts';
import {
    type RecipeGenerationInput,
    buildRecipeGenerationUserPrompt,
    recipeGenerationSystemPrompt,
} from './prompts/recipePrompts';
import {
    type NutritionAnalysisInput,
    buildNutritionWeeklyUserPrompt,
    nutritionWeeklySystemPrompt,
} from './prompts/nutritionPrompts';
import {
    type LunchboxGenerationInput,
    buildLunchboxGenerationUserPrompt,
    lunchboxGenerationSystemPrompt,
} from './prompts/lunchboxPrompts';
import {
    type ExtractedReceipt,
    type ReceiptExtractionInput,
    buildReceiptExtractionUserMessage,
    receiptExtractionSystemPrompt,
} from './prompts/receiptPrompts';
import {
    type BudgetAnalysisInput,
    buildBudgetAnalysisUserPrompt,
    budgetAnalysisSystemPrompt,
} from './prompts/budgetAnalysisPrompts';
import {
    type GardeningTipsInput,
    buildGardeningTipsUserPrompt,
    gardeningTipsSystemPrompt,
} from './prompts/gardeningPrompts';
import {
    type VacationPlanInput,
    buildVacationPlanUserPrompt,
    vacationPlanSystemPrompt,
} from './prompts/vacationPlanPrompts';
import {
    type VacationLuggageInput,
    buildVacationLuggageUserPrompt,
    vacationLuggageSystemPrompt,
} from './prompts/vacationLuggagePrompts';
import type { WeatherSummary } from '../weather/WeatherService';

let cachedProvider: BaseProvider | null = null;

const getProvider = (): BaseProvider => {
    if (cachedProvider) return cachedProvider;
    const cfg = getAiConfig();
    if (!cfg.enabled) throw new AiError('DISABLED', 'AI feature is disabled');

    switch (cfg.provider) {
        case 'nvidia':
            cachedProvider = new NvidiaProvider({
                apiKey: cfg.nvidia.apiKey,
                baseUrl: cfg.nvidia.baseUrl,
                requestTimeoutMs: cfg.requestTimeoutMs,
                healthModel: cfg.models.default,
            });
            return cachedProvider;
        case 'gemini':
            cachedProvider = new GeminiProvider({
                apiKey: cfg.gemini.apiKey,
                baseUrl: cfg.gemini.baseUrl,
                requestTimeoutMs: cfg.requestTimeoutMs,
                healthModel: cfg.models.default,
            });
            return cachedProvider;
        default:
            // Exhaustiveness guard: if AiProviderName grows, the switch above
            // must too. This branch only runs on invalid runtime config.
            throw new AiError('PROVIDER_ERROR', `Unsupported AI provider: ${String(cfg.provider)}`);
    }
};

export interface ChatContext {
    userId: string;
    /** Logical feature name for accounting/logging — e.g. "shopping.classify". */
    feature: string;
    /** Override the model that would be picked from config. */
    model?: string;
}

export interface AiHealth {
    enabled: boolean;
    provider: string;
    modelDefault: string;
    modelHeavy: string;
    modelVision: string;
    livenessOk: boolean;
    livenessLatencyMs: number | null;
    livenessDetail?: string;
}

export const AIService = {
    /**
     * Return a snapshot of the AI configuration plus a live ping to the
     * provider. Used by /api/ai/health and by smoke tests. The liveness probe
     * is the only call here that actually hits the network.
     */
    async health(): Promise<AiHealth> {
        const cfg = getAiConfig();
        const base: AiHealth = {
            enabled: cfg.enabled,
            provider: cfg.provider,
            modelDefault: cfg.models.default,
            modelHeavy: cfg.models.heavy,
            modelVision: cfg.models.vision,
            livenessOk: false,
            livenessLatencyMs: null,
        };
        if (!cfg.enabled) return base;

        const probe: ProviderHealth = await getProvider().health();
        return {
            ...base,
            livenessOk: probe.ok,
            livenessLatencyMs: probe.latencyMs,
            livenessDetail: probe.detail,
        };
    },

    /**
     * Generic chat call with quota enforcement, logging and structured errors.
     * PR #1 doesn't expose this through HTTP — it exists so PR #2-5 can build
     * their feature methods on top.
     */
    async chat(
        req: Omit<ChatRequest, 'userId' | 'feature' | 'model'> & { model?: string },
        ctx: ChatContext,
    ): Promise<ChatResponse> {
        const cfg = getAiConfig();
        if (!cfg.enabled) throw new AiError('DISABLED', 'AI feature is disabled');

        const model = ctx.model ?? req.model ?? cfg.models.default;
        const tokensRequested = req.maxTokens ?? 1024;

        const ok = await canSpend(ctx.userId, tokensRequested, cfg.monthlyTokenLimitPerUser);
        if (!ok) {
            await recordInteraction({
                userId: ctx.userId,
                feature: ctx.feature,
                model,
                promptTokens: 0,
                completionTokens: 0,
                latencyMs: null,
                status: 'quota',
                errorCode: 'QUOTA_EXCEEDED',
            });
            throw new AiError('QUOTA_EXCEEDED', 'Monthly AI token quota reached');
        }

        try {
            const response = await getProvider().chat({
                ...req,
                model,
                userId: ctx.userId,
                feature: ctx.feature,
            });
            await recordInteraction({
                userId: ctx.userId,
                feature: ctx.feature,
                model: response.model,
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                latencyMs: response.latencyMs,
                status: 'success',
            });
            return response;
        } catch (error) {
            const aiError =
                error instanceof AiError
                    ? error
                    : new AiError(
                          'UNKNOWN',
                          error instanceof Error ? error.message : String(error),
                          error,
                      );
            await recordInteraction({
                userId: ctx.userId,
                feature: ctx.feature,
                model,
                promptTokens: 0,
                completionTokens: 0,
                latencyMs: null,
                status: 'error',
                errorCode: aiError.code,
            });
            logger.warn('ai.call_failed', {
                feature: ctx.feature,
                code: aiError.code,
                message: aiError.message,
            });
            throw aiError;
        }
    },
};

// ---------------------------------------------------------------------------
// Feature methods
// ---------------------------------------------------------------------------

const SHOPPING_CLASSIFY_CACHE_SCOPE = 'shopping_classify';

export interface ClassifyShoppingItemResult {
    category: ShoppingCategory;
    cached: boolean;
    model: string;
}

const isShoppingCategory = (s: unknown): s is ShoppingCategory =>
    typeof s === 'string' && (SHOPPING_CATEGORIES as readonly string[]).includes(s);

/**
 * Classify a single shopping item name into one of the supported categories.
 *
 * First consults the deterministic cache; only calls the model on cache miss.
 * After a fresh model call, persists the result so subsequent calls resolve in
 * sub-millisecond time. With normal usage the hit rate exceeds 90% after the
 * first month — the per-foyer OPENAI bill stays in the noise.
 */
export const classifyShoppingItem = async (
    name: string,
    ctx: { userId: string },
): Promise<ClassifyShoppingItemResult> => {
    const trimmed = name.trim();
    if (!trimmed) throw new AiError('BAD_REQUEST', 'name must not be empty');

    const hit = await lookupClassification(SHOPPING_CLASSIFY_CACHE_SCOPE, trimmed);
    if (hit && isShoppingCategory(hit.value)) {
        await recordInteraction({
            userId: ctx.userId,
            feature: 'shopping.classify',
            model: hit.model,
            promptTokens: 0,
            completionTokens: 0,
            latencyMs: null,
            status: 'cached',
        });
        return { category: hit.value, cached: true, model: hit.model };
    }

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: classifyShoppingItemSystemPrompt },
                { role: 'user', content: buildClassifyShoppingItemUserPrompt(trimmed) },
            ],
            temperature: 0,
            maxTokens: 32,
            jsonMode: true,
        },
        { userId: ctx.userId, feature: 'shopping.classify' },
    );

    const parsed = safeParseJson(response.content);
    const candidate = (parsed as { category?: unknown } | null)?.category;
    if (!isShoppingCategory(candidate)) {
        throw new AiError(
            'BAD_JSON',
            `Model returned unexpected category: ${JSON.stringify(candidate)}`,
        );
    }

    await saveClassification(SHOPPING_CLASSIFY_CACHE_SCOPE, trimmed, candidate, response.model);

    return { category: candidate, cached: false, model: response.model };
};

export interface ParsedShoppingItem {
    name: string;
    quantity: number | null;
    unit: string | null;
    category: ShoppingCategory;
}

/**
 * Convert a free-form FR sentence into a list of structured shopping items.
 *
 * The model is forced into JSON mode and the response is zod-shaped at parse
 * time. Items with unknown categories fall back to "Autre" silently — we'd
 * rather create a valid item than refuse the whole batch on one bad category.
 */
export const parseShoppingNaturalLanguage = async (
    text: string,
    ctx: { userId: string },
): Promise<ParsedShoppingItem[]> => {
    const trimmed = text.trim();
    if (!trimmed) throw new AiError('BAD_REQUEST', 'text must not be empty');
    if (trimmed.length > 1000) {
        throw new AiError('BAD_REQUEST', 'text is too long (max 1000 chars)');
    }

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: parseShoppingNaturalLanguageSystemPrompt },
                { role: 'user', content: buildParseShoppingNLUserPrompt(trimmed) },
            ],
            temperature: 0,
            maxTokens: 512,
            jsonMode: true,
        },
        { userId: ctx.userId, feature: 'shopping.parse_nl' },
    );

    const parsed = safeParseJson(response.content);
    const items = (parsed as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) {
        throw new AiError('BAD_JSON', 'Model did not return an "items" array');
    }

    const out: ParsedShoppingItem[] = [];
    for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        const name = typeof r.name === 'string' ? r.name.trim() : '';
        if (!name) continue;
        const quantity =
            typeof r.quantity === 'number' && Number.isFinite(r.quantity) && r.quantity > 0
                ? r.quantity
                : null;
        const unit = typeof r.unit === 'string' && r.unit.trim() ? r.unit.trim() : null;
        const category = isShoppingCategory(r.category) ? r.category : 'Autre';
        out.push({ name, quantity, unit, category });
    }

    return out;
};

// Models occasionally wrap JSON in markdown code fences (```json … ```), even
// when `response_format: json_object` is requested. Gemini does it more often
// than NVIDIA. Strip the fence wrapper (and any trailing text) before the
// brace-extraction fallback runs.
const stripMarkdownFences = (raw: string): string => {
    const trimmed = raw.trim();
    // ```json\n{...}\n```  or  ```\n{...}\n```
    const fenced = trimmed.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```\s*$/);
    if (fenced) return fenced[1].trim();
    return trimmed;
};

// Salvage a JSON document that was truncated mid-stream (typically when the
// model hits its max_tokens budget mid-array). Strategy:
//   1. Cut at the last "}," — guaranteed to be on an object boundary that's
//      followed by a separator, so everything up to and including that `}` is
//      a complete JSON value.
//   2. Walk the truncated chunk char by char, ignoring chars inside strings,
//      and track every unclosed `{` / `[` on a stack.
//   3. Append matching closers in LIFO order — that produces a syntactically
//      valid JSON document with one fewer element than the model intended.
// Returns the recovered string, or null if no recovery point exists.
const recoverTruncatedJson = (raw: string): string | null => {
    const cutAt = raw.lastIndexOf('},');
    if (cutAt === -1) return null;
    let truncated = raw.slice(0, cutAt + 1);

    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (const ch of truncated) {
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') stack.pop();
    }
    for (let i = stack.length - 1; i >= 0; i--) {
        truncated += stack[i] === '{' ? '}' : ']';
    }
    return truncated;
};

const safeParseJson = (content: string | null): unknown => {
    if (!content) {
        throw new AiError('BAD_JSON', 'Empty model response');
    }
    const stripped = stripMarkdownFences(content);
    let firstError: string | null = null;
    try {
        return JSON.parse(stripped);
    } catch (err) {
        firstError = err instanceof Error ? err.message : String(err);
        // Last-ditch attempt: some replies leak a leading sentence before
        // the JSON or trailing prose after. Pull the first {…} block out
        // (greedy match captures everything between the first `{` and last `}`).
        const m = stripped.match(/\{[\s\S]*\}/);
        if (m) {
            try {
                return JSON.parse(m[0]);
            } catch (err2) {
                firstError = err2 instanceof Error ? err2.message : String(err2);
                // fall through
            }
        }
        // Final fallback: salvage a truncated JSON by chopping the incomplete
        // tail and balancing the brackets. We lose at most one array element
        // but the rest of the payload becomes usable — much better than
        // bubbling BAD_JSON to the caller and discarding everything.
        const recovered = recoverTruncatedJson(stripped);
        if (recovered) {
            try {
                const parsed = JSON.parse(recovered);
                logger.info('ai.json_recovered_from_truncation', {
                    originalLength: content.length,
                    recoveredLength: recovered.length,
                });
                return parsed;
            } catch {
                // fall through to error log + throw
            }
        }
        // Extract context around the offending position so we can see whether
        // the JSON was truncated mid-token (max_tokens hit), poisoned by a bad
        // escape, or followed by trailing prose. JSON.parse errors include the
        // 0-based char offset in their message — pull it out with a regex.
        const positionMatch = firstError?.match(/position (\d+)/);
        const errorPosition = positionMatch ? parseInt(positionMatch[1], 10) : null;
        const errorContext =
            errorPosition !== null
                ? content.slice(
                      Math.max(0, errorPosition - 150),
                      Math.min(content.length, errorPosition + 150),
                  )
                : null;

        logger.warn('ai.bad_json_response', {
            head: content.slice(0, 800),
            tail: content.slice(-1500),
            length: content.length,
            parseError: firstError,
            errorPosition,
            errorContext,
        });
        throw new AiError('BAD_JSON', 'Model response was not valid JSON');
    }
};

// Re-export the type for callers that import from AIService.
export type { ShoppingCategory } from './prompts/shoppingPrompts';

// ---------------------------------------------------------------------------
// Clothing suggestions for kids going to school (dashboard widget)
// ---------------------------------------------------------------------------

export interface ClothingSuggestion {
    kidId: string;
    top: string[];
    bottom: string[];
    footwear: string[];
    accessories: string[];
    advice: string;
}

export interface ClothingSuggestionsResult {
    suggestions: ClothingSuggestion[];
    cached: boolean;
    model: string;
}

const CLOTHING_CACHE_TTL_MS = 30 * 60_000;

interface ClothingCacheEntry {
    at: number;
    /** Suggestions stored without kidId (kidIds are remapped on read). */
    template: Array<Omit<ClothingSuggestion, 'kidId'>>;
    model: string;
}

/**
 * In-memory cache keyed by (weather buckets × age buckets). Two parents in
 * the same city with same-aged kids share an entry — the dashboard refresh
 * costs zero tokens after the first call. Survives only the process; that's
 * fine for v1 (the AI feature is a nice-to-have, not authoritative).
 */
const clothingCache = new Map<string, ClothingCacheEntry>();

const ageBucket = (years: number): string => {
    if (years < 4) return '0-3';
    if (years < 7) return '4-6';
    if (years < 11) return '7-10';
    if (years < 15) return '11-14';
    return '15+';
};

const clothingCacheKey = (weather: WeatherSummary, kids: ClothingKidInput[]): string =>
    [
        weather.tempMinBucket,
        weather.precipBucket,
        weather.windyBucket,
        kids.map((k) => ageBucket(k.ageYears)).join(','),
    ].join('|');

const stringArray = (raw: unknown, max: number): string[] => {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const v of raw) {
        if (out.length >= max) break;
        if (typeof v !== 'string') continue;
        const trimmed = v.trim();
        if (trimmed) out.push(trimmed);
    }
    return out;
};

const sanitizeSuggestion = (raw: unknown, fallbackKidId: string): ClothingSuggestion | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const kidId = typeof r.kidId === 'string' && r.kidId.trim() ? r.kidId.trim() : fallbackKidId;
    const advice = typeof r.advice === 'string' ? r.advice.trim().slice(0, 200) : '';
    return {
        kidId,
        top: stringArray(r.top, 3),
        bottom: stringArray(r.bottom, 3),
        footwear: stringArray(r.footwear, 2),
        accessories: stringArray(r.accessories, 4),
        advice,
    };
};

/**
 * Generate a per-kid clothing suggestion for tomorrow morning. The AI sees
 * a bucketed weather summary plus each kid's age and (private to the request)
 * id; it returns one suggestion per kid in the same order.
 *
 * Caches by (weather buckets × age buckets) for 30 minutes. On a hit we
 * remap the cached template to the current kidIds so the response always
 * lines up with what the caller passed in.
 */
export const suggestClothingForKids = async (
    weather: WeatherSummary,
    kids: ClothingKidInput[],
    ctx: { userId: string },
): Promise<ClothingSuggestionsResult> => {
    if (kids.length === 0) {
        return { suggestions: [], cached: false, model: '' };
    }

    const key = clothingCacheKey(weather, kids);
    const now = Date.now();
    const hit = clothingCache.get(key);
    if (hit && now - hit.at < CLOTHING_CACHE_TTL_MS && hit.template.length === kids.length) {
        await recordInteraction({
            userId: ctx.userId,
            feature: 'dashboard.clothing_suggest',
            model: hit.model,
            promptTokens: 0,
            completionTokens: 0,
            latencyMs: null,
            status: 'cached',
        });
        const suggestions = hit.template.map((tpl, i) => ({ ...tpl, kidId: kids[i].id }));
        return { suggestions, cached: true, model: hit.model };
    }

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: clothingSuggestionsSystemPrompt },
                { role: 'user', content: buildClothingUserPrompt(weather, kids) },
            ],
            temperature: 0.4,
            maxTokens: 600,
            jsonMode: true,
        },
        { userId: ctx.userId, feature: 'dashboard.clothing_suggest' },
    );

    const parsed = safeParseJson(response.content);
    const rawList = (parsed as { suggestions?: unknown } | null)?.suggestions;
    if (!Array.isArray(rawList)) {
        throw new AiError('BAD_JSON', 'Model did not return a "suggestions" array');
    }

    // Build a map by kidId for resilience: the model occasionally reorders.
    const byId = new Map<string, ClothingSuggestion>();
    for (let i = 0; i < rawList.length; i += 1) {
        const fallback = kids[i]?.id ?? '';
        const sanitized = sanitizeSuggestion(rawList[i], fallback);
        if (sanitized) byId.set(sanitized.kidId, sanitized);
    }

    const suggestions: ClothingSuggestion[] = kids.map(
        (k) =>
            byId.get(k.id) ?? {
                kidId: k.id,
                top: [],
                bottom: [],
                footwear: [],
                accessories: [],
                advice: '',
            },
    );

    // Store template (no kidId) so it survives across kids with the same age
    // bucket distribution.
    clothingCache.set(key, {
        at: now,
        template: suggestions.map(({ kidId: _kidId, ...rest }) => rest),
        model: response.model,
    });

    return { suggestions, cached: false, model: response.model };
};

/** Test helper: clears the in-memory clothing-suggestion cache. */
export const _resetClothingCache = (): void => {
    clothingCache.clear();
};

// ---------------------------------------------------------------------------
// Recipe generation from on-hand ingredients + family preferences
// ---------------------------------------------------------------------------

const RECIPE_CATEGORIES_VALID = new Set(['Entrée', 'Plat', 'Dessert', 'Snack']);
const RECIPE_DIFFICULTY_VALID = new Set(['Facile', 'Moyen', 'Difficile']);

export interface GeneratedRecipe {
    name: string;
    category: 'Entrée' | 'Plat' | 'Dessert' | 'Snack';
    description: string;
    ingredients: string[];
    instructions: string[];
    prep_time: number;
    cook_time: number;
    servings: number;
    difficulty: 'Facile' | 'Moyen' | 'Difficile';
    tags: string[];
}

export interface GenerateRecipesResult {
    recipes: GeneratedRecipe[];
    cached: boolean;
    model: string;
}

const clampInt = (raw: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
};

const sanitizeRecipe = (raw: unknown): GeneratedRecipe | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 120) : '';
    if (!name) return null;

    const category = (
        typeof r.category === 'string' && RECIPE_CATEGORIES_VALID.has(r.category)
            ? r.category
            : 'Plat'
    ) as GeneratedRecipe['category'];

    const difficulty = (
        typeof r.difficulty === 'string' && RECIPE_DIFFICULTY_VALID.has(r.difficulty)
            ? r.difficulty
            : 'Facile'
    ) as GeneratedRecipe['difficulty'];

    const ingredients = stringArray(r.ingredients, 15);
    const instructions = stringArray(r.instructions, 12);
    if (ingredients.length < 2 || instructions.length < 2) return null;

    return {
        name,
        category,
        description: typeof r.description === 'string' ? r.description.trim().slice(0, 200) : '',
        ingredients,
        instructions,
        prep_time: clampInt(r.prep_time, 10, 0, 360),
        cook_time: clampInt(r.cook_time, 15, 0, 600),
        servings: clampInt(r.servings, 4, 1, 20),
        difficulty,
        tags: stringArray(r.tags, 5),
    };
};

/**
 * Generate up to 3 recipe propositions from a list of on-hand ingredients,
 * scoped to the family members listed (their allergies act as hard constraints
 * via the system prompt). The output JSON shape mirrors `Recipe` so the
 * client can POST any chosen recipe straight to /api/recipes without
 * transformation.
 *
 * No cache: the user expects variety on each call, and the cache key would
 * cover too many dimensions (ingredients set × members × preferences).
 * Temperature ≈ 0.7 keeps the suggestions distinct across runs.
 */
export const generateRecipesFromIngredients = async (
    input: RecipeGenerationInput,
    ctx: { userId: string },
): Promise<GenerateRecipesResult> => {
    if (input.ingredients.length === 0) {
        throw new AiError('BAD_REQUEST', 'At least one ingredient is required');
    }
    if (input.ingredients.length > 30) {
        throw new AiError('BAD_REQUEST', 'Too many ingredients (max 30)');
    }
    if (input.count < 1 || input.count > 3) {
        throw new AiError('BAD_REQUEST', 'count must be 1, 2 or 3');
    }

    // Heavier model gives noticeably better recipes (richer instructions,
    // better cuisine grounding). 70B is what the config calls "heavy".
    const cfg = getAiConfig();
    const model = cfg.models.heavy;

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: recipeGenerationSystemPrompt },
                { role: 'user', content: buildRecipeGenerationUserPrompt(input) },
            ],
            temperature: 0.7,
            // Roughly 250 tokens per recipe with margin.
            maxTokens: 300 * input.count + 200,
            jsonMode: true,
            model,
        },
        { userId: ctx.userId, feature: 'recipes.generate', model },
    );

    const parsed = safeParseJson(response.content);
    const rawList = (parsed as { recipes?: unknown } | null)?.recipes;
    if (!Array.isArray(rawList)) {
        throw new AiError('BAD_JSON', 'Model did not return a "recipes" array');
    }

    const recipes: GeneratedRecipe[] = [];
    for (const raw of rawList) {
        const sanitized = sanitizeRecipe(raw);
        if (sanitized) recipes.push(sanitized);
        if (recipes.length >= input.count) break;
    }

    if (recipes.length === 0) {
        throw new AiError('BAD_JSON', 'Model did not return any usable recipe');
    }

    return { recipes, cached: false, model: response.model };
};

/** Re-export so routes can build the input shape with proper types. */
export type { RecipeGenerationInput, RecipeMemberInput } from './prompts/recipePrompts';

// ---------------------------------------------------------------------------
// Weekly nutrition analysis (Meal Planning)
// ---------------------------------------------------------------------------

const NUTRITION_VERDICTS_VALID = new Set(['Excellent', 'Bon', 'À améliorer', 'Déséquilibré']);

export interface NutritionRecommendation {
    title: string;
    detail: string;
}

export interface WeeklyNutritionAnalysis {
    score: number;
    verdict: 'Excellent' | 'Bon' | 'À améliorer' | 'Déséquilibré';
    summary: string;
    strengths: string[];
    weaknesses: string[];
    missingFoodGroups: string[];
    recommendations: NutritionRecommendation[];
}

export interface AnalyzeWeeklyMealsResult {
    analysis: WeeklyNutritionAnalysis;
    mealsAnalyzed: number;
    model: string;
}

const sanitizeRecommendation = (raw: unknown): NutritionRecommendation | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 80) : '';
    const detail = typeof r.detail === 'string' ? r.detail.trim().slice(0, 220) : '';
    if (!title || !detail) return null;
    return { title, detail };
};

const sanitizeAnalysis = (raw: unknown): WeeklyNutritionAnalysis | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    const scoreRaw = typeof r.score === 'number' ? r.score : Number(r.score);
    const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;

    const verdict = (
        typeof r.verdict === 'string' && NUTRITION_VERDICTS_VALID.has(r.verdict)
            ? r.verdict
            : 'À améliorer'
    ) as WeeklyNutritionAnalysis['verdict'];

    const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 600) : '';
    const strengths = stringArray(r.strengths, 6);
    const weaknesses = stringArray(r.weaknesses, 6);
    const missingFoodGroups = stringArray(r.missingFoodGroups, 8);

    const recoRaw = Array.isArray(r.recommendations) ? r.recommendations : [];
    const recommendations: NutritionRecommendation[] = [];
    for (const item of recoRaw) {
        if (recommendations.length >= 6) break;
        const sanitized = sanitizeRecommendation(item);
        if (sanitized) recommendations.push(sanitized);
    }

    if (
        !summary &&
        strengths.length === 0 &&
        weaknesses.length === 0 &&
        recommendations.length === 0
    ) {
        return null;
    }

    return { score, verdict, summary, strengths, weaknesses, missingFoodGroups, recommendations };
};

/**
 * Produce a structured nutritional analysis of one week of planned meals.
 *
 * Uses the heavy model — analysing 30+ meal lines and producing prioritised
 * advice benefits noticeably from a larger model. No cache: the same week can
 * change between calls (the user is iterating on the planning), and the input
 * is too large for a meaningful cache key.
 */
export const analyzeWeeklyMeals = async (
    input: NutritionAnalysisInput,
    ctx: { userId: string },
): Promise<AnalyzeWeeklyMealsResult> => {
    if (input.meals.length > 80) {
        // Cap to keep token cost predictable. 7 days × 5 meals × 2 = plenty.
        input = { ...input, meals: input.meals.slice(0, 80) };
    }

    const cfg = getAiConfig();
    const model = cfg.models.heavy;

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: nutritionWeeklySystemPrompt },
                { role: 'user', content: buildNutritionWeeklyUserPrompt(input) },
            ],
            temperature: 0.3,
            maxTokens: 900,
            jsonMode: true,
            model,
        },
        { userId: ctx.userId, feature: 'meals.analyze_week', model },
    );

    const parsed = safeParseJson(response.content);
    const analysis = sanitizeAnalysis(parsed);
    if (!analysis) {
        throw new AiError('BAD_JSON', 'Model did not return a usable analysis');
    }

    return { analysis, mealsAnalyzed: input.meals.length, model: response.model };
};

/** Re-export so routes can build the input shape with proper types. */
export type { NutritionAnalysisInput, PlannedMealLine } from './prompts/nutritionPrompts';

// ---------------------------------------------------------------------------
// Lunchbox idea generation (MealPlanning page)
// ---------------------------------------------------------------------------

export interface LunchboxIdea {
    main: string;
    fruit: string;
    snack: string;
    drink: string;
    reasoning: string;
    warnings: string[];
}

export interface GenerateLunchboxIdeasResult {
    ideas: LunchboxIdea[];
    cached: boolean;
    model: string;
}

const sanitizeLunchboxIdea = (raw: unknown): LunchboxIdea | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const trim = (v: unknown, max: number): string =>
        typeof v === 'string' ? v.trim().slice(0, max) : '';

    const main = trim(r.main, 100);
    const fruit = trim(r.fruit, 80);
    const snack = trim(r.snack, 80);
    const drink = trim(r.drink, 60);
    const reasoning = trim(r.reasoning, 160);

    // An idea is only useful if it fills at least one of the four core slots —
    // otherwise the form has nothing to pre-fill and the user wasted a call.
    if (!main && !fruit && !snack && !drink) return null;

    return {
        main,
        fruit,
        snack,
        drink,
        reasoning,
        warnings: stringArray(r.warnings, 2),
    };
};

/**
 * Generate up to 3 lunchbox ideas from on-hand items + child profile + the
 * eating location. The output mirrors the lunchbox form so the UI can
 * one-click pre-fill any of the three suggestions.
 *
 * No cache: the same household will iterate (the fridge changes each day) and
 * the input combines too many small lists to make a reusable cache key worth
 * the complexity. The heavy model is overkill — default model is plenty for a
 * 4-slot proposal.
 */
export const generateLunchboxIdeas = async (
    input: LunchboxGenerationInput,
    ctx: { userId: string },
): Promise<GenerateLunchboxIdeasResult> => {
    if (input.count < 1 || input.count > 3) {
        throw new AiError('BAD_REQUEST', 'count must be 1, 2 or 3');
    }

    const hasAny =
        (input.availableMains?.length ?? 0) +
            (input.availableFruits?.length ?? 0) +
            (input.availableSnacks?.length ?? 0) +
            (input.availableDrinks?.length ?? 0) >
        0;
    if (!hasAny) {
        throw new AiError(
            'BAD_REQUEST',
            'Liste au moins un aliment disponible (fruit, snack, plat ou boisson).',
        );
    }

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: lunchboxGenerationSystemPrompt },
                { role: 'user', content: buildLunchboxGenerationUserPrompt(input) },
            ],
            temperature: 0.6,
            // ~180 tokens per idea with margin for warnings + reasoning.
            maxTokens: 220 * input.count + 120,
            jsonMode: true,
        },
        { userId: ctx.userId, feature: 'meals.lunchbox_generate' },
    );

    const parsed = safeParseJson(response.content);
    const rawList = (parsed as { ideas?: unknown } | null)?.ideas;
    if (!Array.isArray(rawList)) {
        throw new AiError('BAD_JSON', 'Model did not return an "ideas" array');
    }

    const ideas: LunchboxIdea[] = [];
    for (const raw of rawList) {
        const sanitized = sanitizeLunchboxIdea(raw);
        if (sanitized) ideas.push(sanitized);
        if (ideas.length >= input.count) break;
    }

    if (ideas.length === 0) {
        throw new AiError('BAD_JSON', 'Model did not return any usable lunchbox idea');
    }

    return { ideas, cached: false, model: response.model };
};

/** Re-export so routes can build the input shape with proper types. */
export type {
    LunchboxGenerationInput,
    LunchboxLocation,
    LunchboxMemberInput,
} from './prompts/lunchboxPrompts';

// ---------------------------------------------------------------------------
// Receipt scanning (vision) — Budget page "Scanner facture"
// ---------------------------------------------------------------------------

const RECEIPT_CONFIDENCE_VALID = new Set(['high', 'medium', 'low']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_REASONABLE_AMOUNT = 1_000_000_000; // 1 billion in the user currency — anything more is a hallucination.

export interface ExtractReceiptResult {
    extraction: ExtractedReceipt;
    model: string;
}

const sanitizeExtractedReceipt = (raw: unknown): ExtractedReceipt | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    let amount: number | null = null;
    const rawAmount = typeof r.amount === 'number' ? r.amount : Number(r.amount);
    if (Number.isFinite(rawAmount) && rawAmount > 0 && rawAmount < MAX_REASONABLE_AMOUNT) {
        amount = Math.round(rawAmount * 100) / 100;
    }

    let currency: string | null = null;
    if (typeof r.currency === 'string') {
        const cleaned = r.currency.trim().toUpperCase();
        if (ISO_CURRENCY_RE.test(cleaned)) currency = cleaned;
    }

    let date: string | null = null;
    if (typeof r.date === 'string' && ISO_DATE_RE.test(r.date.trim())) {
        date = r.date.trim();
    }

    const merchant =
        typeof r.merchant === 'string' && r.merchant.trim() ? r.merchant.trim().slice(0, 80) : null;

    const categoryRaw = typeof r.category === 'string' ? r.category.trim().slice(0, 50) : '';
    const category = categoryRaw || 'Autre';

    const description = typeof r.description === 'string' ? r.description.trim().slice(0, 200) : '';

    const confidenceRaw = typeof r.confidence === 'string' ? r.confidence.trim().toLowerCase() : '';
    const confidence = (
        RECEIPT_CONFIDENCE_VALID.has(confidenceRaw) ? confidenceRaw : 'low'
    ) as ExtractedReceipt['confidence'];

    return {
        amount,
        currency,
        date,
        merchant,
        category,
        description,
        confidence,
        warnings: stringArray(r.warnings, 3),
    };
};

/**
 * Extract the fields needed to create a budget entry from a receipt photo.
 * Uses the configured vision model (cfg.models.vision). The image is sent
 * inline as a base64 data URL in the user message content array — the
 * provider sees a standard OpenAI-style multimodal payload.
 *
 * Returns sanitised values: amount in a reasonable range, ISO date string or
 * null, ISO 4217 currency or null, confidence bounded to the three allowed
 * labels. The route never persists the image itself; this method receives the
 * already-encoded data URL.
 */
export const extractBudgetEntryFromReceipt = async (
    input: ReceiptExtractionInput,
    ctx: { userId: string },
): Promise<ExtractReceiptResult> => {
    if (!input.imageDataUrl.startsWith('data:image/')) {
        throw new AiError('BAD_REQUEST', 'imageDataUrl must be a data:image/* URL');
    }

    const cfg = getAiConfig();
    const model = cfg.models.vision;

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: receiptExtractionSystemPrompt },
                { role: 'user', content: buildReceiptExtractionUserMessage(input) },
            ],
            temperature: 0,
            maxTokens: 500,
            jsonMode: true,
            model,
        },
        { userId: ctx.userId, feature: 'budget.scan_receipt', model },
    );

    const parsed = safeParseJson(response.content);
    const extraction = sanitizeExtractedReceipt(parsed);
    if (!extraction) {
        throw new AiError('BAD_JSON', 'Model did not return a usable receipt extraction');
    }

    return { extraction, model: response.model };
};

/** Re-export so routes can build the input shape with proper types. */
export type { ExtractedReceipt, ReceiptExtractionInput } from './prompts/receiptPrompts';

// ---------------------------------------------------------------------------
// Budget month analysis — Budget page "Analyser avec IA"
// ---------------------------------------------------------------------------

const BUDGET_VERDICTS_VALID = new Set(['Excellent', 'Sain', 'À surveiller', 'Critique']);

export interface BudgetSavingsOpportunity {
    category: string;
    estimatedAmount: number;
    how: string;
}

export interface BudgetRecommendation {
    title: string;
    detail: string;
}

export interface BudgetAnalysis {
    score: number;
    verdict: 'Excellent' | 'Sain' | 'À surveiller' | 'Critique';
    summary: string;
    strengths: string[];
    weaknesses: string[];
    savingsOpportunities: BudgetSavingsOpportunity[];
    recommendations: BudgetRecommendation[];
    alerts: string[];
}

export interface AnalyzeBudgetResult {
    analysis: BudgetAnalysis;
    model: string;
}

const sanitizeSavingsOpportunity = (raw: unknown): BudgetSavingsOpportunity | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const category = typeof r.category === 'string' ? r.category.trim().slice(0, 50) : '';
    const amountRaw =
        typeof r.estimatedAmount === 'number' ? r.estimatedAmount : Number(r.estimatedAmount);
    const amount =
        Number.isFinite(amountRaw) && amountRaw > 0 && amountRaw < 1_000_000_000
            ? Math.round(amountRaw * 100) / 100
            : null;
    const how = typeof r.how === 'string' ? r.how.trim().slice(0, 220) : '';
    if (!category || amount === null || !how) return null;
    return { category, estimatedAmount: amount, how };
};

const sanitizeBudgetRecommendation = (raw: unknown): BudgetRecommendation | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 80) : '';
    const detail = typeof r.detail === 'string' ? r.detail.trim().slice(0, 240) : '';
    if (!title || !detail) return null;
    return { title, detail };
};

const sanitizeBudgetAnalysis = (raw: unknown): BudgetAnalysis | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    const scoreRaw = typeof r.score === 'number' ? r.score : Number(r.score);
    const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;

    const verdict = (
        typeof r.verdict === 'string' && BUDGET_VERDICTS_VALID.has(r.verdict)
            ? r.verdict
            : 'À surveiller'
    ) as BudgetAnalysis['verdict'];

    const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 400) : '';
    const strengths = stringArray(r.strengths, 5);
    const weaknesses = stringArray(r.weaknesses, 5);
    const alerts = stringArray(r.alerts, 3);

    const savingsRaw = Array.isArray(r.savingsOpportunities) ? r.savingsOpportunities : [];
    const savingsOpportunities: BudgetSavingsOpportunity[] = [];
    for (const item of savingsRaw) {
        if (savingsOpportunities.length >= 4) break;
        const s = sanitizeSavingsOpportunity(item);
        if (s) savingsOpportunities.push(s);
    }

    const recoRaw = Array.isArray(r.recommendations) ? r.recommendations : [];
    const recommendations: BudgetRecommendation[] = [];
    for (const item of recoRaw) {
        if (recommendations.length >= 5) break;
        const reco = sanitizeBudgetRecommendation(item);
        if (reco) recommendations.push(reco);
    }

    if (
        !summary &&
        strengths.length === 0 &&
        weaknesses.length === 0 &&
        recommendations.length === 0 &&
        alerts.length === 0
    ) {
        return null;
    }

    return {
        score,
        verdict,
        summary,
        strengths,
        weaknesses,
        savingsOpportunities,
        recommendations,
        alerts,
    };
};

/**
 * Produce an actionable analysis of one month of budget data, with a 3-month
 * trend for context. Uses the heavy model: synthesising category breakdowns +
 * limits + per-member spending + anomalies into prioritised advice benefits
 * meaningfully from a larger model.
 *
 * No cache: the input changes on every entry edit, and a cache key covering
 * that surface would basically never hit.
 */
export const analyzeBudgetMonth = async (
    input: BudgetAnalysisInput,
    ctx: { userId: string },
): Promise<AnalyzeBudgetResult> => {
    const cfg = getAiConfig();
    const model = cfg.models.heavy;

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: budgetAnalysisSystemPrompt },
                { role: 'user', content: buildBudgetAnalysisUserPrompt(input) },
            ],
            temperature: 0.3,
            maxTokens: 1100,
            jsonMode: true,
            model,
        },
        { userId: ctx.userId, feature: 'budget.analyze_month', model },
    );

    const parsed = safeParseJson(response.content);
    const analysis = sanitizeBudgetAnalysis(parsed);
    if (!analysis) {
        throw new AiError('BAD_JSON', 'Model did not return a usable budget analysis');
    }

    return { analysis, model: response.model };
};

/** Re-export so routes can build the input shape with proper types. */
export type {
    BudgetAnalysisInput,
    BudgetMonthSnapshot,
    BudgetTrendPoint,
} from './prompts/budgetAnalysisPrompts';

// ---------------------------------------------------------------------------
// Gardening tips — Garden page "Conseils IA"
// ---------------------------------------------------------------------------

export interface GardeningTip {
    title: string;
    detail: string;
    timing: string;
}

export interface GardeningTips {
    summary: string;
    tips: GardeningTip[];
    wateringSchedule: string;
    warnings: string[];
}

export interface GenerateGardeningTipsResult {
    tips: GardeningTips;
    model: string;
}

const sanitizeGardeningTip = (raw: unknown): GardeningTip | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 80) : '';
    const detail = typeof r.detail === 'string' ? r.detail.trim().slice(0, 220) : '';
    const timing = typeof r.timing === 'string' ? r.timing.trim().slice(0, 80) : '';
    if (!title || !detail) return null;
    return { title, detail, timing };
};

const sanitizeGardeningTips = (raw: unknown): GardeningTips | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 400) : '';
    const wateringSchedule =
        typeof r.wateringSchedule === 'string' ? r.wateringSchedule.trim().slice(0, 220) : '';
    const warnings = stringArray(r.warnings, 4);

    const tipsRaw = Array.isArray(r.tips) ? r.tips : [];
    const tips: GardeningTip[] = [];
    for (const item of tipsRaw) {
        if (tips.length >= 6) break;
        const tip = sanitizeGardeningTip(item);
        if (tip) tips.push(tip);
    }

    if (tips.length === 0 && !summary && warnings.length === 0) {
        return null;
    }

    return { summary, tips, wateringSchedule, warnings };
};

/**
 * Produce season-aware gardening advice for one zone + its plants. Default
 * model: the task is short and well-bounded, no need for the heavy model.
 *
 * No cache: the input (plants, season, zone metadata) varies per zone and the
 * advice is cheap enough to regenerate on demand.
 */
export const generateGardeningTips = async (
    input: GardeningTipsInput,
    ctx: { userId: string },
): Promise<GenerateGardeningTipsResult> => {
    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: gardeningTipsSystemPrompt },
                { role: 'user', content: buildGardeningTipsUserPrompt(input) },
            ],
            temperature: 0.5,
            maxTokens: 700,
            jsonMode: true,
        },
        { userId: ctx.userId, feature: 'garden.tips' },
    );

    const parsed = safeParseJson(response.content);
    const tips = sanitizeGardeningTips(parsed);
    if (!tips) {
        throw new AiError('BAD_JSON', 'Model did not return usable gardening tips');
    }

    return { tips, model: response.model };
};

/** Re-export so routes can build the input shape with proper types. */
export type { GardeningTipsInput, GardeningPlantInput } from './prompts/gardeningPrompts';

// ---------------------------------------------------------------------------
// Vacation plan generation — Vacations page "Generate AI plan"
// ---------------------------------------------------------------------------

const ITINERARY_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

export interface PlannedActivity {
    title: string;
    time: string | null;
    duration_min: number | null;
    cost: number | null;
    location: string | null;
    notes: string | null;
}

export interface PlannedMealSuggestion {
    meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    suggestion: string;
    restaurant: string | null;
    cost: number | null;
}

export interface PlannedDay {
    dayNumber: number;
    date: string;
    theme: string;
    activities: PlannedActivity[];
    meals_suggestions: PlannedMealSuggestion[];
    estimated_cost: number | null;
    transport_notes: string | null;
    notes: string | null;
}

export interface VacationPlan {
    summary: string;
    totalEstimatedCost: number | null;
    tips: string[];
    days: PlannedDay[];
}

export interface GenerateVacationPlanResult {
    plan: VacationPlan;
    model: string;
}

const TIME_RE = /^\d{2}:\d{2}$/;
const ISO_DATE_RE_INTERNAL = /^\d{4}-\d{2}-\d{2}$/;

const sanitizeActivity = (raw: unknown): PlannedActivity | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 120) : '';
    if (!title) return null;
    const time = typeof r.time === 'string' && TIME_RE.test(r.time.trim()) ? r.time.trim() : null;
    const durationRaw =
        typeof r.duration_min === 'number' ? r.duration_min : Number(r.duration_min);
    const duration_min =
        Number.isFinite(durationRaw) && durationRaw > 0 && durationRaw < 1440
            ? Math.round(durationRaw)
            : null;
    const costRaw = typeof r.cost === 'number' ? r.cost : Number(r.cost);
    const cost =
        Number.isFinite(costRaw) && costRaw >= 0 && costRaw < 1_000_000
            ? Math.round(costRaw * 100) / 100
            : null;
    const location =
        typeof r.location === 'string' && r.location.trim()
            ? r.location.trim().slice(0, 120)
            : null;
    const notes =
        typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 220) : null;
    return { title, time, duration_min, cost, location, notes };
};

const sanitizeMealSuggestion = (raw: unknown): PlannedMealSuggestion | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const meal =
        typeof r.meal === 'string' && ITINERARY_MEAL_TYPES.has(r.meal)
            ? (r.meal as PlannedMealSuggestion['meal'])
            : null;
    if (!meal) return null;
    const suggestion = typeof r.suggestion === 'string' ? r.suggestion.trim().slice(0, 200) : '';
    if (!suggestion) return null;
    const restaurant =
        typeof r.restaurant === 'string' && r.restaurant.trim()
            ? r.restaurant.trim().slice(0, 120)
            : null;
    const costRaw = typeof r.cost === 'number' ? r.cost : Number(r.cost);
    const cost =
        Number.isFinite(costRaw) && costRaw >= 0 && costRaw < 1_000_000
            ? Math.round(costRaw * 100) / 100
            : null;
    return { meal, suggestion, restaurant, cost };
};

const sanitizePlannedDay = (raw: unknown, fallbackDayNumber: number): PlannedDay | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const dayNumberRaw = typeof r.dayNumber === 'number' ? r.dayNumber : Number(r.dayNumber);
    const dayNumber =
        Number.isFinite(dayNumberRaw) && dayNumberRaw > 0
            ? Math.round(dayNumberRaw)
            : fallbackDayNumber;
    const date =
        typeof r.date === 'string' && ISO_DATE_RE_INTERNAL.test(r.date.trim()) ? r.date.trim() : '';
    if (!date) return null;
    const theme = typeof r.theme === 'string' ? r.theme.trim().slice(0, 80) : '';

    const activities: PlannedActivity[] = [];
    if (Array.isArray(r.activities)) {
        for (const a of r.activities) {
            const s = sanitizeActivity(a);
            if (s) activities.push(s);
            if (activities.length >= 8) break;
        }
    }
    const meals: PlannedMealSuggestion[] = [];
    if (Array.isArray(r.meals_suggestions)) {
        for (const m of r.meals_suggestions) {
            const s = sanitizeMealSuggestion(m);
            if (s) meals.push(s);
            if (meals.length >= 4) break;
        }
    }
    const estimatedRaw =
        typeof r.estimated_cost === 'number' ? r.estimated_cost : Number(r.estimated_cost);
    const estimated_cost =
        Number.isFinite(estimatedRaw) && estimatedRaw >= 0 && estimatedRaw < 1_000_000
            ? Math.round(estimatedRaw * 100) / 100
            : null;
    const transport_notes =
        typeof r.transport_notes === 'string' && r.transport_notes.trim()
            ? r.transport_notes.trim().slice(0, 200)
            : null;
    const notes =
        typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 200) : null;

    return {
        dayNumber,
        date,
        theme,
        activities,
        meals_suggestions: meals,
        estimated_cost,
        transport_notes,
        notes,
    };
};

const sanitizeVacationPlan = (raw: unknown, expectedDays: number): VacationPlan | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 400) : '';
    const totalRaw =
        typeof r.totalEstimatedCost === 'number'
            ? r.totalEstimatedCost
            : Number(r.totalEstimatedCost);
    const totalEstimatedCost =
        Number.isFinite(totalRaw) && totalRaw >= 0 && totalRaw < 100_000_000
            ? Math.round(totalRaw * 100) / 100
            : null;
    const tips = stringArray(r.tips, 6);

    const rawDays = Array.isArray(r.days) ? r.days : [];
    const days: PlannedDay[] = [];
    for (let i = 0; i < rawDays.length && days.length < expectedDays; i += 1) {
        const sanitized = sanitizePlannedDay(rawDays[i], i + 1);
        if (sanitized) days.push(sanitized);
    }
    if (days.length === 0) return null;

    return { summary, totalEstimatedCost, tips, days };
};

/**
 * Generate a complete day-by-day itinerary for a vacation. Uses the heavy
 * model — the model needs to reason about geography, ages, budget allocation
 * and produce well-structured output across N days. Each day generates roughly
 * 400 tokens of output, so we scale maxTokens proportionally.
 *
 * No cache: every trip is unique by definition.
 */
export const generateVacationPlan = async (
    input: VacationPlanInput,
    ctx: { userId: string },
): Promise<GenerateVacationPlanResult> => {
    if (input.days < 1 || input.days > 30) {
        throw new AiError('BAD_REQUEST', 'days must be between 1 and 30');
    }

    const cfg = getAiConfig();
    const model = cfg.models.heavy;

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: vacationPlanSystemPrompt },
                { role: 'user', content: buildVacationPlanUserPrompt(input) },
            ],
            temperature: 0.6,
            // ~450 tokens per day with margin for summary + tips.
            maxTokens: 450 * input.days + 400,
            jsonMode: true,
            model,
        },
        { userId: ctx.userId, feature: 'vacations.plan_generate', model },
    );

    const parsed = safeParseJson(response.content);
    const plan = sanitizeVacationPlan(parsed, input.days);
    if (!plan) {
        throw new AiError('BAD_JSON', 'Model did not return a usable vacation plan');
    }
    return { plan, model: response.model };
};

// ---------------------------------------------------------------------------
// Vacation luggage generation
// ---------------------------------------------------------------------------

const LUGGAGE_CATEGORIES_VALID = new Set([
    'clothing',
    'toiletries',
    'documents',
    'health',
    'electronics',
    'kids',
    'misc',
]);

export type LuggageCategory =
    | 'clothing'
    | 'toiletries'
    | 'documents'
    | 'health'
    | 'electronics'
    | 'kids'
    | 'misc';

export interface GeneratedLuggageItem {
    owner: string; // "shared" or a participant id
    category: LuggageCategory;
    item: string;
    quantity: number;
    notes: string | null;
}

export interface GeneratedLuggage {
    items: GeneratedLuggageItem[];
    warnings: string[];
}

export interface GenerateLuggageResult {
    luggage: GeneratedLuggage;
    model: string;
}

const sanitizeLuggageItem = (
    raw: unknown,
    validOwnerIds: Set<string>,
): GeneratedLuggageItem | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const ownerRaw = typeof r.owner === 'string' ? r.owner.trim() : '';
    const owner = ownerRaw === 'shared' || validOwnerIds.has(ownerRaw) ? ownerRaw : 'shared';
    const category =
        typeof r.category === 'string' && LUGGAGE_CATEGORIES_VALID.has(r.category)
            ? (r.category as LuggageCategory)
            : 'misc';
    const item = typeof r.item === 'string' ? r.item.trim().slice(0, 160) : '';
    if (!item) return null;
    const qtyRaw = typeof r.quantity === 'number' ? r.quantity : Number(r.quantity);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 && qtyRaw < 100 ? Math.round(qtyRaw) : 1;
    const notes =
        typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 200) : null;
    return { owner, category, item, quantity, notes };
};

const sanitizeLuggage = (raw: unknown, validOwnerIds: Set<string>): GeneratedLuggage | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const rawItems = Array.isArray(r.items) ? r.items : [];
    const items: GeneratedLuggageItem[] = [];
    for (const it of rawItems) {
        const sanitized = sanitizeLuggageItem(it, validOwnerIds);
        if (sanitized) items.push(sanitized);
        if (items.length >= 250) break; // hard cap to keep DB inserts sane
    }
    if (items.length === 0) return null;
    const warnings = stringArray(r.warnings, 5);
    return { items, warnings };
};

/**
 * Generate a packing checklist for a vacation: per-participant items + a
 * shared family list. Uses the default model — the task is structured but
 * doesn't need heavy reasoning; cost-per-trip stays minimal.
 */
export const generateVacationLuggage = async (
    input: VacationLuggageInput,
    ctx: { userId: string },
): Promise<GenerateLuggageResult> => {
    if (input.days < 1 || input.days > 30) {
        throw new AiError('BAD_REQUEST', 'days must be between 1 and 30');
    }

    const validOwnerIds = new Set(input.participants.map((p) => p.id));

    const response = await AIService.chat(
        {
            messages: [
                { role: 'system', content: vacationLuggageSystemPrompt },
                { role: 'user', content: buildVacationLuggageUserPrompt(input) },
            ],
            temperature: 0.4,
            // ~25 items per person + 12 shared, ~12 tokens each = generous margin.
            // Each item is ~30 tokens of JSON; the prompt asks for 8-15 items
            // per person + 6-12 shared. For a family of 4 that means
            // ~1500-2000 tokens of actual content, and providers (notably
            // Gemini) need real headroom to finish closing braces — too tight
            // a budget produces silent mid-array truncation and BAD_JSON
            // downstream. 1200 + 600 × people, capped at 6000, gives ~50%
            // margin even on the high end.
            maxTokens: Math.min(8000, 1500 + input.participants.length * 800),
            jsonMode: true,
        },
        { userId: ctx.userId, feature: 'vacations.luggage_generate' },
    );

    // Capture finishReason BEFORE the parser runs. If `length`, the JSON is
    // truncated and any parse error is downstream of a token-budget issue —
    // no point hunting an escape bug. If `stop`, the model thinks it's done
    // and the content should be valid; a parse error then points at something
    // the prompt didn't constrain.
    logger.info('ai.luggage_response_meta', {
        finishReason: response.finishReason,
        contentLength: response.content?.length ?? 0,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
    });

    const parsed = safeParseJson(response.content);
    const luggage = sanitizeLuggage(parsed, validOwnerIds);
    if (!luggage) {
        throw new AiError('BAD_JSON', 'Model did not return any luggage item');
    }
    return { luggage, model: response.model };
};

/** Re-export shared types so routes/tests can import them from AIService. */
export type { VacationPlanInput, VacationPlanParticipant } from './prompts/vacationPlanPrompts';
export type {
    VacationLuggageInput,
    VacationLuggageParticipant,
} from './prompts/vacationLuggagePrompts';

/** Exposed for tests that swap in a mock provider. */
export const setAiProviderForTests = (provider: BaseProvider | null): void => {
    cachedProvider = provider;
};
