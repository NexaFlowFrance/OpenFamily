// Prompt building + server-side validation for the AI assistant features.
//
// The JSON schemas below are shared by all providers. Constraints:
//  - every object carries additionalProperties:false (Anthropic structured outputs),
//  - no minLength/maxLength/minimum/maximum (unsupported there) — all bounds are
//    enforced by the validators in this file, which NEVER trust the model output.
//  - every property is required; "not applicable" is conveyed with '' / [] / 0 so
//    the same schema behaves identically on Ollama, OpenAI-compatible and Anthropic.

export const TASK_PRIORITIES = ['Haute', 'Moyenne', 'Basse'] as const;
export const TASK_FREQUENCIES = ['Une fois', 'Quotidien', 'Hebdomadaire', 'Mensuel', 'Annuel'] as const;
export const SHOPPING_CATEGORIES = ['Alimentation', 'Bebe', 'Menage', 'Sante', 'Autre'] as const;
export const BUDGET_CATEGORIES = [
    'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
    'Abonnements', 'Assurance', 'Enfants', 'Maison', 'Autre',
] as const;
export const DEFAULT_RECIPE_CATEGORIES = ['Entrée', 'Plat', 'Dessert', 'Snack'] as const;

export interface FamilyMemberRef {
    id: string;
    name: string;
}

// ─── /api/ai/parse ────────────────────────────────────────────────────────────

export const PARSE_SCHEMA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'type', 'title', 'description', 'date', 'start_time', 'end_time',
                    'location', 'member_names', 'priority', 'frequency',
                    'quantity', 'unit', 'category', 'amount', 'is_expense',
                ],
                properties: {
                    type: { type: 'string', enum: ['task', 'appointment', 'shopping_item', 'budget_entry'] },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    date: { type: 'string' },
                    start_time: { type: 'string' },
                    end_time: { type: 'string' },
                    location: { type: 'string' },
                    member_names: { type: 'array', items: { type: 'string' } },
                    priority: { type: 'string', enum: ['', ...TASK_PRIORITIES] },
                    frequency: { type: 'string', enum: ['', ...TASK_FREQUENCIES] },
                    quantity: { type: 'number' },
                    unit: { type: 'string' },
                    category: { type: 'string' },
                    amount: { type: 'number' },
                    is_expense: { type: 'boolean' },
                },
            },
        },
    },
};

const WEEKDAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Server-local "today", as YYYY-MM-DD + French weekday name. */
export function localToday(): { iso: string; weekday: string } {
    const now = new Date();
    return {
        iso: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
        weekday: WEEKDAYS_FR[now.getDay()],
    };
}

export function buildParsePrompt(
    members: FamilyMemberRef[],
    // Families can customize their category lists (issue #68) — the AI must offer
    // THEIR categories, not the defaults.
    shoppingCategories: readonly string[] = SHOPPING_CATEGORIES,
    budgetCategories: readonly string[] = BUDGET_CATEGORIES,
): string {
    const { iso, weekday } = localToday();
    const memberList = members.length > 0
        ? members.map((m) => `- ${m.name}`).join('\n')
        : '(aucun membre enregistré)';

    return [
        `Tu es l'assistant d'une application d'organisation familiale. L'utilisateur écrit une note en langage naturel (français ou anglais). Extrais-en un ou plusieurs éléments actionnables.`,
        ``,
        `Date du jour : ${iso} (${weekday}). Résous toutes les dates relatives ("demain", "jeudi soir", "next week"…) par rapport à cette date, vers le futur le plus proche.`,
        ``,
        `Membres de la famille (utilise exactement ces prénoms dans member_names) :`,
        memberList,
        ``,
        `Types d'éléments :`,
        `- "task" : tâche/corvée/rappel. title = intitulé. date = échéance "YYYY-MM-DD" ou "". priority parmi ${TASK_PRIORITIES.join('/')} ou "". frequency parmi ${TASK_FREQUENCIES.join('/')} ou "". member_names = personnes assignées.`,
        `- "appointment" : rendez-vous/événement à une heure précise. start_time = "YYYY-MM-DDTHH:mm:ss" (heure locale, obligatoire), end_time pareil ou "". location = lieu ou "". member_names = personnes concernées.`,
        `- "shopping_item" : article à acheter. title = nom de l'article. category parmi ${shoppingCategories.join('/')}. quantity = nombre (0 si inconnu), unit = unité ("kg", "L"…) ou "".`,
        `- "budget_entry" : dépense ou revenu. title = libellé. amount = montant (nombre > 0). is_expense = true pour une dépense, false pour un revenu. category parmi ${budgetCategories.join('/')}. date = "YYYY-MM-DD" ("" = aujourd'hui).`,
        ``,
        `Règles :`,
        `- Chaque champ non pertinent vaut "" (chaîne vide), 0 (nombre) ou [] (liste). is_expense vaut true par défaut.`,
        `- "lasagnes jeudi soir" dans un contexte de repas/courses = shopping_item ou task de cuisine, pas un rendez-vous, sauf mention d'un horaire précis.`,
        `- Un dîner/repas planifié avec un horaire = appointment.`,
        `- N'invente rien : pas de date si la note n'en donne pas, pas de membre non listé.`,
        `- Réponds UNIQUEMENT avec un objet JSON de la forme {"items":[...]} respectant exactement les champs ci-dessus, sans texte autour.`,
    ].join('\n');
}

