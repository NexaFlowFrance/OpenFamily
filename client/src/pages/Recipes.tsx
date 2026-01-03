import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAddButton } from '@/contexts/AddButtonContext';
import { useDragScroll } from '@/hooks/useDragScroll';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Clock, Users, ChefHat, Filter } from 'lucide-react';
import type { Language } from '@/lib/i18n';
import { translations } from '@/lib/i18n';

type TranslationFunction = (typeof translations)[Language];

const getCategoryDefaults = (t: TranslationFunction) => [
  { value: 'starter', label: t.recipes.categories.starter, color: '#c8dfe8' },
  { value: 'main', label: t.recipes.categories.main, color: '#6b8e7f' },
  { value: 'dessert', label: t.recipes.categories.dessert, color: '#f0d4a8' },
  { value: 'snack', label: t.recipes.categories.snack, color: '#e8e6e3' },
  { value: 'other', label: t.recipes.categories.other, color: '#d97b7b' },
];

const getPrepTimeFilters = (t: TranslationFunction) => [
  { value: 'all', label: t.recipes.prepTimeFilters.all },
  { value: '0-15', label: t.recipes.prepTimeFilters["0-15"] },
  { value: '15-30', label: t.recipes.prepTimeFilters["15-30"] },
  { value: '30-60', label: t.recipes.prepTimeFilters["30-60"] },
  { value: '60+', label: t.recipes.prepTimeFilters["60+"] },
];

export default function Recipes() {
  const { recipes, addRecipe, updateRecipe, deleteRecipe } = useApp();
  const { setAddAction } = useAddButton();
  const { t } = useLanguage();
  const dragScrollRef = useDragScroll<HTMLDivElement>();
  const [showForm, setShowForm] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPrepTime, setFilterPrepTime] = useState<string>('all');
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

  useEffect(() => {
    setAddAction(() => setShowForm(true));
    return () => setAddAction(null);
  }, [setAddAction]);

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
    return getCategoryDefaults(t).find(c => c.value === category)?.color || '#e8e6e3';
  };

  const getCategoryLabel = (category: string) => {
    return getCategoryDefaults(t).find(c => c.value === category)?.label || category;
  };

  // Filtrer les recettes
  const filteredRecipes = recipes.filter(recipe => {
    // Filtre par catégorie
    if (filterCategory !== 'all' && recipe.category !== filterCategory) {
      return false;
    }

    // Filtre par temps de préparation
    if (filterPrepTime !== 'all') {
      const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
      switch (filterPrepTime) {
        case '0-15':
          if (totalTime >= 15) return false;
          break;
        case '15-30':
          if (totalTime < 15 || totalTime > 30) return false;
          break;
        case '30-60':
          if (totalTime < 30 || totalTime > 60) return false;
          break;
        case '60+':
          if (totalTime < 60) return false;
          break;
      }
    }

    return true;
  });

  const selectedRecipeData = recipes.find(r => r.id === selectedRecipe);

  return (
    <div ref={dragScrollRef} className="pb-24 overflow-y-auto h-screen">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-foreground">{t.recipes.title}</h1>
          <Button
            size="icon"
            onClick={() => setShowForm(true)}
            className="rounded-full"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Filtres */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>{t.recipes.filters}</span>
          </div>
          
          {/* Filtre catégorie */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button
              variant={filterCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterCategory('all')}
            >
              {t.recipes.all}
            </Button>
            {getCategoryDefaults(t).map(cat => (
              <Button
                key={cat.value}
                variant={filterCategory === cat.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterCategory(cat.value)}
                style={filterCategory === cat.value ? { backgroundColor: cat.color } : {}}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          {/* Filtre temps */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {getPrepTimeFilters(t).map(filter => (
              <Button
                key={filter.value}
                variant={filterPrepTime === filter.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterPrepTime(filter.value)}
              >
                <Clock className="w-3 h-3 mr-1" />
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
        
        <div className="text-sm text-muted-foreground">
          {filteredRecipes.length} {t.recipes.recipesCount.replace('{count}', '')} {filterCategory !== 'all' || filterPrepTime !== 'all' ? t.recipes.found : t.recipes.saved}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {filteredRecipes.length === 0 ? (
          <div className="text-center py-12">
            <ChefHat className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {recipes.length === 0 ? t.recipes.noRecipes : t.recipes.noRecipesFiltered}
            </p>
          </div>
        ) : (
          filteredRecipes.map(recipe => (
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
                        <span>{t.recipes.details.prep} {recipe.prepTime}min</span>
                      </div>
                    )}
                    {recipe.cookTime && (
                      <span>{t.recipes.details.cooking} {recipe.cookTime}min</span>
                    )}
                    {recipe.servings && (
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{recipe.servings} {t.recipes.details.pers}</span>
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
                  <span className="font-medium">{t.recipes.details.preparation}</span> {selectedRecipeData.prepTime}min
                </div>
              )}
              {selectedRecipeData.cookTime && (
                <div>
                  <span className="font-medium">{t.recipes.details.cooking}</span> {selectedRecipeData.cookTime}min
                </div>
              )}
              {selectedRecipeData.servings && (
                <div>
                  <span className="font-medium">{t.recipes.details.for}</span> {selectedRecipeData.servings} {t.recipes.details.people}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">{t.recipes.details.ingredients}</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {selectedRecipeData.ingredients.map((ingredient, index) => (
                  <li key={index}>{ingredient}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">{t.recipes.details.instructions}</h3>
              <p className="text-sm whitespace-pre-wrap">{selectedRecipeData.instructions}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Formulaire ajout recette */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">{t.recipes.addRecipe}</h2>

            <div>
              <label className="text-sm font-medium text-foreground">{t.recipes.form.title}</label>
              <Input
                placeholder={t.recipes.form.titlePlaceholder}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.recipes.form.description}</label>
              <Input
                placeholder={t.recipes.form.descriptionPlaceholder}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.recipes.form.category}</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
              >
                {getCategoryDefaults(t).map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.recipes.form.prepTime}</label>
                <Input
                  type="number"
                  value={formData.prepTime}
                  onChange={(e) => setFormData({ ...formData, prepTime: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t.recipes.form.cookTime}</label>
                <Input
                  type="number"
                  value={formData.cookTime}
                  onChange={(e) => setFormData({ ...formData, cookTime: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t.recipes.form.servings}</label>
                <Input
                  type="number"
                  value={formData.servings}
                  onChange={(e) => setFormData({ ...formData, servings: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.recipes.form.ingredients}</label>
              <Textarea
                placeholder={t.recipes.form.ingredientsPlaceholder}
                value={formData.ingredients}
                onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                className="mt-1"
                rows={6}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.recipes.form.instructions}</label>
              <Textarea
                placeholder={t.recipes.form.instructionsPlaceholder}
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                className="mt-1"
                rows={6}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.recipes.form.tags}</label>
              <Input
                placeholder={t.recipes.form.tagsPlaceholder}
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
                {t.cancel}
              </Button>
              <Button
                onClick={handleAddRecipe}
                className="flex-1"
              >
                {t.add}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
