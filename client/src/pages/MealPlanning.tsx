import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, ChevronLeft, ChevronRight, Edit2, Trash2 } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea } from '../components/ui';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';

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
}

const MEAL_TYPES = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Snack'];

const MealPlanning: React.FC = () => {
    const [currentWeek, setCurrentWeek] = useState(new Date());
    const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingMeal, setEditingMeal] = useState<MealPlan | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedMealType, setSelectedMealType] = useState<string>('');
    const [error, setError] = useState('');

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

    const loadMealPlans = async () => {
        try {
            const start = startOfWeek(currentWeek, { weekStartsOn: 1 });
            const end = endOfWeek(currentWeek, { weekStartsOn: 1 });
            const response = await api.get<{ success: boolean; data: MealPlan[] }>(
                `/api/meal-plans?start_date=${start.toISOString()}&end_date=${end.toISOString()}`
            );
            if (response.success) {
                setMealPlans(response.data);
            }
        } catch (error) {
            console.error('Failed to load meal plans:', error);
            setError(error instanceof Error ? error.message : 'Impossible de charger le planning.');
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
            setError(error instanceof Error ? error.message : 'Impossible de charger les recettes.');
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
            setError(error instanceof Error ? error.message : 'Impossible d’enregistrer ce repas.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce repas ?')) return;
        try {
            await api.delete(`/api/meal-plans/${id}`);
            loadMealPlans();
        } catch (error) {
            console.error('Failed to delete meal plan:', error);
            setError(error instanceof Error ? error.message : 'Impossible de supprimer ce repas.');
        }
    };

    const handleEdit = (meal: MealPlan) => {
        setEditingMeal(meal);
        setSelectedDate(new Date(meal.date));
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
        setSelectedDate(date);
        setSelectedMealType(mealType);
        setFormData({
            ...formData,
            meal_type: mealType,
        });
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

    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const getMealForSlot = (date: Date, mealType: string) => {
        return mealPlans.find(
            (meal) => isSameDay(new Date(meal.date), date) && meal.meal_type === mealType
        );
    };

    const getMealTypeColor = (mealType: string) => {
        switch (mealType) {
            case 'Petit-déjeuner':
                return 'from-amber-50 to-orange-50 border-amber-200';
            case 'Déjeuner':
                return 'from-blue-50 to-cyan-50 border-blue-200';
            case 'Dîner':
                return 'from-purple-50 to-pink-50 border-purple-200';
            case 'Snack':
                return 'from-emerald-50 to-teal-50 border-emerald-200';
            default:
                return 'from-gray-50 to-gray-100 border-gray-200';
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">
                        Chargement du planning...
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
                    <h1 className="text-h1 mb-1">Planning des repas</h1>
                    <p className="text-muted-foreground text-body">Organisez vos repas de la semaine</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setCurrentWeek(new Date())}>
                        Cette semaine
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-6">
                    <h2 className="text-h2 font-semibold mb-4">
                        Semaine du {format(weekStart, 'dd MMM', { locale: fr })} au{' '}
                        {format(weekEnd, 'dd MMM yyyy', { locale: fr })}
                    </h2>

                    {/* Weekly Grid */}
                    <div className="overflow-x-auto">
                        <div className="min-w-[800px]">
                            {/* Header */}
                            <div className="grid grid-cols-8 gap-2 mb-2">
                                <div className="font-semibold text-body-sm text-muted-foreground"></div>
                                {weekDays.map((day) => (
                                    <div key={day.toISOString()} className="text-center">
                                        <div className="font-semibold text-body-sm">
                                            {format(day, 'EEE', { locale: fr })}
                                        </div>
                                        <div className="text-label text-muted-foreground">
                                            {format(day, 'dd MMM', { locale: fr })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Meal Rows */}
                            {MEAL_TYPES.map((mealType) => (
                                <div key={mealType} className="grid grid-cols-8 gap-2 mb-2">
                                    <div className="flex items-center font-medium text-body-sm text-muted-foreground">
                                        {mealType}
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
                title={editingMeal ? 'Modifier le repas' : 'Ajouter un repas'}
                description={
                    selectedDate
                        ? `${selectedMealType} du ${format(selectedDate, 'dd MMMM yyyy', { locale: fr })}`
                        : ''
                }
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            Type de repas
                        </label>
                        <Select
                            value={formData.meal_type}
                            onValueChange={(value) => setFormData({ ...formData, meal_type: value })}
                            options={MEAL_TYPES.map((type) => ({ value: type, label: type }))}
                        />
                    </div>
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            Recette (optionnel)
                        </label>
                        <Select
                            value={formData.recipe_id}
                            onValueChange={(value) =>
                                setFormData({ ...formData, recipe_id: value, custom_meal: '' })
                            }
                            options={[
                                { value: '', label: 'Aucune recette' },
                                ...recipes.map((recipe) => ({
                                    value: recipe.id,
                                    label: `${recipe.name} (${recipe.category})`,
                                })),
                            ]}
                        />
                    </div>
                    {!formData.recipe_id && (
                        <Input
                            label="Ou repas personnalisé"
                            value={formData.custom_meal}
                            onChange={(e) => setFormData({ ...formData, custom_meal: e.target.value })}
                            placeholder="Ex: Pizza maison"
                        />
                    )}
                    <Textarea
                        label="Notes (optionnel)"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Notes supplémentaires..."
                        rows={2}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button type="submit">{editingMeal ? 'Enregistrer' : 'Ajouter'}</Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default MealPlanning;
