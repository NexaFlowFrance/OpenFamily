import { query } from '../../db';
import { decryptCredentials } from '../../utils/crypto';
import { safeFetch } from '../../lib/safeFetch';
import { ingredientLine, instructionLine } from '../../lib/recipeLines';

// Outbound Tandoor calls go through safeFetch: redirects are re-validated on every
// hop (no SSRF bypass via a 302 to an internal/metadata address) and each request
// is bounded by a hard timeout.
const TANDOOR_TIMEOUT_MS = 15_000;

interface TandoorRecipe {
    id: number;
    name: string;
    description?: string;
    servings?: number;
    working_time?: number;
    waiting_time?: number;
    keywords?: { name: string }[];
    steps?: {
        ingredients?: {
            food?: { name: string };
            unit?: { name: string };
            amount?: number;
            note?: string;
        }[];
        instruction?: string;
    }[];
    image?: string;
}

export async function testTandoorConnection(baseUrl: string, apiKey: string): Promise<{ success: boolean; message: string }> {
    try {
        const resp = await safeFetch(`${baseUrl}/api/user-preferences/`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeoutMs: TANDOOR_TIMEOUT_MS,
        });
        if (resp.ok) return { success: true, message: 'Connecté a Tandoor' };
        if (resp.status === 401 || resp.status === 403) return { success: false, message: 'Token API incorrect' };
        return { success: false, message: `Erreur HTTP ${resp.status}` };
    } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : 'Impossible de joindre le serveur' };
    }
}

export async function syncTandoor(
    _integrationId: string,
    userId: string,
    baseUrl: string,
    encryptedCredentials: string
): Promise<{ imported: number; errors: number }> {
    const creds = decryptCredentials(encryptedCredentials);
    const apiKey = creds.apiKey;
    if (!apiKey) throw new Error('Token API manquant');

    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    let imported = 0;
    let errors = 0;
    let page = 1;

    while (true) {
        const resp = await safeFetch(`${baseUrl}/api/recipe/?format=json&page=${page}&page_size=50`, { headers, timeoutMs: TANDOOR_TIMEOUT_MS });
        if (!resp.ok) throw new Error(`Tandoor API error ${resp.status}`);

        const data = await resp.json() as { results: TandoorRecipe[]; next?: string };
        if (!data.results || data.results.length === 0) break;

        for (const recipe of data.results) {
            try {
                // Deduplication: skip if name already exists for this user
                const existing = await query(
                    'SELECT id FROM recipes WHERE user_id = $1 AND name = $2',
                    [userId, recipe.name]
                );
                if (existing.rows.length > 0) continue;

                // Lines of text, as every recipe in OpenFamily ("250 g pâtes").
                const ingredients = (recipe.steps || []).flatMap((step) =>
                    (step.ingredients || []).map((ing) => ingredientLine({
                        name: [ing.food?.name, ing.note].filter(Boolean).join(' '),
                        quantity: ing.amount ? String(ing.amount) : '',
                        unit: ing.unit?.name || '',
                    }))
                ).filter(Boolean);

                const instructions = (recipe.steps || [])
                    .map((s) => instructionLine(s.instruction))
                    .filter(Boolean);

                const category = recipe.keywords?.[0]?.name || 'Autre';

                await query(
                    `INSERT INTO recipes (user_id, name, category, description, ingredients, instructions, prep_time, cook_time, servings, image_url)
                     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
                    [userId, recipe.name, category, recipe.description || null, JSON.stringify(ingredients), JSON.stringify(instructions), recipe.working_time || null, recipe.waiting_time || null, recipe.servings || null, recipe.image || null]
                );
                imported++;
            } catch {
                errors++;
            }
        }

        if (!data.next) break;
        page++;
    }

    return { imported, errors };
}

// ── Meal plan ────────────────────────────────────────────────────────────────

interface TandoorMealPlanRaw {
    id: number;
    title?: string | null;
    recipe?: { name?: string | null } | null;
    recipe_name?: string | null;
    from_date: string;
    to_date?: string | null;
    meal_type?: { name?: string | null } | null;
    meal_type_name?: string | null;
    note?: string | null;
    servings?: number | string | null;
}

/** One Tandoor meal plan entry, expanded to a single day. */
export interface TandoorMealPlanEntry {
    id: number;
    /** Day of the entry, yyyy-MM-dd (Tandoor's own local date). */
    date: string;
    /** Tandoor meal type name as configured by the user ("Lunch", "Midi", …). */
    meal_type: string;
    recipe_name: string | null;
    title: string | null;
    note: string | null;
    servings: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// A multi-day Tandoor entry is expanded to one entry per day; cap it so a
// malformed range can never produce an unbounded list.
const MAX_ENTRY_DAYS = 31;
const MAX_PAGES = 20;

// Tandoor sends ISO datetimes with the server's offset ("2026-09-28T12:00:00+02:00"):
// the first ten characters are the local calendar day, which is what the user planned.
const dayOf = (value: string | null | undefined): string | null => {
    const match = typeof value === 'string' ? value.match(/^(\d{4}-\d{2}-\d{2})/) : null;
    return match ? match[1] : null;
};

const addDays = (day: string, days: number): string =>
    new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const cleanText = (value: string | null | undefined): string | null => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? text : null;
};

/**
 * Reads the Tandoor meal plan between two days (inclusive, yyyy-MM-dd).
 * Works with both the paginated ({ results, next }) and the plain-array answers.
 */
export async function fetchTandoorMealPlan(
    baseUrl: string,
    encryptedCredentials: string,
    startDate: string,
    endDate: string
): Promise<TandoorMealPlanEntry[]> {
    const creds = decryptCredentials(encryptedCredentials);
    const apiKey = creds.apiKey;
    if (!apiKey) throw new Error('Token API manquant');

    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const raw: TandoorMealPlanRaw[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
        const params = new URLSearchParams({
            from_date: startDate,
            to_date: endDate,
            page: String(page),
            page_size: '100',
        });
        const resp = await safeFetch(`${baseUrl}/api/meal-plan/?${params.toString()}`, { headers, timeoutMs: TANDOOR_TIMEOUT_MS });
        if (!resp.ok) throw new Error(`Tandoor API error ${resp.status}`);

        const data = await resp.json() as TandoorMealPlanRaw[] | { results?: TandoorMealPlanRaw[]; next?: string | null };
        if (Array.isArray(data)) {
            raw.push(...data);
            break;
        }
        raw.push(...(data.results || []));
        if (!data.next) break;
    }

    const entries: TandoorMealPlanEntry[] = [];
    for (const item of raw) {
        const from = dayOf(item.from_date);
        if (!from) continue;
        const to = dayOf(item.to_date) || from;
        const mealType = cleanText(item.meal_type?.name) || cleanText(item.meal_type_name);
        if (!mealType) continue;
        const servings = item.servings === null || item.servings === undefined ? null : Number(item.servings);

        for (let i = 0, day = from; i < MAX_ENTRY_DAYS && day <= to; i++, day = addDays(day, 1)) {
            if (day < startDate || day > endDate) continue;
            entries.push({
                id: item.id,
                date: day,
                meal_type: mealType,
                recipe_name: cleanText(item.recipe?.name) || cleanText(item.recipe_name),
                title: cleanText(item.title),
                note: cleanText(item.note),
                servings: servings !== null && Number.isFinite(servings) ? servings : null,
            });
        }
    }

    entries.sort((a, b) => a.date.localeCompare(b.date) || a.meal_type.localeCompare(b.meal_type));
    return entries;
}
