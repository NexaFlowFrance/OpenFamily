/**
 * Folds text for matching what people type: case, accents and ligatures do not
 * count, so "brocoli", "Brocolis" and "BROCOLI" meet, and "oeuf" finds "Œufs".
 */
export const foldText = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/œ/gi, 'oe')
        .replace(/æ/gi, 'ae')
        .toLowerCase()
        .trim();

/**
 * True when every word of the query starts a word of the text, allowing a
 * trailing plural "s"/"x" either side: "brocoli" matches "2 brocolis",
 * "tomates" matches "tomate", "oeuf" matches "Œufs" but "or" does not match
 * "chorizo".
 */
export const matchesWords = (text: string, query: string): boolean => {
    const words = foldText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const terms = foldText(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (terms.length === 0) return true;
    const stem = (w: string) => (w.length > 3 ? w.replace(/[sx]$/, '') : w);
    return terms.every((term) => words.some((word) => stem(word).startsWith(stem(term))));
};
