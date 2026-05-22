import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import {
    Sparkles,
    X as CloseIcon,
    Loader2,
    Clock,
    Users,
    ChefHat,
    AlertTriangle,
    Check,
} from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select } from '../ui';

// Mirrors the server's RecipeGenerationInput.cuisine and the server's
// GeneratedRecipe shape. Kept inline because the server's types are owned
// elsewhere and the client doesn't depend on @keurtonux/server.
type Cuisine = 'senegalese' | 'world' | 'any';

interface GeneratedRecipe {
    name: string;
    category: 'Entrée' | 'Plat' | 'Dessert' | 'Snack';
    description: string;
    ingredients: string[];
    instructions: string[];
    prep_time: number;
    cook_time: number;
    servings: number;
    difficulty: 'Facile' | 'Moyen' | 'Difficile';
    tags: string[];
}

interface FamilyMemberLite {
    id: string;
    name: string;
    color: string;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called when the user saves a generated recipe so the page can refresh. */
    onRecipeSaved?: () => void;
}

// Stored DATA values — labels resolved at render time via i18n.
const CUISINE_VALUES = ['senegalese', 'world', 'any'] as const;
const TIME_VALUES = ['30', '45', '60', ''] as const;

// Stable defaults remembered across opens so the dialog feels personal.
const PREFS_STORAGE_KEY = 'openfamily.recipeGen.prefs.v1';

interface RememberedPrefs {
    cuisine: Cuisine;
    simple: boolean;
    maxTime: string;
    familyMemberIds: string[];
}

const loadRememberedPrefs = (): RememberedPrefs => {
    try {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw) throw new Error('miss');
        const parsed = JSON.parse(raw);
        return {
            cuisine:
                parsed.cuisine === 'world' || parsed.cuisine === 'any'
                    ? parsed.cuisine
                    : 'senegalese',
            simple: typeof parsed.simple === 'boolean' ? parsed.simple : true,
            maxTime: typeof parsed.maxTime === 'string' ? parsed.maxTime : '45',
            familyMemberIds: Array.isArray(parsed.familyMemberIds) ? parsed.familyMemberIds : [],
        };
    } catch {
        return { cuisine: 'senegalese', simple: true, maxTime: '45', familyMemberIds: [] };
    }
};