interface RawParsedItem {
    type?: unknown;
    title?: unknown;
    description?: unknown;
    date?: unknown;
    start_time?: unknown;
    end_time?: unknown;
    location?: unknown;
    member_names?: unknown;
    priority?: unknown;
    frequency?: unknown;
    quantity?: unknown;
    unit?: unknown;
    category?: unknown;
    amount?: unknown;
    is_expense?: unknown;
}

export type ParsedProposal =
    | {
        type: 'task';
        title: string;
        description: string | null;
        due_date: string | null;
        priority: string | null;
        frequency: string | null;
        assigned_to: string[];
        member_names: string[];
    }
    | {
        type: 'appointment';
        title: string;
        description: string | null;
        start_time: string;
        end_time: string | null;
        location: string | null;
        family_member_ids: string[];
        member_names: string[];
    }
    | {
        type: 'shopping_item';
        name: string;
        category: string;
        quantity: number | null;
        unit: string | null;
    }
    | {
        type: 'budget_entry';
        category: string;
        amount: number;
        description: string | null;
        date: string;
        is_expense: boolean;
    };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

const cleanString = (value: unknown, maxLength: number): string => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

const cleanDate = (value: unknown): string | null => {
    const s = cleanString(value, 10);
    return DATE_RE.test(s) ? s : null;
};

/** Normalize to naive local "YYYY-MM-DDTHH:mm:ss". */
const cleanDateTime = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(DATETIME_RE);
    if (!match) return null;
    return `${match[1]}T${match[2]}:${match[3]}:${match[4] ?? '00'}`;
};

const cleanPositiveNumber = (value: unknown, max: number): number | null => {
    const n = typeof value === 'string' ? parseFloat(value) : (value as number);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(Math.round(n * 100) / 100, max);
};

const resolveMembers = (
    names: unknown,
    members: FamilyMemberRef[]
): { ids: string[]; names: string[] } => {
    if (!Array.isArray(names)) return { ids: [], names: [] };
    const byName = new Map(members.map((m) => [m.name.trim().toLowerCase(), m]));
    const ids: string[] = [];
    const resolved: string[] = [];
    for (const raw of names) {
        if (typeof raw !== 'string') continue;
        const member = byName.get(raw.trim().toLowerCase());
        if (member && !ids.includes(member.id)) {
            ids.push(member.id);
            resolved.push(member.name);
        }
    }
    return { ids, names: resolved };
};

/**
 * Structural validation of the model output: drop invalid items, clamp values,
 * resolve member names → ids (case-insensitively). Returns at most 20 proposals.
 */
