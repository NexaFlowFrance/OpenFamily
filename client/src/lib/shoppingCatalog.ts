/**
 * Common shopping items offered as suggestions when adding to a list.
 *
 * Kept as translation keys rather than plain strings so the three locales stay
 * structurally in step and a missing entry is visible, and kept in the client
 * rather than the database so a fresh install has them on day one with no seed
 * step and no migration.
 *
 * `category` refers to the default shopping categories. A family that renamed
 * or removed one still gets the suggestion; the category simply falls back to
 * whatever their list offers, which is handled where this is consumed.
 */
export type CatalogItem = {
    /** Translation key under the `shopping:catalog` namespace. */
    key: string;
    /** One of the default categories in DEFAULT_CATEGORIES.shopping. */
    category: string;
};

export const SHOPPING_CATALOG: CatalogItem[] = [
    // Alimentation
    { key: 'bread', category: 'Alimentation' },
    { key: 'milk', category: 'Alimentation' },
    { key: 'eggs', category: 'Alimentation' },
    { key: 'butter', category: 'Alimentation' },
    { key: 'cheese', category: 'Alimentation' },
    { key: 'yogurt', category: 'Alimentation' },
    { key: 'pasta', category: 'Alimentation' },
    { key: 'rice', category: 'Alimentation' },
    { key: 'flour', category: 'Alimentation' },
    { key: 'sugar', category: 'Alimentation' },
    { key: 'salt', category: 'Alimentation' },
    { key: 'pepper', category: 'Alimentation' },
    { key: 'oliveOil', category: 'Alimentation' },
    { key: 'coffee', category: 'Alimentation' },
    { key: 'tea', category: 'Alimentation' },
    { key: 'apples', category: 'Alimentation' },
    { key: 'bananas', category: 'Alimentation' },
    { key: 'tomatoes', category: 'Alimentation' },
    { key: 'salad', category: 'Alimentation' },
    { key: 'carrots', category: 'Alimentation' },
    { key: 'potatoes', category: 'Alimentation' },
    { key: 'onions', category: 'Alimentation' },
    { key: 'garlic', category: 'Alimentation' },
    { key: 'chicken', category: 'Alimentation' },
    { key: 'groundBeef', category: 'Alimentation' },
    { key: 'fish', category: 'Alimentation' },
    { key: 'ham', category: 'Alimentation' },
    { key: 'cereal', category: 'Alimentation' },
    { key: 'chocolate', category: 'Alimentation' },
    { key: 'water', category: 'Alimentation' },
    { key: 'orangeJuice', category: 'Alimentation' },

    // Bebe
    { key: 'diapers', category: 'Bebe' },
    { key: 'babyWipes', category: 'Bebe' },
    { key: 'infantFormula', category: 'Bebe' },
    { key: 'babyFood', category: 'Bebe' },

    // Menage
    { key: 'dishSoap', category: 'Menage' },
    { key: 'laundryDetergent', category: 'Menage' },
    { key: 'sponges', category: 'Menage' },
    { key: 'binBags', category: 'Menage' },
    { key: 'toiletPaper', category: 'Menage' },
    { key: 'paperTowels', category: 'Menage' },
    { key: 'allPurposeCleaner', category: 'Menage' },

    // Sante
    { key: 'toothpaste', category: 'Sante' },
    { key: 'soap', category: 'Sante' },
    { key: 'shampoo', category: 'Sante' },
    { key: 'showerGel', category: 'Sante' },
    { key: 'tissues', category: 'Sante' },
    { key: 'plasters', category: 'Sante' },
];
