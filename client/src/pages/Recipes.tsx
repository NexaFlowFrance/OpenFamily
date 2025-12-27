import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Clock, Users, ChefHat } from 'lucide-react';

const CATEGORIES = [
  { value: 'starter', label: 'Entrée', color: '#c8dfe8' },
  { value: 'main', label: 'Plat principal', color: '#6b8e7f' },
  { value: 'dessert', label: 'Dessert', color: '#f0d4a8' },
  { value: 'snack', label: 'Goûter', color: '#e8e6e3' },
  { value: 'other', label: 'Autre', color: '#d97b7b' },
];

export default function Recipes() {
  const { recipes, addRecipe, updateRecipe, deleteRecipe } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'main' as const,
    ingredients: '',
    instructions: '',
    prepTime: 15,
    cookTime: 30,
    servings: 4,
    tags: '',
  });

  const handleAddRecipe = () => {
    if (formData.title.trim()) {
      addRecipe({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        ingredients: formData.ingredients.split('\n').filter(i => i.trim()),
        instructions: formData.instructions,
        prepTime: formData.prepTime,
        cookTime: formData.cookTime,
        servings: formData.servings,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
      });
      setFormData({
        title: '',
        description: '',
        category: 'main',
        ingredients: '',
        instructions: '',
        prepTime: 15,
        cookTime: 30,
        servings: 4,
        tags: '',
      });
      setShowForm(false);
    }
  };

  const getCategoryColor = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.color || '#e8e6e3';
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || category;
  };

  const selectedRecipeData = recipes.find(r => r.id === selectedRecipe);

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground mb-4">Recettes</h1>
        
        <div className="text-sm text-muted-foreground">
          {recipes.length} recette(s) enregistrée(s)
        </div>
      </div>

      <div className="p-4 space-y-3">
        {recipes.length === 0 ? (
          <div className="text-center py-12">
            <ChefHat className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucune recette enregistrée</p>
          </div>
        ) : (
          recipes.map(recipe => (
            <Card
              key={recipe.id}
              className="p-4 transition-all cursor-pointer hover:shadow-md"
              onClick={() => setSelectedRecipe(recipe.id)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: getCategoryColor(recipe.category) }}
                >
                  <ChefHat className="w-6 h-6 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground">{recipe.title}</h3>
                  
                  {recipe.description && (
                    <p className="text-sm text-muted-foreground mt-1">{recipe.description}</p>
                  )}

                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      style={{ backgroundColor: getCategoryColor(recipe.category) + '40' }}
                      className="text-xs"
                    >
                      {getCategoryLabel(recipe.category)}
                    </Badge>
                    {recipe.tags?.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    {recipe.prepTime && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Prép: {recipe.prepTime}min</span>
                      </div>
                    )}
                    {recipe.cookTime && (
                      <span>Cuisson: {recipe.cookTime}min</span>
                    )}
                    {recipe.servings && (
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{recipe.servings} pers.</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRecipe(recipe.id);
                  }}
                  className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Modal détails recette */}
      {selectedRecipe && selectedRecipeData && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setSelectedRecipe(null)}>
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold">{selectedRecipeData.title}</h2>
              <button onClick={() => setSelectedRecipe(null)} className="text-muted-foreground">
                ✕
              </button>
            </div>

            {selectedRecipeData.description && (
              <p className="text-sm text-muted-foreground">{selectedRecipeData.description}</p>
            )}

            <div className="flex gap-4 text-sm">
              {selectedRecipeData.prepTime && (
                <div>
                  <span className="font-medium">Préparation:</span> {selectedRecipeData.prepTime}min
                </div>
              )}
              {selectedRecipeData.cookTime && (
                <div>
                  <span className="font-medium">Cuisson:</span> {selectedRecipeData.cookTime}min
                </div>
              )}
              {selectedRecipeData.servings && (
                <div>
                  <span className="font-medium">Pour:</span> {selectedRecipeData.servings} personnes
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">Ingrédients</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {selectedRecipeData.ingredients.map((ingredient, index) => (
                  <li key={index}>{ingredient}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Instructions</h3>
              <p className="text-sm whitespace-pre-wrap">{selectedRecipeData.instructions}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Formulaire ajout recette */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Ajouter une recette</h2>

            <div>
              <label className="text-sm font-medium text-foreground">Titre</label>
              <Input
                placeholder="Nom de la recette"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Input
                placeholder="Description courte"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Catégorie</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Prép (min)</label>
                <Input
                  type="number"
                  value={formData.prepTime}
                  onChange={(e) => setFormData({ ...formData, prepTime: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Cuisson (min)</label>
                <Input
                  type="number"
                  value={formData.cookTime}
                  onChange={(e) => setFormData({ ...formData, cookTime: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Portions</label>
                <Input
                  type="number"
                  value={formData.servings}
                  onChange={(e) => setFormData({ ...formData, servings: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Ingrédients (un par ligne)</label>
              <Textarea
                placeholder="200g de farine&#10;3 œufs&#10;50cl de lait"
                value={formData.ingredients}
                onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                className="mt-1"
                rows={6}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Instructions</label>
              <Textarea
                placeholder="Étapes de préparation..."
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                className="mt-1"
                rows={6}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Tags (séparés par des virgules)</label>
              <Input
                placeholder="facile, rapide, végétarien"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={handleAddRecipe}
                className="flex-1"
              >
                Ajouter
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
