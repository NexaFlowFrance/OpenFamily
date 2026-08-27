export interface CleanedIngredient {
    name: string;
    original: string;
}

/**
 * Sanitizes raw recipe ingredient lines into clean grocery store product names
 * across Portuguese (pt), English (en), and French (fr).
 *
 * Examples:
 * - "2 colheres (sopa) de margarina (300g)" -> { name: "Margarina", original: "2 colheres (sopa) de margarina" }
 * - "1 stick of butter" -> { name: "Butter", original: "1 stick of butter" }
 * - "1,5 tasse de farine" -> { name: "Farine", original: "1,5 tasse de farine" }
 */
export function cleanIngredientForShopping(raw: string): CleanedIngredient {
    if (!raw) return { name: '', original: '' };

    // 1. Strip section markers [Massa], [Cobertura], ## Subseção
    let clean = raw.replace(/^\[[^\]]+\]\s*/, '').replace(/^(?:##|###)\s*/, '').trim();
    const original = clean;

    // 2. Remove parenthetical notes like (300g), (opcional) EXCEPT (sopa|chá|sobremesa|café)
    clean = clean.replace(/\((?!(?:sopa|chá|sobremesa|café)\b)[^)]*\)/gi, '').trim();

    // 3. Multi-language culinary & packaging measurement terms (PT, EN, FR)
    // Longer words MUST come before shorter abbreviations!
    const measureTerms = [
        // Spoons & Cups
        'colheres?\\s+de\\s+(?:sopa|chá|sobremesa|café)',
        'colheres?', 'colher(?:es)?', 'colh\\.?', 'c\\.\\s*à\\s*[sc]\\.?',
        'tablespoons?', 'teaspoons?', 'dessertspoons?', 'tbsp', 'tsp', 'tbs',
        'cuillères?\\s+à\\s+(?:soupe|café)', 'cuillères?',
        'xícaras?', 'xic\\.?', 'copos?', 'canecas?', 'taças?',
        'cups?', 'glasses?', 'mugs?', 'tasses?', 'verres?', 'bols?',
        // Packs, Boxes, Cans, Tablets, Scoops, Sticks
        'tabletes?', 'barras?', 'scoops?', 'medidas?', 'dosadores?',
        'caixas?', 'caixinhas?', 'latas?', 'latinhas?', 'pacotes?', 'pcts?',
        'envelopes?', 'saches?', 'potes?', 'potinhos?', 'garrafas?', 'vidros?',
        'sticks?', 'bars?', 'cans?', 'boxes?', 'packs?', 'packages?', 'packets?', 'sachets?', 'bottles?', 'jars?',
        'plaquettes?', 'tablettes?', 'boîtes?', 'paquets?', 'bouteilles?',
        // Portions, Slices, Cloves, Sprigs, Pinches, Units
        'pitadas?', 'dentes?', 'fatias?', 'ramos?', 'folhas?', 'rodelas?', 'cubos?',
        'pedaços?', 'unidades?', 'und\\.?', 'un\\.?', 'cabeças?', 'gomos?', 'filés?', 'postas?',
        'pinches?', 'cloves?', 'slices?', 'sprigs?', 'leaves?', 'heads?', 'pieces?', 'units?', 'fillets?',
        'pincées?', 'gousses?', 'tranches?', 'brins?', 'feuilles?', 'têtes?', 'morceaux?', 'unités?',
        // Weight & Volume
        'kilogrammes?', 'grammes?', 'gramas?', 'quilos?', 'kilos?', 'litros?', 'litres?',
        'kg', 'gr?', 'ml', 'cl', 'dl', 'l', 'oz', 'lbs?', 'pounds?',
    ].join('|');

    // Matches optional numeric quantity + measurement term + preposition (de/da/do/des/d'/of)
    const unitRegex = new RegExp(
        `^(?:(?:\\d+[\\s\\/\\.,\\d]*|\\d+\\/\\d+|\\d+\\s+(?:e|and|et)\\s+\\d+\\/\\d+)?\\s*(?:${measureTerms})\\s*(?:\\(?\\s*(?:sopa|chá|sobremesa|café)\\s*\\)?)?\\s*(?:de|da|do|des|d'|of)?\\s*)`,
        'i'
    );

    clean = clean.replace(unitRegex, '').trim();

    // 4. Secondary cleanup: remove leftover leading "de ", "da ", "do ", "des ", "d'", "of "
    clean = clean.replace(/^(?:de|da|do|des|d'|of)\s+/i, '').trim();

    // 5. Remove any remaining parenthetical notes
    clean = clean.replace(/\([^)]*\)/g, '').trim();

    if (clean.length > 0) {
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    return {
        name: clean || original,
        original,
    };
}
