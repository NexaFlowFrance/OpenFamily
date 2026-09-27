/**
 * Recipes keep their ingredients and steps as lines of text ("250 g pâtes",
 * "Faire cuire 10 minutes"): the app shows, edits, filters and sends them to
 * the shopping list that way. The Tandoor and Mealie syncs used to store
 * objects instead ({ name, quantity, unit } and { step, text }), which broke
 * the recipe pages. Anything that writes or reads recipes turns them into
 * lines with these helpers.
 */

const clean = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

/** One ingredient as a line; objects get their quantity and unit in front unless the name already has them. */
export function ingredientLine(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return clean(value);
    const item = value as Record<string, unknown>;
    const name = clean(item.name ?? item.food ?? item.note ?? item.text);
    const quantity = clean(item.quantity ?? item.amount);
    const unit = clean(item.unit);
    // Mealie already writes "2 cup flour" in name; Tandoor writes only the food.
    if (!quantity || name.startsWith(quantity)) return name;
    return [quantity, unit, name].filter(Boolean).join(' ');
}

/** One step as a line. */
export function instructionLine(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return clean(value);
    const item = value as Record<string, unknown>;
    return clean(item.text ?? item.instruction ?? item.name);
}

const toLines = (value: unknown, line: (v: unknown) => string): string[] =>
    (Array.isArray(value) ? value : []).map(line).filter(Boolean);

/** A recipe row with its ingredients and steps as lines of text. */
export function withTextLines<T extends Record<string, unknown>>(recipe: T): T {
    return {
        ...recipe,
        ingredients: toLines(recipe.ingredients, ingredientLine),
        instructions: toLines(recipe.instructions, instructionLine),
    };
}
