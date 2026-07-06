import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api } from '../lib/api';
import { Plus, Search, Edit2, Trash2, Clock, Users, ChefHat, Eye, Link2 } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea, Badge, useToast } from '../components/ui';
import { useCategories } from '../hooks/useCategories';

/** Parsed recipe returned by POST /api/recipes/import-url (nothing saved yet). */
interface ImportedRecipe {
    name: string;
    category: string;
    description: string | null;
    ingredients: string[];
    instructions: string[];
    prep_time: number | null;
    cook_time: number | null;
    servings: number | null;
    difficulty: string | null;
    tags: string[];
    image_url: string | null;
}

interface Recipe {
    id: string;
    name: string;
    category: string;
    description?: string;
    ingredients: string[];
    instructions: string[];
    prep_time?: number;
    cook_time?: number;
    servings?: number;
    difficulty?: string;
    tags?: string[];
    image_url?: string;
}

const Recipes: React.FC = () => {
    const { t } = useTranslation(['recipes', 'common']);
    // Family-customizable list (Settings → Categories); defaults are translated,
    // custom names are shown as-is.
    const { categories: familyCategories } = useCategories();
    const CATEGORIES = familyCategories.recipe.map((value) => ({
        value,
        label: t(`recipes:categories.${value}`, { defaultValue: value }),
    }));
    // Sensible default for new/imported recipes even when 'Plat' was customized away.
    const defaultCategory = familyCategories.recipe.includes('Plat') ? 'Plat' : familyCategories.recipe[0];
    const DIFFICULTIES = [
        { value: 'Facile', label: t('recipes:difficulties.Facile') },
        { value: 'Moyen', label: t('recipes:difficulties.Moyen') },
        { value: 'Difficile', label: t('recipes:difficulties.Difficile') },
    ];
    const DURATIONS = [
        { value: 'under15', label: t('recipes:durations.under15') },
        { value: 'under30', label: t('recipes:durations.under30') },
        { value: 'under60', label: t('recipes:durations.under60') },
        { value: 'over60', label: t('recipes:durations.over60') },
    ];
    const categoryLabel = (v: string) => t(`recipes:categories.${v}`, { defaultValue: v });
    const difficultyLabel = (v?: string) => (v ? t(`recipes:difficulties.${v}`, { defaultValue: v }) : '');
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [detailDialogOpen, setDetailDialogOpen] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
    const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterDifficulty, setFilterDifficulty] = useState('');
    const [filterDuration, setFilterDuration] = useState('');
    const [error, setError] = useState('');
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [importUrl, setImportUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const { showToast } = useToast();

    const [formData, setFormData] = useState({
        name: '',
        category: 'Plat',
        description: '',
        ingredients: '',
        instructions: '',
        prep_time: '',
        cook_time: '',
        servings: '',
        difficulty: 'Moyen',
        tags: '',
        image_url: '',
    });

    useEffect(() => {
        loadRecipes();
    }, []);
    useWebSocketUpdates('recipes', () => { void loadRecipes(); });

    const loadRecipes = async () => {
        try {
            const response = await api.get<{ success: boolean; data: Recipe[] }>('/api/recipes');
            if (response.success) {
                setRecipes(response.data);
            }
        } catch (error) {
            console.error('Failed to load recipes:', error);
            setError(error instanceof Error ? error.message : t('recipes:errors.load'));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const payload = {
                ...formData,
                ingredients: formData.ingredients.split('\n').filter((i) => i.trim()),
                instructions: formData.instructions.split('\n').filter((i) => i.trim()),
                prep_time: formData.prep_time ? parseInt(formData.prep_time) : undefined,
                cook_time: formData.cook_time ? parseInt(formData.cook_time) : undefined,
                servings: formData.servings ? parseInt(formData.servings) : undefined,
                tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()).filter((t) => t) : [],
            };

            if (editingRecipe) {
                await api.put(`/api/recipes/${editingRecipe.id}`, payload);
            } else {
                await api.post('/api/recipes', payload);
            }
            setDialogOpen(false);
            resetForm();
            loadRecipes();
        } catch (error) {
            console.error('Failed to save recipe:', error);
            setError(error instanceof Error ? error.message : t('recipes:errors.save'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('recipes:confirmDelete'))) return;
        try {
            await api.delete(`/api/recipes/${id}`);
            loadRecipes();
        } catch (error) {
            console.error('Failed to delete recipe:', error);
            setError(error instanceof Error ? error.message : t('recipes:errors.delete'));
        }
    };

    const handleEdit = (recipe: Recipe) => {
        setEditingRecipe(recipe);
        setFormData({
            name: recipe.name,
            category: recipe.category,
            description: recipe.description || '',
            ingredients: recipe.ingredients.join('\n'),
            instructions: recipe.instructions.join('\n'),
            prep_time: recipe.prep_time?.toString() || '',
            cook_time: recipe.cook_time?.toString() || '',
            servings: recipe.servings?.toString() || '',
            difficulty: recipe.difficulty || 'Moyen',
            tags: recipe.tags?.join(', ') || '',
            image_url: recipe.image_url || '',
        });
        setDialogOpen(true);
    };

    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = importUrl.trim();
        if (!url || importing) return;
        setImporting(true);
        try {
            const response = await api.post<{ success: boolean; data: ImportedRecipe }>(
                '/api/recipes/import-url',
                { url }
            );
            const parsed = response.data;
            // Prefill the normal create form: the user reviews/edits, then saves.
            setEditingRecipe(null);
            setFormData({
                name: parsed.name || '',
                category: parsed.category || defaultCategory,
                description: parsed.description || '',
                ingredients: (parsed.ingredients || []).join('\n'),
                instructions: (parsed.instructions || []).join('\n'),
                prep_time: parsed.prep_time != null ? String(parsed.prep_time) : '',
                cook_time: parsed.cook_time != null ? String(parsed.cook_time) : '',
                servings: parsed.servings != null ? String(parsed.servings) : '',
                difficulty: parsed.difficulty || 'Moyen',
                tags: (parsed.tags || []).join(', '),
                image_url: parsed.image_url || '',
            });
            setImportDialogOpen(false);
            setImportUrl('');
            setDialogOpen(true);
            showToast({
                title: t('recipes:import.successTitle'),
                description: t('recipes:import.successDescription'),
            });
        } catch (error) {
            console.error('Failed to import recipe:', error);
            const message = error instanceof Error ? error.message : '';
            if (message === 'NO_RECIPE_FOUND') {
                showToast({
                    title: t('recipes:import.errors.notFoundTitle'),
                    description: t('recipes:import.errors.notFound'),
                });
            } else {
                showToast({
                    title: t('recipes:import.errors.fetchTitle'),
                    description: t('recipes:import.errors.fetch'),
                });
            }
        } finally {
            setImporting(false);
        }
    };

    const handleView = (recipe: Recipe) => {
        setViewingRecipe(recipe);
        setDetailDialogOpen(true);
    };

    const resetForm = () => {
        setEditingRecipe(null);
        setFormData({
            name: '',
            category: defaultCategory,
            description: '',
            ingredients: '',
            instructions: '',
            prep_time: '',
            cook_time: '',
            servings: '',
            difficulty: 'Moyen',
            tags: '',
            image_url: '',
        });
    };

    const filteredRecipes = recipes.filter((recipe) => {
        if (searchQuery && !recipe.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }
        if (filterCategory && recipe.category !== filterCategory) return false;
        if (filterDifficulty && recipe.difficulty !== filterDifficulty) return false;
        if (filterDuration) {
            // Total time = prep + cook (minutes). Recipes with no time data (total 0)
            // only ever appear under "All", never in a bounded bucket.
            const total = (recipe.prep_time || 0) + (recipe.cook_time || 0);
            if (total <= 0) return false;
            if (filterDuration === 'under15' && total > 15) return false;
            if (filterDuration === 'under30' && total > 30) return false;
            if (filterDuration === 'under60' && total > 60) return false;
            if (filterDuration === 'over60' && total <= 60) return false;
        }
        return true;
    });

    const getDifficultyColor = (difficulty?: string) => {
        switch (difficulty) {
            case 'Facile':
                return 'success';
            case 'Moyen':
                return 'warning';
            case 'Difficile':
                return 'danger';
            default:
                return 'default';
        }
    };

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'Entrée':
                return 'primary';
            case 'Plat':
                return 'success';
            case 'Dessert':
                return 'secondary';
            case 'Snack':
                return 'warning';
            default:
                return 'default';
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">{t('recipes:loading')}</p>
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
                    <h1 className="text-h1 mb-1">{t('recipes:title')}</h1>
                    <p className="text-muted-foreground text-body">{t('recipes:subtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={() => { setImportUrl(''); setImportDialogOpen(true); }}>
                        <Link2 className="w-4 h-4 mr-2" />
                        {t('recipes:import.button')}
                    </Button>
                    <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                        <Plus className="w-4 h-4 mr-2" />
                        {t('recipes:newRecipe')}
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('recipes:searchPlaceholder')}
                                className="pl-10"
                            />
                        </div>
                        <Select
                            value={filterCategory}
                            onValueChange={setFilterCategory}
                            options={[{ value: '', label: t('recipes:allCategories') }, ...CATEGORIES]}
                        />
                        <Select
                            value={filterDifficulty}
                            onValueChange={setFilterDifficulty}
                            options={[{ value: '', label: t('recipes:allDifficulties') }, ...DIFFICULTIES]}
                        />
                        <Select
                            value={filterDuration}
                            onValueChange={setFilterDuration}
                            options={[{ value: '', label: t('recipes:anyDuration') }, ...DURATIONS]}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Recipes Grid */}
            {filteredRecipes.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <ChefHat className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <p className="text-muted-foreground">
                            {recipes.length === 0
                                ? t('recipes:empty.none')
                                : t('recipes:empty.noMatch')}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRecipes.map((recipe) => (
                        <Card key={recipe.id} className="hover:shadow-lg transition-shadow overflow-hidden">
                            <div className="h-40 bg-gradient-to-br from-nexus-blue/10 to-nexus-amber/10 flex items-center justify-center">
                                <ChefHat className="h-16 w-16 text-nexus-blue/30" />
                            </div>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <h3 className="text-body font-semibold flex-1 min-w-0 break-words">{recipe.name}</h3>
                                </div>
                                {recipe.description && (
                                    <p className="text-body-sm text-muted-foreground mb-3 line-clamp-2">
                                        {recipe.description}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2 mb-3">
                                    <Badge variant={getCategoryColor(recipe.category)}>{categoryLabel(recipe.category)}</Badge>
                                    {recipe.difficulty && (
                                        <Badge variant={getDifficultyColor(recipe.difficulty)}>
                                            {difficultyLabel(recipe.difficulty)}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 text-label text-muted-foreground mb-4">
                                    {recipe.prep_time && (
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {t('recipes:card.min', { n: recipe.prep_time })}
                                        </div>
                                    )}
                                    {recipe.servings && (
                                        <div className="flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            {t('recipes:card.servings', { count: recipe.servings })}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleView(recipe)}
                                        className="flex-1"
                                    >
                                        <Eye className="h-4 w-4 mr-1" />
                                        {t('recipes:card.view')}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(recipe)}>
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(recipe.id)}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create/Edit Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title={editingRecipe ? t('recipes:dialog.editTitle') : t('recipes:dialog.createTitle')}
                description={t('recipes:dialog.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label={t('recipes:form.name')}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder={t('recipes:form.namePlaceholder')}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('recipes:form.category')}
                            </label>
                            <Select
                                value={formData.category}
                                onValueChange={(value) => setFormData({ ...formData, category: value })}
                                options={CATEGORIES}
                            />
                        </div>
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('recipes:form.difficulty')}
                            </label>
                            <Select
                                value={formData.difficulty}
                                onValueChange={(value) => setFormData({ ...formData, difficulty: value })}
                                options={DIFFICULTIES}
                            />
                        </div>
                    </div>
                    <Textarea
                        label={t('recipes:form.description')}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t('recipes:form.descriptionPlaceholder')}
                        rows={2}
                    />
                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label={t('recipes:form.prep')}
                            type="number"
                            value={formData.prep_time}
                            onChange={(e) => setFormData({ ...formData, prep_time: e.target.value })}
                            placeholder={t('recipes:form.prepPlaceholder')}
                        />
                        <Input
                            label={t('recipes:form.cook')}
                            type="number"
                            value={formData.cook_time}
                            onChange={(e) => setFormData({ ...formData, cook_time: e.target.value })}
                            placeholder={t('recipes:form.cookPlaceholder')}
                        />
                        <Input
                            label={t('recipes:form.servings')}
                            type="number"
                            value={formData.servings}
                            onChange={(e) => setFormData({ ...formData, servings: e.target.value })}
                            placeholder={t('recipes:form.servingsPlaceholder')}
                        />
                    </div>
                    <Textarea
                        label={t('recipes:form.ingredients')}
                        value={formData.ingredients}
                        onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                        required
                        placeholder={t('recipes:form.ingredientsPlaceholder')}
                        rows={5}
                    />
                    <Textarea
                        label={t('recipes:form.instructions')}
                        value={formData.instructions}
                        onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                        required
                        placeholder={t('recipes:form.instructionsPlaceholder')}
                        rows={5}
                    />
                    <Input
                        label={t('recipes:form.tags')}
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        placeholder={t('recipes:form.tagsPlaceholder')}
                    />
                    <Input
                        label={t('recipes:form.image')}
                        type="url"
                        value={formData.image_url}
                        onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                        placeholder={t('recipes:form.imagePlaceholder')}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit">{editingRecipe ? t('common:actions.save') : t('common:actions.create')}</Button>
                    </div>
                </form>
            </Dialog>

            {/* Import from URL Dialog */}
            <Dialog
                open={importDialogOpen}
                onOpenChange={(open) => { if (!importing) setImportDialogOpen(open); }}
                title={t('recipes:import.title')}
                description={t('recipes:import.description')}
            >
                <form onSubmit={handleImportSubmit} className="space-y-4">
                    <Input
                        label={t('recipes:import.urlLabel')}
                        type="url"
                        inputMode="url"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        required
                        autoFocus
                        placeholder={t('recipes:import.urlPlaceholder')}
                    />
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={importing}
                            onClick={() => setImportDialogOpen(false)}
                        >
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={importing || !importUrl.trim()}>
                            <Link2 className="w-4 h-4 mr-2" />
                            {importing ? t('recipes:import.importing') : t('recipes:import.submit')}
                        </Button>
                    </div>
                </form>
            </Dialog>

            {/* Detail Dialog */}
            {viewingRecipe && (
                <Dialog
                    open={detailDialogOpen}
                    onOpenChange={setDetailDialogOpen}
                    title={viewingRecipe.name}
                    description={viewingRecipe.description}
                >
                    <div className="space-y-6">
                        <div className="flex flex-wrap gap-2">
                            <Badge variant={getCategoryColor(viewingRecipe.category)}>
                                {categoryLabel(viewingRecipe.category)}
                            </Badge>
                            {viewingRecipe.difficulty && (
                                <Badge variant={getDifficultyColor(viewingRecipe.difficulty)}>
                                    {difficultyLabel(viewingRecipe.difficulty)}
                                </Badge>
                            )}
                            {viewingRecipe.tags?.map((tag) => (
                                <Badge key={tag} variant="default">
                                    {tag}
                                </Badge>
                            ))}
                        </div>

                        <div className="flex gap-6 text-body-sm">
                            {viewingRecipe.prep_time && (
                                <div>
                                    <span className="text-muted-foreground">{t('recipes:detail.prep')}</span>{' '}
                                    <span className="font-medium">{viewingRecipe.prep_time} {t('recipes:detail.minUnit')}</span>
                                </div>
                            )}
                            {viewingRecipe.cook_time && (
                                <div>
                                    <span className="text-muted-foreground">{t('recipes:detail.cook')}</span>{' '}
                                    <span className="font-medium">{viewingRecipe.cook_time} {t('recipes:detail.minUnit')}</span>
                                </div>
                            )}
                            {viewingRecipe.servings && (
                                <div>
                                    <span className="text-muted-foreground">{t('recipes:detail.servings')}</span>{' '}
                                    <span className="font-medium">{viewingRecipe.servings}</span>
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-body font-semibold mb-3">{t('recipes:detail.ingredients')}</h3>
                            <ul className="space-y-2">
                                {viewingRecipe.ingredients.map((ingredient, index) => (
                                    <li key={index} className="flex items-start gap-2 text-body-sm">
                                        <span className="text-nexus-blue mt-1">•</span>
                                        <span>{ingredient}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-body font-semibold mb-3">{t('recipes:detail.instructions')}</h3>
                            <ol className="space-y-3">
                                {viewingRecipe.instructions.map((instruction, index) => (
                                    <li key={index} className="flex gap-3 text-body-sm">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-nexus-blue text-white flex items-center justify-center text-label font-medium">
                                            {index + 1}
                                        </span>
                                        <span className="flex-1 pt-0.5">{instruction}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button variant="secondary" onClick={() => setDetailDialogOpen(false)}>
                                {t('common:actions.close')}
                            </Button>
                            <Button
                                onClick={() => {
                                    setDetailDialogOpen(false);
                                    handleEdit(viewingRecipe);
                                }}
                            >
                                <Edit2 className="h-4 w-4 mr-2" />
                                {t('common:actions.edit')}
                            </Button>
                        </div>
                    </div>
                </Dialog>
            )}
        </div>
    );
};

export default Recipes;
