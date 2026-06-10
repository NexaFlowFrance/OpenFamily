import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api } from '../lib/api';
import { Plus, ChevronLeft, ChevronRight, Edit2, Trash2, ShoppingCart, Sparkles, Loader2, UtensilsCrossed } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea, useToast } from '../components/ui';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import { dateLocale } from '../i18n/format';
import { useAiEnabled } from '../lib/aiStatus';
import { aiErrorKey } from '../components/app/MagicInput';

interface MealPlan {
    id: string;
    date: string;
    meal_type: string;
    recipe_id?: string;
    custom_meal?: string;
    notes?: string;
    recipe?: {
        id: string;
        name: string;
    };
}

interface Recipe {
    id: string;
    name: string;
    category: string;
    ingredients?: string[];
}

interface IngredientLine {
    key: string; // normalized (trimmed, lowercase) ingredient text
    label: string; // original text as written in the recipe
    count: number; // occurrences across the week's recipe meals
    recipeNames: string[];
    alreadyOnList: boolean;
}

const MEAL_TYPES = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Snack'];

interface MealProposal {
    date: string;
    meal_type: 'Dîner';
    recipe_id: string;
    recipe_name: string;
}

const MealPlanning: React.FC = () => {
    const { t } = useTranslation(['meals', 'recipes', 'common', 'ai']);
    const mealTypeLabel = (v: string) => t(`meals:mealTypes.${v}`, { defaultValue: v });
    const recipeCategoryLabel = (v: string) => t(`recipes:categories.${v}`, { defaultValue: v });
    const [currentWeek, setCurrentWeek] = useState(new Date());
    const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingMeal, setEditingMeal] = useState<MealPlan | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedMealType, setSelectedMealType] = useState<string>('');
    const [error, setError] = useState('');
    const { showToast } = useToast();
    const [shoppingDialogOpen, setShoppingDialogOpen] = useState(false);
    const [ingredientLines, setIngredientLines] = useState<IngredientLine[]>([]);
    const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
    const [addingIngredients, setAddingIngredients] = useState(false);
    const aiEnabled = useAiEnabled();
    const [aiDialogOpen, setAiDialogOpen] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiProposals, setAiProposals] = useState<MealProposal[]>([]);
    const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());
    const [creatingMeals, setCreatingMeals] = useState(false);

    const [formData, setFormData] = useState({
        meal_type: 'Déjeuner',
        recipe_id: '',
        custom_meal: '',
        notes: '',
    });

    useEffect(() => {
        loadMealPlans();
        loadRecipes();
    }, [currentWeek]);
    useWebSocketUpdates('meal-plans', () => { void loadMealPlans(); });
    useWebSocketUpdates('recipes', () => { void loadRecipes(); });

    const loadMealPlans = async () => {
        try {
            const start = startOfWeek(currentWeek, { weekStartsOn: 1 });
            const end = endOfWeek(currentWeek, { weekStartsOn: 1 });
            const response = await api.get<{ success: boolean; data: MealPlan[] }>(
                `/api/meal-plans?start_date=${format(start, 'yyyy-MM-dd')}&end_date=${format(end, 'yyyy-MM-dd')}`
            );
            if (response.success) {
                setMealPlans(response.data);
            }
        } catch (error) {
            console.error('Failed to load meal plans:', error);
            setError(error instanceof Error ? error.message : t('meals:errors.loadPlans'));
        } finally {
            setLoading(false);
        }
    };

    const loadRecipes = async () => {
        try {
            const response = await api.get<{ success: boolean; data: Recipe[] }>('/api/recipes');
            if (response.success) {
                setRecipes(response.data);
            }
        } catch (error) {
            console.error('Failed to load recipes:', error);
            setError(error instanceof Error ? error.message : t('meals:errors.loadRecipes'));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDate) return;
        setError('');

        try {
            const payload = {
                date: format(selectedDate, 'yyyy-MM-dd'),
                meal_type: formData.meal_type,
                recipe_id: formData.recipe_id || null,
                custom_meal: formData.custom_meal || null,
                notes: formData.notes || null,
            };

            if (editingMeal) {
                await api.put(`/api/meal-plans/${editingMeal.id}`, payload);
            } else {
                await api.post('/api/meal-plans', payload);
            }
            setDialogOpen(false);
            resetForm();
            loadMealPlans();
        } catch (error) {
            console.error('Failed to save meal plan:', error);
            setError(error instanceof Error ? error.message : t('meals:errors.save'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('meals:confirmDelete'))) return;
        try {
            await api.delete(`/api/meal-plans/${id}`);
            loadMealPlans();
        } catch (error) {
            console.error('Failed to delete meal plan:', error);
            setError(error instanceof Error ? error.message : t('meals:errors.delete'));
        }
    };

    const handleEdit = (meal: MealPlan) => {
        setEditingMeal(meal);
        // Use noon to avoid timezone shifts when parsing date strings
        setSelectedDate(new Date(meal.date + 'T12:00:00'));
        setSelectedMealType(meal.meal_type);
        setFormData({
            meal_type: meal.meal_type,
            recipe_id: meal.recipe_id || '',
            custom_meal: meal.custom_meal || '',
            notes: meal.notes || '',
        });
        setDialogOpen(true);
    };

    const handleAddMeal = (date: Date, mealType: string) => {
        setEditingMeal(null);
        setSelectedDate(date);
        setSelectedMealType(mealType);
        setFormData({
            meal_type: mealType,
            recipe_id: '',
            custom_meal: '',
            notes: '',
        });
        setError('');
        setDialogOpen(true);
    };

    const resetForm = () => {
        setEditingMeal(null);
        setSelectedDate(null);
        setSelectedMealType('');
        setError('');
        setFormData({
            meal_type: 'Déjeuner',
            recipe_id: '',
            custom_meal: '',
            notes: '',
        });
    };

    // Aggregate every ingredient from the displayed week's recipe-based meals
    // (custom meals without recipe_id are skipped), then open the confirmation
    // dialog. Identical strings (trimmed, case-insensitive) are merged with a
    // ×N count; ingredients already on the list (unchecked) start unselected.
    const openShoppingDialog = async () => {
        setError('');
        const lines = new Map<string, IngredientLine>();
        for (const meal of mealPlans) {
            if (!meal.recipe_id) continue;
            const recipe = recipes.find((r) => r.id === meal.recipe_id);
            if (!recipe?.ingredients?.length) continue;
            for (const raw of recipe.ingredients) {
                const label = raw.trim();
                if (!label) continue;
                const key = label.toLowerCase();
                const line = lines.get(key);
                if (line) {
                    line.count += 1;
                    if (!line.recipeNames.includes(recipe.name)) line.recipeNames.push(recipe.name);
                } else {
                    lines.set(key, { key, label, count: 1, recipeNames: [recipe.name], alreadyOnList: false });
                }
            }
        }

        try {
            const response = await api.get<{ success: boolean; data: Array<{ name: string; is_checked: boolean }> }>(
                '/api/shopping'
            );
            if (response.success) {
                const unchecked = new Set(
                    response.data
                        .filter((item) => !item.is_checked)
                        .map((item) => item.name.trim().toLowerCase())
                );
                for (const line of lines.values()) {
                    line.alreadyOnList = unchecked.has(line.key);
                }
            }
        } catch (error) {
            // Non-blocking: without the list we simply skip the "already on the list" hint.
            console.error('Failed to load shopping items:', error);
        }

        const list = Array.from(lines.values());
        setIngredientLines(list);
        setSelectedIngredients(new Set(list.filter((line) => !line.alreadyOnList).map((line) => line.key)));
        setShoppingDialogOpen(true);
    };

    const toggleIngredient = (key: string) => {
        setSelectedIngredients((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleConfirmAddToShopping = async () => {
        const selected = ingredientLines.filter((line) => selectedIngredients.has(line.key));
        if (selected.length === 0) return;
        setAddingIngredients(true);
        let added = 0;
        let failed = 0;
        for (const line of selected) {
            try {
                await api.post('/api/shopping', {
                    name: line.label,
                    category: 'Alimentation',
                    quantity: line.count > 1 ? line.count : undefined,
                });
                added += 1;
            } catch (error) {
                console.error('Failed to add ingredient to shopping list:', error);
                failed += 1;
            }
        }
        setAddingIngredients(false);
        setShoppingDialogOpen(false);
        if (failed === 0) {
            showToast({
                title: t('meals:shopping.successTitle'),
                description: t('meals:shopping.successDescription', { count: added }),
            });
        } else if (added > 0) {
            showToast({
                title: t('meals:shopping.partialTitle'),
                description: t('meals:shopping.partialDescription', { added, failed }),
            });
        } else {
            showToast({
                title: t('meals:shopping.errorTitle'),
                description: t('meals:shopping.errorDescription'),
            });
        }
    };

    // ── AI menu suggestions ("Proposer un menu ✨") ───────────────────────────
    const handleSuggestMeals = async () => {
        setAiLoading(true);
        setAiError('');
        setAiProposals([]);
        setSelectedProposals(new Set());
        setAiDialogOpen(true);
        try {
            const start = startOfWeek(currentWeek, { weekStartsOn: 1 });
            const response = await api.post<{ success: boolean; data: { proposals: MealProposal[] } }>(
                '/api/ai/suggest-meals',
                { week_start: format(start, 'yyyy-MM-dd') }
            );
            const proposals = response.success ? response.data.proposals : [];
            setAiProposals(proposals);
            setSelectedProposals(new Set(proposals.map((p) => p.date)));
        } catch (error) {
            const key = aiErrorKey(error);
            setAiError(key ? t(`ai:errors.${key}`) : error instanceof Error ? error.message : t('ai:errors.AI_PROVIDER_ERROR'));
        } finally {
            setAiLoading(false);
        }
    };

    const toggleProposal = (date: string) => {
        setSelectedProposals((prev) => {
            const next = new Set(prev);
            if (next.has(date)) next.delete(date);
            else next.add(date);
            return next;
        });
    };

    const handleConfirmProposals = async () => {
        const chosen = aiProposals.filter((p) => selectedProposals.has(p.date));
        if (chosen.length === 0) return;
        setCreatingMeals(true);
        let added = 0;
        let failed = 0;
        for (const proposal of chosen) {
            try {
                await api.post('/api/meal-plans', {
                    date: proposal.date,
                    meal_type: proposal.meal_type,
                    recipe_id: proposal.recipe_id,
                });
                added += 1;
            } catch (error) {
                console.error('Failed to create suggested meal:', error);
                failed += 1;
            }
        }
        setCreatingMeals(false);
        setAiDialogOpen(false);
        void loadMealPlans();
        if (failed === 0) {
            showToast({
                title: t('ai:meals.successTitle'),
                description: t('ai:meals.successDescription', { count: added }),
            });
        } else {
            showToast({
                title: t('ai:meals.partialTitle'),
                description: t('ai:meals.partialDescription', { added, failed }),
            });
        }
    };

    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const getMealForSlot = (date: Date, mealType: string) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return mealPlans.find(
            (meal) => meal.date === dateStr && meal.meal_type === mealType
        );
    };

    const getMealTypeColor = (mealType: string) => {
        switch (mealType) {
            case 'Petit-déjeuner':
                return 'from-amber-50 to-orange-50 border-amber-200 dark:from-amber-950/30 dark:to-orange-950/30 dark:border-amber-800';
            case 'Déjeuner':
                return 'from-blue-50 to-cyan-50 border-blue-200 dark:from-blue-950/30 dark:to-cyan-950/30 dark:border-blue-800';
            case 'Dîner':
                return 'from-purple-50 to-pink-50 border-purple-200 dark:from-purple-950/30 dark:to-pink-950/30 dark:border-purple-800';
            case 'Snack':
                return 'from-emerald-50 to-teal-50 border-emerald-200 dark:from-emerald-950/30 dark:to-teal-950/30 dark:border-emerald-800';
            default:
                return 'from-gray-50 to-gray-100 border-gray-200 dark:from-gray-900/30 dark:to-gray-800/30 dark:border-gray-700';
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">
                        {t('meals:loading')}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {error}
                </div>
            ) : null}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 mb-1">{t('meals:title')}</h1>
                    <p className="text-muted-foreground text-body">{t('meals:subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setCurrentWeek(new Date())}>
                        {t('meals:thisWeek')}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={openShoppingDialog}>
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        {t('meals:shopping.button')}
                    </Button>
                    {aiEnabled && (
                        <Button size="sm" variant="secondary" onClick={() => void handleSuggestMeals()}>
                            <Sparkles className="w-4 h-4 mr-2 text-primary" />
                            {t('ai:meals.button')}
                        </Button>
                    )}
                </div>
            </div>

            <Card>
                <CardContent className="p-6">
                    <h2 className="text-h2 font-semibold mb-4">
                        {t('meals:weekOf', {
                            start: format(weekStart, 'dd MMM', { locale: dateLocale() }),
                            end: format(weekEnd, 'dd MMM yyyy', { locale: dateLocale() }),
                        })}
                    </h2>

                    {/* Weekly Grid */}
                    <div className="overflow-x-auto">
                        <div className="min-w-[800px]">
                            {/* Header */}
                            <div className="grid grid-cols-8 gap-2 mb-2">
                                <div className="font-semibold text-body-sm text-muted-foreground"></div>
                                {weekDays.map((day) => (
                                    <div key={day.toISOString()} className="text-center">
                                        <div className="font-semibold text-body-sm capitalize">
                                            {format(day, 'EEE', { locale: dateLocale() })}
                                        </div>
                                        <div className="text-label text-muted-foreground">
                                            {format(day, 'dd MMM', { locale: dateLocale() })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Meal Rows */}
                            {MEAL_TYPES.map((mealType) => (
                                <div key={mealType} className="grid grid-cols-8 gap-2 mb-2">
                                    <div className="flex items-center font-medium text-body-sm text-muted-foreground">
                                        {mealTypeLabel(mealType)}
                                    </div>
                                    {weekDays.map((day) => {
                                        const meal = getMealForSlot(day, mealType);
                                        return (
                                            <div
                                                key={`${day.toISOString()}-${mealType}`}
                                                className={`min-h-[80px] p-2 rounded-lg border bg-gradient-to-br ${getMealTypeColor(
                                                    mealType
                                                )} ${meal ? 'cursor-pointer hover:shadow-md' : 'cursor-pointer hover:bg-opacity-80'
                                                    } transition-all`}
                                                onClick={() =>
                                                    meal ? handleEdit(meal) : handleAddMeal(day, mealType)
                                                }
                                            >
                                                {meal ? (
                                                    <div className="space-y-1">
                                                        <div className="font-medium text-body-sm line-clamp-2">
                                                            {meal.recipe?.name || meal.custom_meal}
                                                        </div>
                                                        {meal.notes && (
                                                            <div className="text-[10px] text-muted-foreground line-clamp-1">
                                                                {meal.notes}
                                                            </div>
                                                        )}
                                                        <div className="flex gap-1 mt-2">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleEdit(meal);
                                                                }}
                                                                className="p-1 hover:bg-card/70 rounded"
                                                            >
                                                                <Edit2 className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDelete(meal.id);
                                                                }}
                                                                className="p-1 hover:bg-card/70 rounded"
                                                            >
                                                                <Trash2 className="h-3 w-3 text-red-500" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center h-full opacity-40">
                                                        <Plus className="h-5 w-5" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title={editingMeal ? t('meals:dialog.editTitle') : t('meals:dialog.addTitle')}
                description={
                    selectedDate
                        ? t('meals:dialog.descriptionFmt', {
                            type: mealTypeLabel(selectedMealType),
                            date: format(selectedDate, 'dd MMMM yyyy', { locale: dateLocale() }),
                        })
                        : ''
                }
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('meals:form.mealType')}
                        </label>
                        <Select
                            value={formData.meal_type}
                            onValueChange={(value) => setFormData({ ...formData, meal_type: value })}
                            options={MEAL_TYPES.map((type) => ({ value: type, label: mealTypeLabel(type) }))}
                        />
                    </div>
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('meals:form.recipe')}
                        </label>
                        <Select
                            value={formData.recipe_id}
                            onValueChange={(value) =>
                                setFormData({ ...formData, recipe_id: value, custom_meal: '' })
                            }
                            options={[
                                { value: '', label: t('meals:form.noRecipe') },
                                ...recipes.map((recipe) => ({
                                    value: recipe.id,
                                    label: `${recipe.name} (${recipeCategoryLabel(recipe.category)})`,
                                })),
                            ]}
                        />
                    </div>
                    {!formData.recipe_id && (
                        <Input
                            label={t('meals:form.customMeal')}
                            value={formData.custom_meal}
                            onChange={(e) => setFormData({ ...formData, custom_meal: e.target.value })}
                            placeholder={t('meals:form.customMealPlaceholder')}
                        />
                    )}
                    <Textarea
                        label={t('meals:form.notes')}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder={t('meals:form.notesPlaceholder')}
                        rows={2}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit">{editingMeal ? t('common:actions.save') : t('common:actions.add')}</Button>
                    </div>
                </form>
            </Dialog>

            {/* Add ingredients to shopping list dialog */}
            <Dialog
                open={shoppingDialogOpen}
                onOpenChange={setShoppingDialogOpen}
                title={t('meals:shopping.dialogTitle')}
                description={t('meals:shopping.dialogDescription', {
                    start: format(weekStart, 'dd MMM', { locale: dateLocale() }),
                    end: format(weekEnd, 'dd MMM', { locale: dateLocale() }),
                })}
            >
                {ingredientLines.length === 0 ? (
                    <div className="py-8 text-center">
                        <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                        <p className="text-body-sm text-muted-foreground">{t('meals:shopping.empty')}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="text-label font-medium text-foreground">
                            {t('meals:shopping.selectedCount', {
                                selected: selectedIngredients.size,
                                total: ingredientLines.length,
                            })}
                        </div>
                        <div className="max-h-72 space-y-1 overflow-y-auto rounded-input border border-border p-3">
                            {ingredientLines.map((line) => (
                                <label
                                    key={line.key}
                                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-nexus-background"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIngredients.has(line.key)}
                                        onChange={() => toggleIngredient(line.key)}
                                        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="text-body-sm text-foreground">
                                            {line.label}
                                            {line.count > 1 && (
                                                <span className="ml-1.5 font-semibold text-primary">×{line.count}</span>
                                            )}
                                        </span>
                                        <span className="block text-micro text-muted-foreground">
                                            {line.recipeNames.join(', ')}
                                            {line.alreadyOnList && (
                                                <span className="italic"> · {t('meals:shopping.alreadyOnList')}</span>
                                            )}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="secondary" onClick={() => setShoppingDialogOpen(false)}>
                        {t('common:actions.cancel')}
                    </Button>
                    {ingredientLines.length > 0 && (
                        <Button
                            type="button"
                            onClick={handleConfirmAddToShopping}
                            disabled={addingIngredients || selectedIngredients.size === 0}
                        >
                            <ShoppingCart className="w-4 h-4 mr-2" />
                            {t('meals:shopping.confirm', { count: selectedIngredients.size })}
                        </Button>
                    )}
                </div>
            </Dialog>
            {/* AI dinner suggestions dialog */}
            <Dialog
                open={aiDialogOpen}
                onOpenChange={setAiDialogOpen}
                title={t('ai:meals.dialogTitle')}
                description={t('ai:meals.dialogDescription', {
                    start: format(weekStart, 'dd MMM', { locale: dateLocale() }),
                    end: format(weekEnd, 'dd MMM', { locale: dateLocale() }),
                })}
            >
                {aiLoading ? (
                    <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-caption">{t('ai:meals.loading')}</span>
                    </div>
                ) : aiError ? (
                    <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                        {aiError}
                    </div>
                ) : aiProposals.length === 0 ? (
                    <div className="py-8 text-center">
                        <UtensilsCrossed className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                        <p className="text-body-sm text-muted-foreground">{t('ai:meals.empty')}</p>
                    </div>
                ) : (
                    <div className="max-h-72 space-y-1 overflow-y-auto rounded-input border border-border p-3">
                        {aiProposals.map((proposal) => (
                            <label
                                key={proposal.date}
                                className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 hover:bg-surface-2"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedProposals.has(proposal.date)}
                                    onChange={() => toggleProposal(proposal.date)}
                                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-body-sm font-medium capitalize text-foreground">
                                        {format(new Date(`${proposal.date}T12:00:00`), 'EEEE dd MMM', { locale: dateLocale() })}
                                    </span>
                                    <span className="block text-micro text-muted-foreground">
                                        {mealTypeLabel(proposal.meal_type)} · {proposal.recipe_name}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </div>
                )}
                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="secondary" onClick={() => setAiDialogOpen(false)}>
                        {t('common:actions.cancel')}
                    </Button>
                    {!aiLoading && !aiError && aiProposals.length > 0 && (
                        <Button
                            type="button"
                            onClick={() => void handleConfirmProposals()}
                            disabled={creatingMeals || selectedProposals.size === 0}
                        >
                            {creatingMeals ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Sparkles className="w-4 h-4 mr-2" />
                            )}
                            {t('ai:meals.confirm', { count: selectedProposals.size })}
                        </Button>
                    )}
                </div>
            </Dialog>
        </div>
    );
};

export default MealPlanning;
