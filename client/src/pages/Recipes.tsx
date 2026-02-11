import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, Search, Edit2, Trash2, Clock, Users, ChefHat, Eye } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea, Badge } from '../components/ui';

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

const CATEGORIES = [
    { value: 'Entrée', label: 'Entrée' },
    { value: 'Plat', label: 'Plat' },
    { value: 'Dessert', label: 'Dessert' },
    { value: 'Snack', label: 'Snack' },
];

const DIFFICULTIES = [
    { value: 'Facile', label: 'Facile' },
    { value: 'Moyen', label: 'Moyen' },
    { value: 'Difficile', label: 'Difficile' },
];

const Recipes: React.FC = () => {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [detailDialogOpen, setDetailDialogOpen] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
    const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterDifficulty, setFilterDifficulty] = useState('');
    const [error, setError] = useState('');

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
    });

    useEffect(() => {
        loadRecipes();
    }, []);

    const loadRecipes = async () => {
        try {
            const response = await api.get<{ success: boolean; data: Recipe[] }>('/api/recipes');
            if (response.success) {
                setRecipes(response.data);
            }
        } catch (error) {
            console.error('Failed to load recipes:', error);
            setError(error instanceof Error ? error.message : 'Impossible de charger les recettes.');
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
            setError(error instanceof Error ? error.message : 'Impossible d’enregistrer cette recette.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette recette ?')) return;
        try {
            await api.delete(`/api/recipes/${id}`);
            loadRecipes();
        } catch (error) {
            console.error('Failed to delete recipe:', error);
            setError(error instanceof Error ? error.message : 'Impossible de supprimer cette recette.');
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
        });
        setDialogOpen(true);
    };

    const handleView = (recipe: Recipe) => {
        setViewingRecipe(recipe);
        setDetailDialogOpen(true);
    };

    const resetForm = () => {
        setEditingRecipe(null);
        setFormData({
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
        });
    };

    const filteredRecipes = recipes.filter((recipe) => {
        if (searchQuery && !recipe.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }
        if (filterCategory && recipe.category !== filterCategory) return false;
        if (filterDifficulty && recipe.difficulty !== filterDifficulty) return false;
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
                    <p className="text-muted-foreground font-medium animate-pulse">Chargement des recettes...</p>
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
                    <h1 className="text-h1 mb-1">Recettes</h1>
                    <p className="text-muted-foreground text-body">Votre bibliothèque de recettes familiales</p>
                </div>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvelle recette
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Rechercher une recette..."
                                className="pl-10"
                            />
                        </div>
                        <Select
                            value={filterCategory}
                            onValueChange={setFilterCategory}
                            options={[{ value: '', label: 'Toutes catégories' }, ...CATEGORIES]}
                        />
                        <Select
                            value={filterDifficulty}
                            onValueChange={setFilterDifficulty}
                            options={[{ value: '', label: 'Toutes difficultés' }, ...DIFFICULTIES]}
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
                                ? 'Aucune recette pour le moment. Créez votre première recette !'
                                : 'Aucune recette ne correspond à votre recherche.'}
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
                                    <h3 className="text-body font-semibold flex-1">{recipe.name}</h3>
                                </div>
                                {recipe.description && (
                                    <p className="text-body-sm text-muted-foreground mb-3 line-clamp-2">
                                        {recipe.description}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2 mb-3">
                                    <Badge variant={getCategoryColor(recipe.category)}>{recipe.category}</Badge>
                                    {recipe.difficulty && (
                                        <Badge variant={getDifficultyColor(recipe.difficulty)}>
                                            {recipe.difficulty}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 text-label text-muted-foreground mb-4">
                                    {recipe.prep_time && (
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {recipe.prep_time}min
                                        </div>
                                    )}
                                    {recipe.servings && (
                                        <div className="flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            {recipe.servings} pers.
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
                                        Voir
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
                title={editingRecipe ? 'Modifier la recette' : 'Nouvelle recette'}
                description="Remplissez les informations de la recette"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Nom de la recette"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="Ex: Tarte aux pommes"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                Catégorie
                            </label>
                            <Select
                                value={formData.category}
                                onValueChange={(value) => setFormData({ ...formData, category: value })}
                                options={CATEGORIES}
                            />
                        </div>
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                Difficulté
                            </label>
                            <Select
                                value={formData.difficulty}
                                onValueChange={(value) => setFormData({ ...formData, difficulty: value })}
                                options={DIFFICULTIES}
                            />
                        </div>
                    </div>
                    <Textarea
                        label="Description (optionnel)"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Brève description de la recette..."
                        rows={2}
                    />
                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Préparation (min)"
                            type="number"
                            value={formData.prep_time}
                            onChange={(e) => setFormData({ ...formData, prep_time: e.target.value })}
                            placeholder="30"
                        />
                        <Input
                            label="Cuisson (min)"
                            type="number"
                            value={formData.cook_time}
                            onChange={(e) => setFormData({ ...formData, cook_time: e.target.value })}
                            placeholder="45"
                        />
                        <Input
                            label="Portions"
                            type="number"
                            value={formData.servings}
                            onChange={(e) => setFormData({ ...formData, servings: e.target.value })}
                            placeholder="4"
                        />
                    </div>
                    <Textarea
                        label="Ingrédients (un par ligne)"
                        value={formData.ingredients}
                        onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                        required
                        placeholder="200g de farine&#10;3 œufs&#10;100g de sucre"
                        rows={5}
                    />
                    <Textarea
                        label="Instructions (une étape par ligne)"
                        value={formData.instructions}
                        onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                        required
                        placeholder="Préchauffer le four à 180°C&#10;Mélanger la farine et le sucre&#10;Ajouter les œufs"
                        rows={5}
                    />
                    <Input
                        label="Tags (séparés par des virgules)"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        placeholder="végétarien, rapide, économique"
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button type="submit">{editingRecipe ? 'Enregistrer' : 'Créer'}</Button>
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
                                {viewingRecipe.category}
                            </Badge>
                            {viewingRecipe.difficulty && (
                                <Badge variant={getDifficultyColor(viewingRecipe.difficulty)}>
                                    {viewingRecipe.difficulty}
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
                                    <span className="text-muted-foreground">Préparation:</span>{' '}
                                    <span className="font-medium">{viewingRecipe.prep_time} min</span>
                                </div>
                            )}
                            {viewingRecipe.cook_time && (
                                <div>
                                    <span className="text-muted-foreground">Cuisson:</span>{' '}
                                    <span className="font-medium">{viewingRecipe.cook_time} min</span>
                                </div>
                            )}
                            {viewingRecipe.servings && (
                                <div>
                                    <span className="text-muted-foreground">Portions:</span>{' '}
                                    <span className="font-medium">{viewingRecipe.servings}</span>
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-body font-semibold mb-3">Ingrédients</h3>
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
                            <h3 className="text-body font-semibold mb-3">Instructions</h3>
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
                                Fermer
                            </Button>
                            <Button
                                onClick={() => {
                                    setDetailDialogOpen(false);
                                    handleEdit(viewingRecipe);
                                }}
                            >
                                <Edit2 className="h-4 w-4 mr-2" />
                                Modifier
                            </Button>
                        </div>
                    </div>
                </Dialog>
            )}
        </div>
    );
};

export default Recipes;
