/**
 * Shared by the Mealie and Tandoor recipe syncs.
 *
 * Both services list recipes without their ingredients and steps: those come
 * only from each recipe's own endpoint. Until 1.8.1 the syncs stored the list
 * entry, so every synced recipe arrived with a title and nothing to cook.
 */
import { query } from '../db';

export interface SyncedRecipe {
    name: string;
    category: string;
    description: string | null;
    ingredients: string[];
    instructions: string[];
    prepTime: number | null;
    cookTime: number | null;
    servings: number | null;
    imageUrl: string | null;
}

export type SaveOutcome = 'created' | 'filled' | 'skipped';

/**
 * Adds a synced recipe. A recipe of the same name is never overwritten, with
 * one exception: when it has neither ingredients nor steps (what the broken
 * syncs left behind), they are filled in, so syncing again repairs it.
 */
export async function saveSyncedRecipe(userId: string, recipe: SyncedRecipe): Promise<SaveOutcome> {
    const existing = await query(
        `SELECT id,
                COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(ingredients) = 'array' THEN ingredients END), 0) AS ingredient_count,
                COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(instructions) = 'array' THEN instructions END), 0) AS instruction_count
         FROM recipes WHERE user_id = $1 AND name = $2
         ORDER BY created_at ASC LIMIT 1`,
        [userId, recipe.name]
    );
    const found = existing.rows[0];
    if (found) {
        const empty = Number(found.ingredient_count) === 0 && Number(found.instruction_count) === 0;
        const hasContent = recipe.ingredients.length > 0 || recipe.instructions.length > 0;
        if (!empty || !hasContent) return 'skipped';
        await query(
            `UPDATE recipes
             SET ingredients = $2::jsonb,
                 instructions = $3::jsonb,
                 prep_time = COALESCE(prep_time, $4),
                 cook_time = COALESCE(cook_time, $5),
                 servings = COALESCE(servings, $6),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [found.id, JSON.stringify(recipe.ingredients), JSON.stringify(recipe.instructions), recipe.prepTime, recipe.cookTime, recipe.servings]
        );
        return 'filled';
    }
    await query(
        `INSERT INTO recipes (user_id, name, category, description, ingredients, instructions, prep_time, cook_time, servings, image_url)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
        [userId, recipe.name, recipe.category, recipe.description, JSON.stringify(recipe.ingredients),
            JSON.stringify(recipe.instructions), recipe.prepTime, recipe.cookTime, recipe.servings, recipe.imageUrl]
    );
    return 'created';
}

/** Runs `fn` over the items, a few at a time, so a large library does not open hundreds of requests at once. */
export async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const item = items[next++];
            await fn(item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Minutes from a duration as recipe sites write it: ISO 8601 ("PT1H30M"),
 * words ("1 hour 30 minutes", "45 min", "1 heure"), compact ("1h30") or a
 * bare number of minutes. Null when nothing can be read.
 */
export function parseDurationMinutes(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    if (typeof value !== 'string') return null;
    const text = value.trim().toLowerCase();
    if (!text) return null;

    const iso = text.match(/^p(?:(\d+)d)?t?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (iso && (iso[1] || iso[2] || iso[3])) {
        const minutes = Number(iso[1] || 0) * 1440 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
        return minutes > 0 ? minutes : null;
    }
    if (/^\d+$/.test(text)) return Number(text) > 0 ? Number(text) : null;

    const compact = text.match(/^(\d+)\s*h\s*(\d+)?$/);
    if (compact) return Number(compact[1]) * 60 + Number(compact[2] || 0);

    let minutes = 0;
    let matched = false;
    for (const [, amount, unit] of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(days?|jours?|hours?|hrs?|heures?|h|minutes?|mins?|mn|m)\b/g)) {
        const n = Number(amount.replace(',', '.'));
        matched = true;
        if (/^(d|j)/.test(unit)) minutes += n * 1440;
        else if (/^h/.test(unit)) minutes += n * 60;
        else minutes += n;
    }
    return matched && minutes > 0 ? Math.round(minutes) : null;
}
