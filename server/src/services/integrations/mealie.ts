import { query } from '../../db';
import { decryptCredentials } from '../../utils/crypto';
import { safeFetch } from '../../lib/safeFetch';

// Outbound Mealie calls go through safeFetch: redirects are re-validated on every
// hop (no SSRF bypass via a 302 to an internal/metadata address) and each request
// is bounded by a hard timeout.
const MEALIE_TIMEOUT_MS = 15_000;

interface MealieRecipe {
    slug: string;
    name: string;
    description?: string;
    recipeServings?: number;
    prepTime?: string;
    cookTime?: string;
    recipeCategory?: { name: string }[];
    tags?: { name: string }[];
    recipeIngredient?: {
        note?: string;
        quantity?: number;
        unit?: { name: string };
        food?: { name: string };
    }[];
    recipeInstructions?: { text: string }[];
    image?: string;
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

function parseDuration(s?: string): number | null {
    if (!s) return null;
    const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!m) return null;
    return (parseInt(m[1] || '0') * 60) + parseInt(m[2] || '0');
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

    while (true) {
        const resp = await safeFetch(`${baseUrl}/api/recipes?page=${page}&perPage=50`, { headers, timeoutMs: MEALIE_TIMEOUT_MS });
        if (!resp.ok) throw new Error(`Mealie API error ${resp.status}`);

        const data = await resp.json() as MealieListResponse;
        if (!data.items || data.items.length === 0) break;

        // Support both Mealie v1 (totalPages) and v2 (total_pages)
        const totalPages = data.total_pages ?? data.totalPages ?? 1;

        for (const recipe of data.items) {
            try {
                // Deduplication: skip if this recipe name already exists for this user
                const existing = await query(
                    'SELECT id FROM recipes WHERE user_id = $1 AND name = $2',
                    [userId, recipe.name]
                );
                if (existing.rows.length > 0) continue;

                const ingredients = (recipe.recipeIngredient || []).map((ing) => {
                    const parts: string[] = [];
                    if (ing.quantity) parts.push(String(ing.quantity));
                    if (ing.unit?.name) parts.push(ing.unit.name);
                    if (ing.food?.name) parts.push(ing.food.name);
                    else if (ing.note) parts.push(ing.note);
                    return { name: parts.join(' '), quantity: ing.quantity ? String(ing.quantity) : '', unit: ing.unit?.name || '' };
                });

                const instructions = (recipe.recipeInstructions || []).map((step, i) => ({
                    step: i + 1,
                    text: step.text,
                }));

                const category = recipe.recipeCategory?.[0]?.name || recipe.tags?.[0]?.name || 'Autre';
                const imageUrl = recipe.image ? `${baseUrl}/api/media/recipes/${recipe.slug}/images/min-original.webp` : null;

                await query(
                    `INSERT INTO recipes (user_id, name, category, description, ingredients, instructions, prep_time, cook_time, servings, image_url)
                     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
                    [userId, recipe.name, category, recipe.description || null, JSON.stringify(ingredients), JSON.stringify(instructions), parseDuration(recipe.prepTime), parseDuration(recipe.cookTime), recipe.recipeServings || null, imageUrl]
                );
                imported++;
            } catch {
                errors++;
            }
        }

        if (page >= totalPages) break;
        page++;
    }

    return { imported, errors };
}
