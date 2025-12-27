import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Check, Lightbulb } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const CATEGORIES = [
  { value: 'baby', label: 'Bébé', color: '#f0d4a8' },
  { value: 'food', label: 'Alimentation', color: '#c8dfe8' },
  { value: 'household', label: 'Ménage', color: '#6b8e7f' },
  { value: 'health', label: 'Santé', color: '#d97b7b' },
  { value: 'other', label: 'Autre', color: '#e8e6e3' },
];

export default function Shopping() {
  const { shoppingItems, addShoppingItem, updateShoppingItem, deleteShoppingItem, meals, recipes } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'baby' as const,
    quantity: 1,
    price: 0,
    notes: '',
  });
  const [filter, setFilter] = useState<string | null>(null);

  // Get ingredient suggestions from upcoming meals
  const getIngredientSuggestions = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const upcomingMeals = meals.filter(meal => {
      const mealDate = new Date(meal.date);
      return mealDate >= new Date() && mealDate <= nextWeek;
    });

    const suggestions: string[] = [];
    upcomingMeals.forEach(meal => {
      if (meal.recipeId) {
        const recipe = recipes.find(r => r.id === meal.recipeId);
        if (recipe?.ingredients) {
          recipe.ingredients.forEach(ingredient => {
            const ingredientLower = ingredient.toLowerCase();
            // Check if not already in shopping list
            const alreadyInList = shoppingItems.some(item => 
              item.name.toLowerCase().includes(ingredientLower) || 
              ingredientLower.includes(item.name.toLowerCase())
            );
            if (!alreadyInList && !suggestions.includes(ingredient)) {
              suggestions.push(ingredient);
            }
          });
        }
      }
    });

    return suggestions;
  };

  const suggestions = getIngredientSuggestions();

  const handleAddItem = () => {
    if (formData.name.trim()) {
      addShoppingItem({
        name: formData.name,
        category: formData.category,
        quantity: formData.quantity,
        price: formData.price,
        completed: false,
        notes: formData.notes,
      });
      setFormData({ name: '', category: 'baby', quantity: 1, price: 0, notes: '' });
      setShowForm(false);
    }
  };

  const filteredItems = filter
    ? shoppingItems.filter(item => item.category === filter)
    : shoppingItems;

  const completedCount = filteredItems.filter(item => item.completed).length;
  const totalPrice = filteredItems
    .filter(item => !item.completed)
    .reduce((sum, item) => sum + item.price * item.quantity, 0);

  const getCategoryColor = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.color || '#e8e6e3';
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || category;
  };

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground mb-4">Liste d'achats</h1>
        
        <div className="flex gap-2 mb-3">
          <Button
            onClick={() => setShowForm(true)}
            className="flex-1"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ajouter
          </Button>
          {suggestions.length > 0 && (
            <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-1">
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Suggestions ({suggestions.length})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ingrédients suggérés</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <p className="text-sm text-muted-foreground mb-3">
                    Basé sur vos repas planifiés de la semaine
                  </p>
                  {suggestions.map((suggestion, idx) => (
                    <Card key={idx} className="p-3 flex justify-between items-center">
                      <span>{suggestion}</span>
                      <Button
                        size="sm"
                        onClick={() => {
                          addShoppingItem({
                            name: suggestion,
                            category: 'food',
                            quantity: 1,
                            price: 0,
                            completed: false,
                            notes: '',
                          });
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Button
            variant={filter === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(null)}
            className="whitespace-nowrap"
          >
            Tous ({shoppingItems.length})
          </Button>
          {CATEGORIES.map(cat => (
            <Button
              key={cat.value}
              variant={filter === cat.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(cat.value)}
              className="whitespace-nowrap"
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {totalPrice > 0 && (
          <div className="mt-3 text-sm text-muted-foreground">
            Montant total : <span className="font-semibold text-foreground">{totalPrice.toFixed(2)}€</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Aucun article à afficher</p>
          </div>
        ) : (
          filteredItems.map(item => (
            <Card
              key={item.id}
              className={`p-4 transition-all ${item.completed ? 'opacity-60 bg-muted' : ''}`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => updateShoppingItem(item.id, { completed: !item.completed })}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    item.completed
                      ? 'bg-primary border-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  {item.completed && <Check className="w-4 h-4 text-primary-foreground" />}
                </button>

                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {item.name}
                  </h3>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      style={{ backgroundColor: getCategoryColor(item.category) + '40' }}
                      className="text-xs"
                    >
                      {getCategoryLabel(item.category)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Qty: {item.quantity}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {(item.price * item.quantity).toFixed(2)}€
                    </span>
                  </div>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground mt-2">{item.notes}</p>
                  )}
                </div>

                <button
                  onClick={() => deleteShoppingItem(item.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Ajouter un article</h2>

            <div>
              <label className="text-sm font-medium text-foreground">Nom de l'article</label>
              <Input
                placeholder="Ex: Couches taille 3"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              <div>
                <label className="text-sm font-medium text-foreground">Quantité</label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Prix (€)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Notes</label>
              <Input
                placeholder="Notes optionnelles"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
                onClick={handleAddItem}
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