export const GenerateRecipeDialog: React.FC<Props> = ({ open, onOpenChange, onRecipeSaved }) => {
    const { t } = useTranslation();
    const cuisineOptions = CUISINE_VALUES.map((value) => ({
        value,
        label: t('recipes.generateDialog.cuisine_options.' + value, { defaultValue: value }),
    }));
    const timeOptions = TIME_VALUES.map((value) => ({
        value,
        label: value
            ? t('recipes.generateDialog.time_options.' + value, { defaultValue: value })
            : t('recipes.generateDialog.time_options.none'),
    }));
    const [members, setMembers] = useState<FamilyMemberLite[]>([]);
    const [ingredientInput, setIngredientInput] = useState('');
    const [ingredients, setIngredients] = useState<string[]>([]);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [cuisine, setCuisine] = useState<Cuisine>('senegalese');
    const [simple, setSimple] = useState(true);
    const [maxTime, setMaxTime] = useState('45');

    const [generating, setGenerating] = useState(false);
    const [savingIndex, setSavingIndex] = useState<number | null>(null);
    const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
    const [error, setError] = useState('');
    const [recipes, setRecipes] = useState<GeneratedRecipe[] | null>(null);

    // Hydrate from localStorage once when the dialog mounts.
    useEffect(() => {
        const remembered = loadRememberedPrefs();
        setCuisine(remembered.cuisine);
        setSimple(remembered.simple);
        setMaxTime(remembered.maxTime);
        setSelectedMemberIds(remembered.familyMemberIds);
    }, []);

    useEffect(() => {
        if (!open) return;
        api.get<{ success: boolean; data: FamilyMemberLite[] }>('/api/family')
            .then((response) => {
                if (response.success) setMembers(response.data);
            })
            .catch((err) => {
                console.error('Failed to load family members for AI dialog:', err);
            });
    }, [open]);

    const addIngredient = () => {
        const trimmed = ingredientInput.trim();
        if (!trimmed) return;
        // Allow comma-separated paste.
        const tokens = trimmed
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        setIngredients((prev) => {
            const next = [...prev];
            for (const t of tokens) {
                if (!next.includes(t) && next.length < 30) next.push(t);
            }
            return next;
        });
        setIngredientInput('');
    };

    const removeIngredient = (idx: number) => {
        setIngredients((prev) => prev.filter((_, i) => i !== idx));
    };

    const toggleMember = (id: string) => {
        setSelectedMemberIds((prev) =>
            prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
        );
    };

    const persistPrefs = () => {
        try {
            localStorage.setItem(
                PREFS_STORAGE_KEY,
                JSON.stringify({ cuisine, simple, maxTime, familyMemberIds: selectedMemberIds }),
            );
        } catch {
            /* localStorage unavailable — non-fatal */
        }
    };

    const generate = async () => {
        setError('');
        if (ingredients.length === 0) {
            setError(t('recipes.generateDialog.errors.no_ingredient'));
            return;
        }
        setGenerating(true);
        setRecipes(null);
        setSavedIndices(new Set());
        persistPrefs();

        try {
            const body: Record<string, unknown> = {
                ingredients,
                cuisine,
                simple,
                count: 3,
            };
            if (maxTime) body.maxTimeMinutes = Number(maxTime);
            if (selectedMemberIds.length > 0) body.familyMemberIds = selectedMemberIds;

            const response = await api.post<{
                success: boolean;
                data?: { recipes: GeneratedRecipe[]; model: string };
                error?: { code?: string; message?: string };
            }>('/api/ai/recipes/generate', body);

            if (!response.success) {
                const code = response.error?.code;
                if (code === 'DISABLED') {
                    setError(t('recipes.generateDialog.errors.disabled'));
                } else if (code === 'QUOTA_EXCEEDED') {
                    setError(t('recipes.generateDialog.errors.quota_exceeded'));
                } else if (code === 'BAD_JSON') {
                    setError(t('recipes.generateDialog.errors.bad_json'));
                } else {
                    setError(
                        response.error?.message ||
                            t('recipes.generateDialog.errors.generate_failed'),
                    );
                }
                return;
            }

            setRecipes(response.data?.recipes ?? []);
        } catch (err) {
            console.error('Recipe generation failed:', err);
            setError(
                err instanceof Error
                    ? err.message
                    : t('recipes.generateDialog.errors.generate_failed'),
            );
        } finally {
            setGenerating(false);
        }
    };

    const saveRecipe = async (index: number) => {
        const recipe = recipes?.[index];
        if (!recipe) return;
        setSavingIndex(index);
        setError('');
        try {
            await api.post('/api/recipes', recipe);
            setSavedIndices((prev) => new Set(prev).add(index));
            onRecipeSaved?.();
        } catch (err) {
            console.error('Failed to save recipe:', err);
            setError(
                err instanceof Error ? err.message : t('recipes.generateDialog.errors.save_failed'),
            );
        } finally {
            setSavingIndex(null);
        }
    };

    const closeAndReset = () => {
        onOpenChange(false);
        // Keep generated recipes visible if reopened soon — clear ingredients only.
        setError('');
    };

    const aiHint = useMemo(() => {
        const parts: string[] = [];
        if (simple) parts.push(t('recipes.generateDialog.hint.simple'));
        if (cuisine === 'senegalese') parts.push(t('recipes.generateDialog.hint.senegalese'));
        if (cuisine === 'world') parts.push(t('recipes.generateDialog.hint.world'));
        if (maxTime) parts.push(t('recipes.generateDialog.hint.max_time', { minutes: maxTime }));
        return parts.join(' • ');
    }, [simple, cuisine, maxTime, t]);

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('recipes.generateDialog.title')}
            description={t('recipes.generateDialog.description')}
            className="sm:max-w-3xl"
        >
            <div className="space-y-6">
                {/* Ingredients input */}
                <section>
                    <label className="block text-label font-medium text-foreground mb-1.5">
                        {t('recipes.generateDialog.available_ingredients')}
                    </label>
                    <div className="flex gap-2">
                        <Input
                            value={ingredientInput}
                            onChange={(e) => setIngredientInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addIngredient();
                                }
                            }}
                            placeholder={t('recipes.generateDialog.ingredient_placeholder')}
                        />
                        <Button type="button" variant="secondary" onClick={addIngredient}>
                            {t('common.add')}
                        </Button>
                    </div>
                    {ingredients.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {ingredients.map((ing, idx) => (
                                <span
                                    key={`${ing}-${idx}`}
                                    className="inline-flex items-center gap-1 rounded-pill bg-primary/10 text-primary px-3 py-1 text-label-sm"
                                >
                                    {ing}
                                    <button
                                        type="button"
                                        onClick={() => removeIngredient(idx)}
                                        className="hover:text-primary-pressed"
                                        aria-label={t('recipes.generateDialog.remove_ingredient', {
                                            name: ing,
                                        })}
                                    >
                                        <CloseIcon className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <p className="text-label-sm text-muted-foreground mt-2">
                        {t('recipes.generateDialog.ingredients_tip')}
                    </p>
                </section>

                {/* Members selection */}
                {members.length > 0 && (
                    <section>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('recipes.generateDialog.for_whom')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {members.map((m) => {
                                const selected = selectedMemberIds.includes(m.id);
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => toggleMember(m.id)}
                                        className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-label-sm transition-colors ${
                                            selected
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border bg-surface text-muted-foreground hover:bg-surface-2'
                                        }`}
                                    >
                                        <span
                                            className="inline-block h-2.5 w-2.5 rounded-full"
                                            style={{ background: m.color }}
                                        />
                                        {m.name}
                                        {selected && <Check className="h-3.5 w-3.5" />}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Preferences */}
                <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('recipes.generateDialog.cuisine')}
                        </label>
                        <Select
                            value={cuisine}
                            onValueChange={(v) => setCuisine(v as Cuisine)}
                            options={cuisineOptions}
                        />
                    </div>
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('recipes.generateDialog.total_time')}
                        </label>
                        <Select
                            value={maxTime}
                            onValueChange={(v) => setMaxTime(v)}
                            options={timeOptions}
                        />
                    </div>
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('recipes.generateDialog.style')}
                        </label>
                        <label className="flex items-center gap-2 h-10 px-3 rounded-input border border-border bg-surface cursor-pointer">
                            <input
                                type="checkbox"
                                checked={simple}
                                onChange={(e) => setSimple(e.target.checked)}
                                className="h-4 w-4 accent-primary"
                            />
                            <span className="text-label-sm">
                                {t('recipes.generateDialog.simple_dishes')}
                            </span>
                        </label>
                    </div>
                </section>

                {/* Errors */}
                {error && (
                    <div className="flex items-start gap-2 rounded-input border border-danger/30 bg-danger-soft px-4 py-3 text-caption text-danger">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Generate / preview */}
                {!recipes && (
                    <div className="flex items-center justify-between gap-4 pt-2">
                        <p className="text-label-sm text-muted-foreground">{aiHint}</p>
                        <Button type="button" onClick={generate} disabled={generating}>
                            {generating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {t('recipes.generateDialog.generating')}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {t('recipes.generateDialog.generate')}
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {recipes && (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-h2 font-semibold flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-accent" />
                                {t('recipes.generateDialog.proposals', { count: recipes.length })}
                            </h3>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={generate}
                                disabled={generating}
                            >
                                {generating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        {t('recipes.generateDialog.re_generating')}
                                    </>
                                ) : (
                                    t('recipes.generateDialog.re_generate')
                                )}
                            </Button>
                        </div>

                        {recipes.map((r, idx) => (
                            <Card key={`${r.name}-${idx}`}>
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h4 className="text-body font-semibold flex items-center gap-2">
                                                <ChefHat className="h-4 w-4 text-primary flex-shrink-0" />
                                                <span className="truncate">{r.name}</span>
                                            </h4>
                                            {r.description && (
                                                <p className="text-caption text-muted-foreground mt-1">
                                                    {r.description}
                                                </p>
                                            )}
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={
                                                savedIndices.has(idx) ? 'secondary' : 'primary'
                                            }
                                            disabled={savingIndex === idx || savedIndices.has(idx)}
                                            onClick={() => saveRecipe(idx)}
                                        >
                                            {savedIndices.has(idx) ? (
                                                <>
                                                    <Check className="w-4 h-4 mr-1" />
                                                    {t('recipes.generateDialog.saved')}
                                                </>
                                            ) : savingIndex === idx ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                t('recipes.generateDialog.save')
                                            )}
                                        </Button>
                                    </div>

                                    <div className="flex flex-wrap gap-3 text-label-sm text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="h-3.5 w-3.5" />
                                            {t('recipes.generateDialog.minutes', {
                                                count: r.prep_time + r.cook_time,
                                            })}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5" />
                                            {t('recipes.generateDialog.servings_short', {
                                                count: r.servings,
                                            })}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            {t('recipes.categories.' + r.category, {
                                                defaultValue: r.category,
                                            })}{' '}
                                            •{' '}
                                            {t('recipes.difficulties.' + r.difficulty, {
                                                defaultValue: r.difficulty,
                                            })}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-caption">
                                        <div>
                                            <p className="font-semibold text-foreground mb-1">
                                                {t('recipes.generateDialog.ingredients')}
                                            </p>
                                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                                                {r.ingredients.map((ing, i) => (
                                                    <li key={i}>{ing}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground mb-1">
                                                {t('recipes.generateDialog.steps')}
                                            </p>
                                            <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                                                {r.instructions.map((step, i) => (
                                                    <li key={i}>{step}</li>
                                                ))}
                                            </ol>
                                        </div>
                                    </div>

                                    {r.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {r.tags.map((t, i) => (
                                                <span
                                                    key={i}
                                                    className="rounded-pill bg-accent-soft text-accent-foreground px-2 py-0.5 text-label-sm"
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </section>
                )}

                {recipes && (
                    <div className="flex justify-end pt-2">
                        <Button type="button" variant="secondary" onClick={closeAndReset}>
                            {t('recipes.generateDialog.close')}
                        </Button>
                    </div>
                )}
            </div>
        </Dialog>
    );
};
