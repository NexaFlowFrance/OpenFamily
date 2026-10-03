import { decryptCredentials } from '../../utils/crypto';
import { safeFetch } from '../../lib/safeFetch';
import { instructionLine } from '../../lib/recipeLines';
import { forEachLimited, parseDurationMinutes, saveSyncedRecipe } from '../../lib/recipeSync';

// Outbound Mealie calls go through safeFetch: redirects are re-validated on every
// hop (no SSRF bypass via a 302 to an internal/metadata address) and each request
// is bounded by a hard timeout.
const MEALIE_TIMEOUT_MS = 15_000;

interface MealieIngredient {
    note?: string | null;
    quantity?: number | null;
    unit?: { name?: string | null } | null;
    food?: { name?: string | null } | null;
    /** Mealie's own rendering of the line ("2 cups pasta"), parsed or not. */
    display?: string | null;
    originalText?: string | null;
}

interface MealieRecipe {
    slug: string;
    name: string;
    description?: string | null;
    recipeServings?: number | null;
    prepTime?: string | null;
    cookTime?: string | null;
    performTime?: string | null;
    recipeCategory?: { name: string }[] | null;
    tags?: { name: string }[] | null;
    recipeIngredient?: MealieIngredient[] | null;
    recipeInstructions?: { title?: string | null; text?: string | null }[] | null;
    image?: string | null;
}

// Mealie v2 uses snake_case in the list response
interface MealieListResponse {
    items: MealieRecipe[];
    total_pages?: number;  // v2
    totalPages?: number;   // v1 fallback
    page: number;
    per_page: number;
    total: number;
}

/** One ingredient as a line: Mealie's rendering when it has one, else quantity, unit and food (or the note). */
function mealieIngredientLine(ing: MealieIngredient): string {
    const display = (ing.display ?? '').trim();
    if (display) return display;
    const parts: string[] = [];
    if (ing.quantity) parts.push(String(ing.quantity));
    if (ing.unit?.name) parts.push(ing.unit.name);
    if (ing.food?.name) parts.push(ing.food.name);
    if (ing.note && (!ing.food?.name || parts.length === 0)) parts.push(ing.note);
    return parts.join(' ').trim() || (ing.originalText ?? '').trim();
}

export async function testMealieConnection(baseUrl: string, apiKey: string): Promise<{ success: boolean; message: string }> {
    try {
        const resp = await safeFetch(`${baseUrl}/api/app/about`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeoutMs: MEALIE_TIMEOUT_MS,
        });
        if (resp.ok) {
            const data = await resp.json() as { version?: string };
            return { success: true, message: `Connecté a Mealie ${data.version || ''}`.trim() };
        }
        if (resp.status === 401) return { success: false, message: 'Clé API incorrecte' };
        return { success: false, message: `Erreur HTTP ${resp.status}` };
    } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : 'Impossible de joindre le serveur' };
    }
}

export async function syncMealie(
    _integrationId: string,
    userId: string,
    baseUrl: string,
    encryptedCredentials: string
): Promise<{ imported: number; errors: number }> {
    const creds = decryptCredentials(encryptedCredentials);
    const apiKey = creds.apiKey;
    if (!apiKey) throw new Error('Clé API manquante');

    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    let page = 1;
    let imported = 0;
    let errors = 0;

    // The list gives each recipe's slug, name and description only: the
    // ingredients and steps come from the recipe's own endpoint.
    while (true) {
        const resp = await safeFetch(`${baseUrl}/api/recipes?page=${page}&perPage=50`, { headers, timeoutMs: MEALIE_TIMEOUT_MS });
        if (!resp.ok) throw new Error(`Mealie API error ${resp.status}`);

        const data = await resp.json() as MealieListResponse;
        if (!data.items || data.items.length === 0) break;

        // Support both Mealie v1 (totalPages) and v2 (total_pages)
        const totalPages = data.total_pages ?? data.totalPages ?? 1;

        await forEachLimited(data.items, 4, async (summary) => {
            try {
                const detailResp = await safeFetch(`${baseUrl}/api/recipes/${encodeURIComponent(summary.slug)}`, { headers, timeoutMs: MEALIE_TIMEOUT_MS });
                if (!detailResp.ok) throw new Error(`Mealie API error ${detailResp.status}`);
                const recipe = { ...summary, ...(await detailResp.json() as MealieRecipe) };

                const outcome = await saveSyncedRecipe(userId, {
                    name: recipe.name,
                    category: recipe.recipeCategory?.[0]?.name || recipe.tags?.[0]?.name || 'Autre',
                    description: recipe.description || null,
                    ingredients: (recipe.recipeIngredient || []).map(mealieIngredientLine).filter(Boolean),
                    instructions: (recipe.recipeInstructions || []).map((step) => instructionLine(step.text)).filter(Boolean),
                    prepTime: parseDurationMinutes(recipe.prepTime),
                    cookTime: parseDurationMinutes(recipe.performTime) ?? parseDurationMinutes(recipe.cookTime),
                    servings: recipe.recipeServings || null,
                    imageUrl: recipe.image ? `${baseUrl}/api/media/recipes/${recipe.slug}/images/min-original.webp` : null,
                });
                if (outcome !== 'skipped') imported++;
            } catch {
                errors++;
            }
        });

        if (page >= totalPages) break;
        page++;
    }

    return { imported, errors };
}
