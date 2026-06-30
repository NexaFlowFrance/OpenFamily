import { query } from '../../db';
import { decryptCredentials } from '../../utils/crypto';
import { safeFetch } from '../../lib/safeFetch';

// Outbound Grocy calls go through safeFetch: redirects are re-validated on every
// hop (no SSRF bypass via a 302 to an internal/metadata address) and each request
// is bounded by a hard timeout.
const GROCY_TIMEOUT_MS = 15_000;

interface GrocyShoppingItem {
    id: string;
    product_id: string;
    amount: number;
    note?: string;
}

interface GrocyProduct {
    id: string;
    name: string;
}

export async function testGrocyConnection(baseUrl: string, apiKey: string): Promise<{ success: boolean; message: string }> {
    try {
        const resp = await safeFetch(`${baseUrl}/api/system/info`, {
            headers: { 'GROCY-API-KEY': apiKey },
            timeoutMs: GROCY_TIMEOUT_MS,
        });
        if (resp.ok) {
            const data = await resp.json() as { grocy_version?: { Version: string } };
            return { success: true, message: `Connecte a Grocy ${data.grocy_version?.Version || ''}`.trim() };
        }
        return { success: false, message: `Erreur HTTP ${resp.status}` };
    } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : 'Impossible de joindre le serveur' };
    }
}

export async function syncGrocy(
    _integrationId: string,
    userId: string,
    baseUrl: string,
    encryptedCredentials: string
): Promise<{ imported: number; errors: number }> {
    const creds = decryptCredentials(encryptedCredentials);
    const apiKey = creds.apiKey;
    if (!apiKey) throw new Error('Cle API manquante');

    const headers = { 'GROCY-API-KEY': apiKey, 'Content-Type': 'application/json' };

    // Fetch shopping list (undone items only)
    const resp = await safeFetch(`${baseUrl}/api/objects/shopping_list?query[]=done=0`, { headers, timeoutMs: GROCY_TIMEOUT_MS });
    if (!resp.ok) throw new Error(`Grocy API error: ${resp.status}`);

    const items = await resp.json() as GrocyShoppingItem[];

    // Fetch all products in one call for efficiency
    const prodResp = await safeFetch(`${baseUrl}/api/objects/products`, { headers, timeoutMs: GROCY_TIMEOUT_MS });
    const productMap = new Map<string, string>();
    if (prodResp.ok) {
        const products = await prodResp.json() as GrocyProduct[];
        for (const p of products) productMap.set(p.id, p.name);
    }

    let imported = 0;
    let errors = 0;

    for (const item of items) {
        try {
            const name = productMap.get(item.product_id);
            if (!name) continue;

            const existing = await query(
                'SELECT id FROM shopping_items WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
                [userId, name]
            );
            if (existing.rows.length === 0) {
                await query(
                    'INSERT INTO shopping_items (user_id, name, category, quantity, is_checked) VALUES ($1, $2, $3, $4, false)',
                    [userId, name, 'Autre', item.amount > 0 ? item.amount : null]
                );
                imported++;
            }
        } catch {
            errors++;
        }
    }

    return { imported, errors };
}
