import { Router } from 'express';
import pool, { query } from '../db';
import { authMiddleware, AuthRequest, requireParent } from '../middleware/auth';

// Per-family customizable categories (issue #68).
//
// The lists are stored as a JSON object on the family owner's row
// (users.custom_categories, TEXT — same pattern as disabled_modules); NULL/empty
// means "defaults". Every stored row (shopping_items.category, recipes.category,
// budget_entries/budget_limits/recurring_expenses.category) keeps holding the raw
// category string, so renaming/deleting a category cascades to the data rows here.
//
// NOTE: keep DEFAULT_CATEGORIES in sync with client/src/hooks/useCategories.ts
// (the client fallback) — these are the historical hard-coded lists, so existing
// installs see zero change until they customize.

export const CATEGORY_MODULES = ['shopping', 'recipe', 'budget'] as const;
export type CategoryModule = (typeof CATEGORY_MODULES)[number];
export type FamilyCategories = Record<CategoryModule, string[]>;

export const DEFAULT_CATEGORIES: FamilyCategories = {
    shopping: ['Alimentation', 'Bebe', 'Menage', 'Sante', 'Autre'],
    recipe: ['Entrée', 'Plat', 'Dessert', 'Snack'],
    budget: [
        'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
        'Abonnements', 'Assurance', 'Enfants', 'Maison', 'Autre',
    ],
};

const MAX_CATEGORIES = 30;
const MAX_NAME_LENGTH = 50; // matches the VARCHAR(50) of every category column

// Tables whose `category` column must follow renames/deletions, per module.
// budget_limits is handled separately (UNIQUE(user_id, category, month, year)).
const MODULE_TABLES: Record<CategoryModule, string[]> = {
    shopping: ['shopping_items'],
    recipe: ['recipes'],
    budget: ['budget_entries', 'recurring_expenses'],
};

/** Parse users.custom_categories, falling back to the defaults per module. */
export const parseCustomCategories = (raw: unknown): FamilyCategories => {
    const result: FamilyCategories = {
        shopping: [...DEFAULT_CATEGORIES.shopping],
        recipe: [...DEFAULT_CATEGORIES.recipe],
        budget: [...DEFAULT_CATEGORIES.budget],
    };
    if (typeof raw !== 'string' || raw.trim() === '') return result;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const module of CATEGORY_MODULES) {
            const list = parsed?.[module];
            if (
                Array.isArray(list)
                && list.length > 0
                && list.every((v) => typeof v === 'string' && v.trim().length > 0)
            ) {
                result[module] = (list as string[]).map((v) => v.trim()).slice(0, MAX_CATEGORIES);
            }
        }
    } catch {
        /* corrupt value → defaults */
    }
    return result;
};

/** Effective category lists for a family (ownerId = req.userId). */
export async function getFamilyCategories(ownerId: string): Promise<FamilyCategories> {
    const result = await query('SELECT custom_categories FROM users WHERE id = $1', [ownerId]);
    return parseCustomCategories(result.rows[0]?.custom_categories);
}

const router = Router();

