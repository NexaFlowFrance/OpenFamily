// Family-customizable category lists (issue #68).
//
// The effective lists live on the server (users.custom_categories, family-wide);
// this hook fetches them once per session and shares one cache across every
// mounted component, so a save from Settings instantly updates the pickers in
// Shopping / Recipes / Budget. On any failure (offline, demo without mock…) it
// silently falls back to the historical defaults below.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export const CATEGORY_MODULES = ['shopping', 'recipe', 'budget'] as const;
export type CategoryModule = (typeof CATEGORY_MODULES)[number];
export type FamilyCategories = Record<CategoryModule, string[]>;

// Keep in sync with server/src/routes/categories.ts (DEFAULT_CATEGORIES).
export const DEFAULT_CATEGORIES: FamilyCategories = {
    shopping: ['Alimentation', 'Bebe', 'Menage', 'Sante', 'Autre'],
    recipe: ['Entrée', 'Plat', 'Dessert', 'Snack'],
    budget: [
        'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
        'Abonnements', 'Assurance', 'Enfants', 'Maison', 'Autre',
    ],
};

type CategoriesResponse = { success: boolean; data?: { categories: FamilyCategories } };

let cached: FamilyCategories | null = null;
let fetchStarted = false;
const listeners = new Set<(c: FamilyCategories) => void>();

const notify = (next: FamilyCategories) => {
    cached = next;
    listeners.forEach((listener) => listener(next));
};

export function useCategories() {
    const [categories, setCategories] = useState<FamilyCategories>(cached ?? DEFAULT_CATEGORIES);

    useEffect(() => {
        const listener = (next: FamilyCategories) => setCategories(next);
        listeners.add(listener);
        if (cached) setCategories(cached);
        if (!fetchStarted) {
            fetchStarted = true;
            api.get<CategoriesResponse>('/api/categories')
                .then((res) => {
                    if (res.success && res.data?.categories) notify(res.data.categories);
                })
                .catch(() => {
                    /* defaults stay in place */
                });
        }
        return () => {
            listeners.delete(listener);
        };
    }, []);

    /**
     * Replace one module's list (parents only, enforced server-side).
     * `renames` maps old name → new name so existing data rows follow the rename;
     * categories removed without a rename are reassigned to "Autre" (or the first
     * category) by the server.
     */
    const saveCategories = useCallback(
        async (module: CategoryModule, list: string[], renames?: Record<string, string>) => {
            const res = await api.put<CategoriesResponse>('/api/categories', {
                module,
                categories: list,
                renames,
            });
            if (res.success && res.data?.categories) notify(res.data.categories);
            return res;
        },
        []
    );

    return { categories, saveCategories };
}