export function validateParsedItems(
    raw: Record<string, unknown>,
    members: FamilyMemberRef[],
    shoppingCategories: readonly string[] = SHOPPING_CATEGORIES,
    budgetCategories: readonly string[] = BUDGET_CATEGORIES,
): ParsedProposal[] {
    const items = Array.isArray(raw.items) ? (raw.items as RawParsedItem[]) : [];
    const proposals: ParsedProposal[] = [];

    for (const item of items.slice(0, 20)) {
        if (!item || typeof item !== 'object') continue;
        const title = cleanString(item.title, 255);
        if (!title) continue;
        const description = cleanString(item.description, 1000) || null;

        switch (item.type) {
            case 'task': {
                const priority = cleanString(item.priority, 20);
                const frequency = cleanString(item.frequency, 30);
                const { ids, names } = resolveMembers(item.member_names, members);
                proposals.push({
                    type: 'task',
                    title,
                    description,
                    due_date: cleanDate(item.date),
                    priority: (TASK_PRIORITIES as readonly string[]).includes(priority) ? priority : null,
                    frequency: (TASK_FREQUENCIES as readonly string[]).includes(frequency) ? frequency : null,
                    assigned_to: ids,
                    member_names: names,
                });
                break;
            }
            case 'appointment': {
                const startTime = cleanDateTime(item.start_time);
                if (!startTime) continue; // start_time is mandatory for appointments
                let endTime = cleanDateTime(item.end_time);
                if (endTime && endTime <= startTime) endTime = null;
                const { ids, names } = resolveMembers(item.member_names, members);
                proposals.push({
                    type: 'appointment',
                    title,
                    description,
                    start_time: startTime,
                    end_time: endTime,
                    location: cleanString(item.location, 255) || null,
                    family_member_ids: ids,
                    member_names: names,
                });
                break;
            }
            case 'shopping_item': {
                const category = cleanString(item.category, 30);
                proposals.push({
                    type: 'shopping_item',
                    name: title,
                    category: shoppingCategories.includes(category)
                        ? category
                        : (shoppingCategories.includes('Autre') ? 'Autre' : shoppingCategories[0]),
                    quantity: cleanPositiveNumber(item.quantity, 9999),
                    unit: cleanString(item.unit, 20) || null,
                });
                break;
            }
            case 'budget_entry': {
                const amount = cleanPositiveNumber(item.amount, 1_000_000);
                if (amount === null) continue; // amount is mandatory for budget entries
                const category = cleanString(item.category, 50);
                proposals.push({
                    type: 'budget_entry',
                    category: budgetCategories.includes(category)
                        ? category
                        : (budgetCategories.includes('Autre') ? 'Autre' : budgetCategories[0]),
                    amount,
                    description: description ?? title,
                    date: cleanDate(item.date) ?? localToday().iso,
                    is_expense: item.is_expense === false ? false : true,
                });
                break;
            }
            default:
                break;
        }
    }

    return proposals;
}

// ─── /api/ai/suggest-meals ────────────────────────────────────────────────────

export const MEALS_SCHEMA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['meals'],
    properties: {
        meals: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['date', 'recipe_id'],
                properties: {
                    date: { type: 'string' },
                    recipe_id: { type: 'string' },
                },
            },
        },
    },
};

export interface RecipeRef {
    id: string;
    name: string;
    category: string | null;
}

export function buildMealsPrompt(args: {
    recipes: RecipeRef[];
    missingDates: string[];
    plannedDinners: Array<{ date: string; name: string }>;
    recentRecipeIds: string[];
}): { system: string; user: string } {
    const recipeList = args.recipes
        .map((r) => `- id: ${r.id} | ${r.name}${r.category ? ` (${r.category})` : ''}`)
        .join('\n');
    const recentList = args.recentRecipeIds.length > 0 ? args.recentRecipeIds.join(', ') : '(aucune)';
    const plannedList = args.plannedDinners.length > 0
        ? args.plannedDinners.map((p) => `- ${p.date} : ${p.name}`).join('\n')
        : '(aucun)';

    const system = [
        `Tu es l'assistant repas d'une application d'organisation familiale.`,
        `Propose un dîner pour chacune des dates demandées, en choisissant UNIQUEMENT parmi les recettes fournies (réutilise leurs id exacts).`,
        `Varie les recettes et les catégories sur la semaine, et évite les recettes utilisées les 2 dernières semaines (ids listés) sauf si c'est inévitable.`,
        `Réponds UNIQUEMENT avec un objet JSON {"meals":[{"date":"YYYY-MM-DD","recipe_id":"..."}]}, une entrée par date demandée, sans texte autour.`,
    ].join('\n');

    const user = [
        `Recettes disponibles :`,
        recipeList,
        ``,
        `Dates à compléter (dîners manquants) : ${args.missingDates.join(', ')}`,
        ``,
        `Dîners déjà planifiés cette semaine :`,
        plannedList,
        ``,
        `Recettes utilisées les 2 dernières semaines (à éviter) : ${recentList}`,
    ].join('\n');

    return { system, user };
}

export interface MealProposal {
    date: string;
    meal_type: 'Dîner';
    recipe_id: string;
    recipe_name: string;
}

