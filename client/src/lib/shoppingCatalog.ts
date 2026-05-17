// Static catalog of common French grocery and household items.
// Used by ShoppingItemPicker to suggest items as the user types, so they can
// add typical products in one tap without filling the form.
//
// Categories MUST match the values used in ShoppingList.tsx ('Bebe', 'Menage',
// 'Sante' — unaccented) so server-side persisted strings stay consistent.

export interface CatalogItem {
    name: string;
    category: 'Alimentation' | 'Bebe' | 'Menage' | 'Sante' | 'Autre';
    unit?: string;
    // Lowercase ASCII-folded aliases used only for matching (not displayed).
    aliases?: string[];
}

export const SHOPPING_CATALOG: CatalogItem[] = [
    // -- Alimentation: produits laitiers -------------------------------------
    { name: 'Lait', category: 'Alimentation', unit: 'L' },
    { name: 'Lait demi-écrémé', category: 'Alimentation', unit: 'L' },
    { name: 'Lait écrémé', category: 'Alimentation', unit: 'L' },
    { name: 'Lait entier', category: 'Alimentation', unit: 'L' },
    { name: 'Beurre', category: 'Alimentation' },
    { name: 'Beurre doux', category: 'Alimentation' },
    { name: 'Beurre demi-sel', category: 'Alimentation' },
    { name: 'Crème fraîche', category: 'Alimentation' },
    { name: 'Crème liquide', category: 'Alimentation' },
    { name: 'Yaourt nature', category: 'Alimentation', unit: 'pot' },
    { name: 'Yaourt à la fraise', category: 'Alimentation', unit: 'pot' },
    { name: 'Yaourt vanille', category: 'Alimentation', unit: 'pot' },
    { name: 'Fromage blanc', category: 'Alimentation' },
    { name: 'Petit-suisse', category: 'Alimentation' },
    { name: 'Camembert', category: 'Alimentation' },
    { name: 'Comté', category: 'Alimentation' },
    { name: 'Emmental râpé', category: 'Alimentation' },
    { name: 'Mozzarella', category: 'Alimentation' },
    { name: 'Parmesan', category: 'Alimentation' },
    { name: 'Œufs', category: 'Alimentation', unit: 'boîte', aliases: ['oeufs'] },

    // -- Alimentation: boulangerie -------------------------------------------
    { name: 'Pain', category: 'Alimentation' },
    { name: 'Baguette', category: 'Alimentation' },
    { name: 'Pain de mie', category: 'Alimentation' },
    { name: 'Pain complet', category: 'Alimentation' },
    { name: 'Croissants', category: 'Alimentation' },
    { name: 'Pains au chocolat', category: 'Alimentation' },
    { name: 'Brioche', category: 'Alimentation' },
    { name: 'Biscottes', category: 'Alimentation' },

    // -- Alimentation: fruits & légumes --------------------------------------
    { name: 'Pommes', category: 'Alimentation', unit: 'kg' },
    { name: 'Bananes', category: 'Alimentation', unit: 'kg' },
    { name: 'Oranges', category: 'Alimentation', unit: 'kg' },
    { name: 'Citrons', category: 'Alimentation' },
    { name: 'Fraises', category: 'Alimentation', unit: 'barquette' },
    { name: 'Raisin', category: 'Alimentation', unit: 'kg' },
    { name: 'Poires', category: 'Alimentation', unit: 'kg' },
    { name: 'Kiwis', category: 'Alimentation' },
    { name: 'Avocats', category: 'Alimentation' },
    { name: 'Ananas', category: 'Alimentation' },
    { name: 'Tomates', category: 'Alimentation', unit: 'kg' },
    { name: 'Tomates cerises', category: 'Alimentation', unit: 'barquette' },
    { name: 'Salade', category: 'Alimentation' },
    { name: 'Concombre', category: 'Alimentation' },
    { name: 'Carottes', category: 'Alimentation', unit: 'kg' },
    { name: 'Pommes de terre', category: 'Alimentation', unit: 'kg' },
    { name: 'Oignons', category: 'Alimentation', unit: 'kg' },
    { name: 'Ail', category: 'Alimentation' },
    { name: 'Échalotes', category: 'Alimentation', aliases: ['echalotes'] },
    { name: 'Courgettes', category: 'Alimentation', unit: 'kg' },
    { name: 'Aubergines', category: 'Alimentation' },
    { name: 'Poivrons', category: 'Alimentation' },
    { name: 'Champignons', category: 'Alimentation', unit: 'barquette' },
    { name: 'Brocoli', category: 'Alimentation' },
    { name: 'Chou-fleur', category: 'Alimentation' },
    { name: 'Épinards', category: 'Alimentation', aliases: ['epinards'] },
    { name: 'Haricots verts', category: 'Alimentation' },
    { name: 'Petits pois', category: 'Alimentation' },

    // -- Alimentation: viandes & poissons ------------------------------------
    { name: 'Poulet', category: 'Alimentation', unit: 'kg' },
    { name: 'Blanc de poulet', category: 'Alimentation', unit: 'kg' },
    { name: 'Bœuf haché', category: 'Alimentation', unit: 'kg', aliases: ['boeuf hache'] },
    { name: 'Steak', category: 'Alimentation' },
    { name: 'Saucisses', category: 'Alimentation' },
    { name: 'Jambon', category: 'Alimentation', unit: 'tranche' },
    { name: 'Jambon blanc', category: 'Alimentation', unit: 'tranche' },
    { name: 'Lardons', category: 'Alimentation' },
    { name: 'Saumon', category: 'Alimentation' },
    { name: 'Thon en boîte', category: 'Alimentation', unit: 'boîte' },
    { name: 'Crevettes', category: 'Alimentation' },

    // -- Alimentation: épicerie ----------------------------------------------
    { name: 'Pâtes', category: 'Alimentation', aliases: ['pates'] },
    { name: 'Spaghetti', category: 'Alimentation' },
    { name: 'Tagliatelles', category: 'Alimentation' },
    { name: 'Riz', category: 'Alimentation', unit: 'kg' },
    { name: 'Riz basmati', category: 'Alimentation' },
    { name: 'Semoule', category: 'Alimentation' },
    { name: 'Quinoa', category: 'Alimentation' },
    { name: 'Lentilles', category: 'Alimentation' },
    { name: 'Pois chiches', category: 'Alimentation' },
    { name: 'Haricots rouges', category: 'Alimentation' },
    { name: 'Farine', category: 'Alimentation', unit: 'kg' },
    { name: 'Sucre', category: 'Alimentation', unit: 'kg' },
    { name: 'Sucre en poudre', category: 'Alimentation' },
    { name: 'Sel', category: 'Alimentation' },
    { name: 'Poivre', category: 'Alimentation' },
    { name: 'Huile d’olive', category: 'Alimentation', unit: 'L', aliases: ["huile d'olive"] },
    { name: 'Huile de tournesol', category: 'Alimentation', unit: 'L' },
    { name: 'Vinaigre', category: 'Alimentation' },
    { name: 'Moutarde', category: 'Alimentation' },
    { name: 'Mayonnaise', category: 'Alimentation' },
    { name: 'Ketchup', category: 'Alimentation' },
    { name: 'Sauce tomate', category: 'Alimentation' },
    { name: 'Coulis de tomate', category: 'Alimentation' },
    { name: 'Confiture', category: 'Alimentation' },
    { name: 'Miel', category: 'Alimentation' },
    { name: 'Nutella', category: 'Alimentation' },
    { name: 'Céréales', category: 'Alimentation', aliases: ['cereales'] },
    { name: 'Café', category: 'Alimentation', aliases: ['cafe'] },
    { name: 'Thé', category: 'Alimentation', aliases: ['the'] },
    { name: 'Chocolat', category: 'Alimentation', unit: 'tablette' },
    { name: 'Biscuits', category: 'Alimentation', unit: 'paquet' },
    { name: 'Chips', category: 'Alimentation', unit: 'paquet' },

    // -- Alimentation: boissons ----------------------------------------------
    { name: 'Eau', category: 'Alimentation', unit: 'L' },
    { name: 'Eau minérale', category: 'Alimentation', unit: 'pack' },
    { name: 'Eau gazeuse', category: 'Alimentation', unit: 'L' },
    { name: 'Jus d’orange', category: 'Alimentation', unit: 'L', aliases: ["jus d'orange"] },
    { name: 'Jus de pomme', category: 'Alimentation', unit: 'L' },
    { name: 'Coca-Cola', category: 'Alimentation' },
    { name: 'Limonade', category: 'Alimentation' },
    { name: 'Bière', category: 'Alimentation', aliases: ['biere'] },
    { name: 'Vin rouge', category: 'Alimentation' },
    { name: 'Vin blanc', category: 'Alimentation' },

    // -- Alimentation: surgelés ----------------------------------------------
    { name: 'Pizza surgelée', category: 'Alimentation' },
    { name: 'Frites surgelées', category: 'Alimentation' },
    { name: 'Glace', category: 'Alimentation' },

    // -- Bébé ----------------------------------------------------------------
    { name: 'Couches', category: 'Bebe', unit: 'paquet' },
    { name: 'Lingettes bébé', category: 'Bebe', unit: 'paquet' },
    { name: 'Lait infantile', category: 'Bebe', unit: 'boîte' },
    { name: 'Petits pots', category: 'Bebe', unit: 'pot' },
    { name: 'Compotes', category: 'Bebe', unit: 'gourde' },
    { name: 'Céréales bébé', category: 'Bebe', aliases: ['cereales bebe'] },
    { name: 'Liniment', category: 'Bebe' },
    { name: 'Crème de change', category: 'Bebe' },
    { name: 'Tétines', category: 'Bebe', aliases: ['tetines'] },
    { name: 'Biberons', category: 'Bebe' },

    // -- Ménage --------------------------------------------------------------
    { name: 'Liquide vaisselle', category: 'Menage' },
    { name: 'Pastilles lave-vaisselle', category: 'Menage', unit: 'boîte' },
    { name: 'Lessive', category: 'Menage', unit: 'L' },
    { name: 'Adoucissant', category: 'Menage' },
    { name: 'Détachant', category: 'Menage', aliases: ['detachant'] },
    { name: 'Javel', category: 'Menage' },
    { name: 'Nettoyant multi-surfaces', category: 'Menage' },
    { name: 'Nettoyant vitres', category: 'Menage' },
    { name: 'Nettoyant WC', category: 'Menage' },
    { name: 'Sopalin', category: 'Menage', unit: 'rouleau' },
    { name: 'Papier toilette', category: 'Menage', unit: 'rouleau' },
    { name: 'Mouchoirs', category: 'Menage', unit: 'boîte' },
    { name: 'Sacs poubelle', category: 'Menage', unit: 'rouleau' },
    { name: 'Éponges', category: 'Menage', aliases: ['eponges'] },
    { name: 'Film alimentaire', category: 'Menage' },
    { name: 'Papier aluminium', category: 'Menage' },
    { name: 'Papier cuisson', category: 'Menage' },
    { name: 'Ampoules', category: 'Menage' },
    { name: 'Piles', category: 'Menage' },

    // -- Hygiène / Santé -----------------------------------------------------
    { name: 'Dentifrice', category: 'Sante' },
    { name: 'Brosse à dents', category: 'Sante' },
    { name: 'Bain de bouche', category: 'Sante' },
    { name: 'Shampooing', category: 'Sante' },
    { name: 'Après-shampooing', category: 'Sante' },
    { name: 'Gel douche', category: 'Sante' },
    { name: 'Savon', category: 'Sante' },
    { name: 'Déodorant', category: 'Sante', aliases: ['deodorant'] },
    { name: 'Rasoir', category: 'Sante' },
    { name: 'Mousse à raser', category: 'Sante' },
    { name: 'Crème hydratante', category: 'Sante' },
    { name: 'Crème solaire', category: 'Sante' },
    { name: 'Coton', category: 'Sante' },
    { name: 'Cotons-tiges', category: 'Sante' },
    { name: 'Pansements', category: 'Sante', unit: 'boîte' },
    { name: 'Doliprane', category: 'Sante' },
    { name: 'Sérum physiologique', category: 'Sante', aliases: ['serum physiologique'] },
    { name: 'Vitamines', category: 'Sante' },
];

