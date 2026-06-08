import { query } from '../../db';
import { decryptCredentials } from '../../utils/crypto';

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
        const resp = await fetch(`${baseUrl}/api/user-preferences/`, {
            headers: { 'Authorization': `Token ${apiKey}` },
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

    const headers = { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' };

    let imported = 0;
    let errors = 0;
    let page = 1;

    while (true) {
        const resp = await fetch(`${baseUrl}/api/recipe/?format=json&page=${page}&page_size=50`, { headers });
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

                const ingredients = (recipe.steps || []).flatMap((step) =>
                    (step.ingredients || []).map((ing) => ({
                        name: [ing.food?.name, ing.note].filter(Boolean).join(' '),
                        quantity: ing.amount ? String(ing.amount) : '',
                        unit: ing.unit?.name || '',
                    }))
                );

                const instructions = (recipe.steps || [])
                    .filter((s) => s.instruction)
                    .map((s, i) => ({ step: i + 1, text: s.instruction! }));

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