/** Keep only proposals targeting a missing day with a known recipe id (one per day). */
export function validateMealProposals(
    raw: Record<string, unknown>,
    missingDates: string[],
    recipes: RecipeRef[]
): MealProposal[] {
    const meals = Array.isArray(raw.meals) ? (raw.meals as Array<{ date?: unknown; recipe_id?: unknown }>) : [];
    const recipesById = new Map(recipes.map((r) => [r.id, r]));
    const allowedDates = new Set(missingDates);
    const seenDates = new Set<string>();
    const proposals: MealProposal[] = [];

    for (const meal of meals) {
        if (!meal || typeof meal !== 'object') continue;
        const date = typeof meal.date === 'string' ? meal.date.trim() : '';
        const recipeId = typeof meal.recipe_id === 'string' ? meal.recipe_id.trim() : '';
        if (!allowedDates.has(date) || seenDates.has(date)) continue;
        const recipe = recipesById.get(recipeId);
        if (!recipe) continue;
        seenDates.add(date);
        proposals.push({ date, meal_type: 'Dîner', recipe_id: recipe.id, recipe_name: recipe.name });
    }

    // Keep the calendar order.
    return proposals.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Recipe refinement ─────────────────────────────────────────────────────────
// Cleans up a rough recipe (a pasted block, or the rough output of an import)
// into the shape the recipe form expects. The recipe KEEPS its own language:
// only the JSON keys and the category are ours.

export const REFINE_RECIPE_SCHEMA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'category', 'ingredients', 'instructions'],
    properties: {
        name: { type: 'string' },
        category: { type: 'string' },
        description: { type: 'string' },
        ingredients: { type: 'array', items: { type: 'string' } },
        instructions: { type: 'array', items: { type: 'string' } },
        prep_time: { type: 'number' },
        cook_time: { type: 'number' },
        servings: { type: 'number' },
    },
};

export function buildRefineRecipePrompt(
    // Families can customize their category lists (issue #68) — same rule as
    // buildParsePrompt: offer THEIR categories, never the defaults.
    recipeCategories: readonly string[] = DEFAULT_RECIPE_CATEGORIES,
): string {
    return [
        `Tu es un chef professionnel. On te donne une recette en vrac ; réorganise-la proprement.`,
        ``,
        `Règle absolue : garde la recette dans SA langue d'origine (français, anglais, portugais…). Ne traduis ni les ingrédients, ni les étapes, ni le titre.`,
        ``,
        `- name : titre court et appétissant, dans la langue de la recette.`,
        `- category : choisis exactement une valeur parmi ${recipeCategories.join('/')}.`,
        `- description : 1 à 2 phrases, dans la langue de la recette.`,
        `- ingredients : un ingrédient par entrée, avec sa quantité. Si la recette a des parties distinctes (pâte, garniture, nappage…), préfixe chaque entrée par la partie entre crochets, dans la langue de la recette : "[Pâte] 4 œufs", "[Massa] 4 ovos", "[Dough] 4 eggs".`,
        `- instructions : les étapes dans l'ordre, une par entrée, même règle de préfixe.`,
        `- prep_time, cook_time, servings : des nombres, uniquement si la recette les donne.`,
        ``,
        `N'invente rien : si la recette ne précise pas un temps ou un nombre de portions, omets le champ.`,
        `Réponds UNIQUEMENT avec l'objet JSON, sans texte autour.`,
    ].join('\n');
}

export interface RefinedRecipe {
    name: string;
    category: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    prep_time: number | null;
    cook_time: number | null;
    servings: number | null;
}

const cleanStringList = (value: unknown, maxItems: number, maxLength: number): string[] => {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const entry of value) {
        const line = cleanString(entry, maxLength);
        if (line) out.push(line);
        if (out.length >= maxItems) break;
    }
    return out;
};

export function validateRefinedRecipe(
    raw: Record<string, unknown>,
    recipeCategories: readonly string[],
): RefinedRecipe {
    // The model is told to pick from the family's list, but nothing guarantees it
    // does: fall back to the family's own first category rather than a hardcoded one.
    const proposed = cleanString(raw.category, 50);
    const category = recipeCategories.includes(proposed) ? proposed : recipeCategories[0];

    return {
        name: cleanString(raw.name, 255),
        category,
        description: cleanString(raw.description, 1000),
        ingredients: cleanStringList(raw.ingredients, 100, 255),
        instructions: cleanStringList(raw.instructions, 100, 2000),
        prep_time: cleanPositiveNumber(raw.prep_time, 1440),
        cook_time: cleanPositiveNumber(raw.cook_time, 1440),
        servings: cleanPositiveNumber(raw.servings, 100),
    };
}