// -- Search helpers ----------------------------------------------------------

// Normalize for matching: lowercase + strip accents.
// Comparing user input "cafe" against catalog "Café" requires both sides to
// pass through this — without it the autocomplete misses obvious matches.
const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

interface SuggestionMatch extends CatalogItem {
    // Lower score = better match. Prefix matches rank above contains matches,
    // and the picker uses this to surface "lait" above "petit-lait" when the
    // user types "lai".
    score: number;
}

export const matchCatalog = (query: string, limit = 8): CatalogItem[] => {
    const q = fold(query);
    if (!q) return [];

    const matches: SuggestionMatch[] = [];
    for (const item of SHOPPING_CATALOG) {
        const name = fold(item.name);
        if (name.startsWith(q)) {
            matches.push({ ...item, score: 0 });
            continue;
        }
        if (name.includes(q)) {
            matches.push({ ...item, score: 1 });
            continue;
        }
        if (item.aliases?.some((a) => a.startsWith(q))) {
            matches.push({ ...item, score: 2 });
            continue;
        }
        if (item.aliases?.some((a) => a.includes(q))) {
            matches.push({ ...item, score: 3 });
        }
    }

    return matches
        .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'fr'))
        .slice(0, limit)
        .map(({ score: _score, ...item }) => item);
};

// Returns frequent items derived from the user's current shopping list.
// We count active + checked rows so reusing what was bought yesterday stays
// one tap away even after it's checked off (but before the user clears it).
export interface FrequentItem {
    name: string;
    category: string;
    unit?: string;
    count: number;
}

export const computeFrequentItems = (
    items: Array<{ name: string; category: string; unit?: string }>,
    limit = 8,
): FrequentItem[] => {
    const byKey = new Map<string, FrequentItem>();
    for (const item of items) {
        const key = `${fold(item.name)}::${item.category}`;
        const existing = byKey.get(key);
        if (existing) {
            existing.count += 1;
        } else {
            byKey.set(key, {
                name: item.name,
                category: item.category,
                unit: item.unit,
                count: 1,
            });
        }
    }
    return Array.from(byKey.values())
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
        .slice(0, limit);
};