// GET /api/categories → { categories: { shopping, recipe, budget } }
// Any family member sees the same effective (family-wide) lists.
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const categories = await getFamilyCategories(req.userId!);
        return res.json({ success: true, data: { categories } });
    } catch (error) {
        console.error('Get categories error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/categories — parents only. Replaces ONE module's list and cascades:
//   body: { module: 'shopping'|'recipe'|'budget', categories: string[],
//           renames?: { [oldName]: newName } }
// - renames: data rows move from oldName to newName (newName must be in the list)
// - categories removed (and not renamed) have their data rows reassigned to
//   'Autre' when present, otherwise to the first category of the new list.
router.put('/', authMiddleware, requireParent, async (req: AuthRequest, res) => {
    try {
        const { module: mod, categories, renames } = req.body as {
            module?: unknown; categories?: unknown; renames?: unknown;
        };

        if (typeof mod !== 'string' || !(CATEGORY_MODULES as readonly string[]).includes(mod)) {
            return res.status(400).json({ success: false, error: 'Invalid module' });
        }
        const module = mod as CategoryModule;

        if (!Array.isArray(categories) || categories.length === 0) {
            return res.status(400).json({ success: false, error: 'categories must be a non-empty array' });
        }
        if (categories.length > MAX_CATEGORIES) {
            return res.status(400).json({ success: false, error: `Too many categories (max ${MAX_CATEGORIES})` });
        }
        const next: string[] = [];
        for (const value of categories) {
            if (typeof value !== 'string') {
                return res.status(400).json({ success: false, error: 'Every category must be a string' });
            }
            const name = value.trim();
            if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
                return res.status(400).json({ success: false, error: `Category names must be 1-${MAX_NAME_LENGTH} characters` });
            }
            if (next.includes(name)) {
                return res.status(400).json({ success: false, error: `Duplicate category: ${name}` });
            }
            next.push(name);
        }

        const current = (await getFamilyCategories(req.userId!))[module];

        // Validate the renames map: old must exist, new must be in the next list.
        const renameMap: Array<[string, string]> = [];
        if (renames !== undefined) {
            if (typeof renames !== 'object' || renames === null || Array.isArray(renames)) {
                return res.status(400).json({ success: false, error: 'renames must be an object' });
            }
            for (const [oldName, newName] of Object.entries(renames as Record<string, unknown>)) {
                if (typeof newName !== 'string') {
                    return res.status(400).json({ success: false, error: 'Every rename target must be a string' });
                }
                const target = newName.trim();
                if (oldName === target) continue;
                if (!current.includes(oldName)) {
                    return res.status(400).json({ success: false, error: `Unknown category to rename: ${oldName}` });
                }
                if (!next.includes(target)) {
                    return res.status(400).json({ success: false, error: `Rename target not in the new list: ${target}` });
                }
                renameMap.push([oldName, target]);
            }
        }

        // Categories that disappear without being renamed → reassign their rows.
        const renamedFrom = new Set(renameMap.map(([oldName]) => oldName));
        const removed = current.filter((c) => !next.includes(c) && !renamedFrom.has(c));
        const fallback = next.includes('Autre') ? 'Autre' : next[0];

        const moveRows = async (client: { query: (t: string, p?: any[]) => Promise<any> }, from: string, to: string) => {
            for (const table of MODULE_TABLES[module]) {
                await client.query(
                    `UPDATE ${table} SET category = $2 WHERE user_id = $1 AND category = $3`,
                    [req.userId, to, from]
                );
            }
            if (module === 'budget') {
                // budget_limits has UNIQUE(user_id, category, month, year): move the
                // months that don't collide with an existing limit, drop the rest.
                await client.query(
                    `UPDATE budget_limits SET category = $2
                     WHERE user_id = $1 AND category = $3
                       AND NOT EXISTS (
                           SELECT 1 FROM budget_limits b2
                           WHERE b2.user_id = $1 AND b2.category = $2
                             AND b2.month = budget_limits.month AND b2.year = budget_limits.year
                       )`,
                    [req.userId, to, from]
                );
                await client.query(
                    'DELETE FROM budget_limits WHERE user_id = $1 AND category = $2',
                    [req.userId, from]
                );
            }
        };

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const [oldName, newName] of renameMap) await moveRows(client, oldName, newName);
            for (const gone of removed) await moveRows(client, gone, fallback);

            const merged = await getFamilyCategories(req.userId!);
            merged[module] = next;
            await client.query(
                'UPDATE users SET custom_categories = $1 WHERE id = $2',
                [JSON.stringify(merged), req.userId]
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        const categoriesAfter = await getFamilyCategories(req.userId!);
        return res.json({ success: true, data: { categories: categoriesAfter } });
    } catch (error) {
        console.error('Update categories error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
