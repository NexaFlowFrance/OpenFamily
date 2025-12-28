import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, ShoppingCart, ClipboardList, Calendar, ChefHat, UtensilsCrossed, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SearchBarProps {
  onNavigate?: (page: 'shopping' | 'tasks' | 'appointments' | 'recipes' | 'meals') => void;
  onClose?: () => void;
}

export default function SearchBar({ onNavigate, onClose }: SearchBarProps) {
  const { shoppingItems, tasks, appointments, recipes, meals } = useApp();
  const [query, setQuery] = useState('');

  const searchResults = query.trim() ? {
    shopping: shoppingItems.filter(item => 
      item.name.toLowerCase().includes(query.toLowerCase())
    ),
    tasks: tasks.filter(task => 
      task.title.toLowerCase().includes(query.toLowerCase()) ||
      task.description?.toLowerCase().includes(query.toLowerCase())
    ),
    appointments: appointments.filter(apt => 
      apt.title.toLowerCase().includes(query.toLowerCase()) ||
      apt.location?.toLowerCase().includes(query.toLowerCase())
    ),
    recipes: recipes.filter(recipe => 
      recipe.title.toLowerCase().includes(query.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(query.toLowerCase()) ||
      recipe.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    ),
    meals: meals.filter(meal => {
      const mealTitle = meal.title || recipes.find(r => r.id === meal.recipeId)?.title || '';
      return mealTitle.toLowerCase().includes(query.toLowerCase());
    }),
  } : null;

  const totalResults = searchResults 
    ? searchResults.shopping.length + searchResults.tasks.length + 
      searchResults.appointments.length + searchResults.recipes.length + 
      searchResults.meals.length
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20">
      <Card className="w-full max-w-2xl mx-4 max-h-[70vh] flex flex-col">
        <div className="p-4 border-b sticky top-0 bg-background">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Rechercher dans toutes les catégories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setQuery('');
                onClose?.();
              }}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          {query && (
            <p className="text-sm text-muted-foreground mt-2">
              {totalResults} résultat(s) trouvé(s)
            </p>
          )}
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {!query && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Tapez pour rechercher dans vos données</p>
            </div>
          )}

          {query && totalResults === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Aucun résultat trouvé</p>
            </div>
          )}

          {/* Shopping Results */}
          {searchResults && searchResults.shopping.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Courses ({searchResults.shopping.length})</h3>
              </div>
              <div className="space-y-2">
                {searchResults.shopping.slice(0, 3).map(item => (
                  <Card 
                    key={item.id} 
                    className="p-3 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => {
                      onNavigate?.('shopping');
                      onClose?.();
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className={item.completed ? 'line-through text-muted-foreground' : ''}>
                        {item.name}
                      </span>
                      <Badge variant="secondary">{item.category}</Badge>
                    </div>
                  </Card>
                ))}
                {searchResults.shopping.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{searchResults.shopping.length - 3} autres
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tasks Results */}
          {searchResults && searchResults.tasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Tâches ({searchResults.tasks.length})</h3>
              </div>
              <div className="space-y-2">
                {searchResults.tasks.slice(0, 3).map(task => (
                  <Card 
                    key={task.id} 
                    className="p-3 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => {
                      onNavigate?.('tasks');
                      onClose?.();
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={task.completed ? 'line-through text-muted-foreground' : ''}>{task.title}</p>
                        <p className="text-xs text-muted-foreground">{task.dueDate}</p>
                      </div>
                      <Badge variant="secondary">{task.category}</Badge>
                    </div>
                  </Card>
                ))}
                {searchResults.tasks.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{searchResults.tasks.length - 3} autres
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Appointments Results */}
          {searchResults && searchResults.appointments.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Rendez-vous ({searchResults.appointments.length})</h3>
              </div>
              <div className="space-y-2">
                {searchResults.appointments.slice(0, 3).map(apt => (
                  <Card 
                    key={apt.id} 
                    className="p-3 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => {
                      onNavigate?.('appointments');
                      onClose?.();
                    }}
                  >
                    <div>
                      <p>{apt.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(apt.date).toLocaleDateString('fr-FR')} à {apt.time}
                      </p>
                      {apt.location && <p className="text-xs text-muted-foreground">📍 {apt.location}</p>}
                    </div>
                  </Card>
                ))}
                {searchResults.appointments.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{searchResults.appointments.length - 3} autres
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Recipes Results */}
          {searchResults && searchResults.recipes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ChefHat className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Recettes ({searchResults.recipes.length})</h3>
              </div>
              <div className="space-y-2">
                {searchResults.recipes.slice(0, 3).map(recipe => (
                  <Card 
                    key={recipe.id} 
                    className="p-3 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => {
                      onNavigate?.('recipes');
                      onClose?.();
                    }}
                  >
                    <div>
                      <p>{recipe.title}</p>
                      {recipe.description && <p className="text-xs text-muted-foreground">{recipe.description}</p>}
                      {recipe.tags && recipe.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {recipe.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
                {searchResults.recipes.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{searchResults.recipes.length - 3} autres
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Meals Results */}
          {searchResults && searchResults.meals.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <UtensilsCrossed className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Repas planifiés ({searchResults.meals.length})</h3>
              </div>
              <div className="space-y-2">
                {searchResults.meals.slice(0, 3).map(meal => {
                  const recipe = meal.recipeId ? recipes.find(r => r.id === meal.recipeId) : null;
                  return (
                    <Card 
                      key={meal.id} 
                      className="p-3 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => {
                        onNavigate?.('meals');
                        onClose?.();
                      }}
                    >
                      <div>
                        <p>{meal.title || recipe?.title || 'Repas'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(meal.date).toLocaleDateString('fr-FR')} - {meal.mealType}
                        </p>
                      </div>
                    </Card>
                  );
                })}
                {searchResults.meals.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{searchResults.meals.length - 3} autres
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
