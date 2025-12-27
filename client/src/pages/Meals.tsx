import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, ChefHat, Calendar, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { generateWeeklyMealPlan } from '@/lib/mealPlanner';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Petit-déjeuner', emoji: '🌅' },
  { value: 'lunch', label: 'Déjeuner', emoji: '🌞' },
  { value: 'dinner', label: 'Dîner', emoji: '🌙' },
  { value: 'snack', label: 'Goûter', emoji: '🍪' },
];

export default function Meals() {
  const { meals, recipes, addMeal, updateMeal, deleteMeal } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [showAutoPlanner, setShowAutoPlanner] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    mealType: 'lunch' as const,
    recipeId: '',
    title: '',
    notes: '',
  });

  // Obtenir la semaine en cours
  const getWeekDays = () => {
    const today = new Date();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const handleAddMeal = () => {
    if (formData.recipeId || formData.title.trim()) {
      addMeal({
        date: formData.date,
        mealType: formData.mealType,
        recipeId: formData.recipeId || undefined,
        title: formData.recipeId ? '' : formData.title,
        notes: formData.notes,
      });
      setFormData({
        date: new Date().toISOString().split('T')[0],
        mealType: 'lunch',
        recipeId: '',
        title: '',
        notes: '',
      });
      setShowForm(false);
    }
  };

  const getMealsForDate = (date: Date, mealType: string) => {
    const dateStr = date.toISOString().split('T')[0];
    return meals.filter(m => m.date === dateStr && m.mealType === mealType);
  };

  const getRecipeTitle = (recipeId?: string) => {
    if (!recipeId) return null;
    return recipes.find(r => r.id === recipeId)?.title;
  };

  const getMealTypeLabel = (type: string) => {
    return MEAL_TYPES.find(t => t.value === type)?.label || type;
  };

  const getMealTypeEmoji = (type: string) => {
    return MEAL_TYPES.find(t => t.value === type)?.emoji || '🍽️';
  };

  // Obtenir le mois en cours
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const getMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1));
    
    const days = [];
    const current = new Date(startDate);
    while (days.length < 42) { // 6 semaines max
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const weekDays = getWeekDays();
  const monthDays = getMonthDays();
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground mb-4">Planning des repas</h1>
        
        <div className="flex gap-2 mb-3">
          <Button
            variant={viewMode === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('week')}
          >
            Semaine
          </Button>
          <Button
            variant={viewMode === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('month')}
          >
            Mois
          </Button>
        </div>

        {recipes.length > 0 && (
          <Dialog open={showAutoPlanner} onOpenChange={setShowAutoPlanner}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <Sparkles className="w-4 h-4 mr-2" />
                Planifier automatiquement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Planification automatique</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Générer automatiquement un planning de repas pour la semaine en cours basé sur vos recettes.
                </p>
                <Button
                  onClick={() => {
                    const monday = weekDays[0];
                    const suggestions = generateWeeklyMealPlan(recipes, meals, monday);
                    
                    suggestions.forEach(suggestion => {
                      // Trouver la date appropriée pour ce type de repas
                      const dayIndex = Math.floor(suggestions.indexOf(suggestion) / 3);
                      if (dayIndex < 7) {
                        const date = new Date(monday);
                        date.setDate(monday.getDate() + dayIndex);
                        
                        addMeal({
                          date: date.toISOString().split('T')[0],
                          mealType: suggestion.mealType,
                          recipeId: suggestion.recipeId,
                          title: '',
                          notes: 'Planifié automatiquement',
                        });
                      }
                    });
                    
                    setShowAutoPlanner(false);
                  }}
                  className="w-full"
                >
                  Générer le planning
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="p-4">
        {viewMode === 'week' && (
          <div className="space-y-4">
            {weekDays.map(day => {
              const dateStr = day.toISOString().split('T')[0];
              const isToday = dateStr === today;

              return (
                <Card key={dateStr} className={`p-4 ${isToday ? 'border-primary border-2' : ''}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-lg">
                      {day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h3>
                    {isToday && (
                      <Badge variant="default" className="text-xs">Aujourd'hui</Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    {MEAL_TYPES.map(mealType => {
                      const dayMeals = getMealsForDate(day, mealType.value);
                      
                      return (
                        <div key={mealType.value} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                              <span>{mealType.emoji}</span>
                              <span>{mealType.label}</span>
                            </div>
                            <button
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  date: dateStr,
                                  mealType: mealType.value as any,
                                });
                                setShowForm(true);
                              }}
                              className="text-primary hover:text-primary/80"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          {dayMeals.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">Aucun repas prévu</p>
                          ) : (
                            <div className="space-y-1">
                              {dayMeals.map(meal => (
                                <div
                                  key={meal.id}
                                  className="flex items-center justify-between bg-muted/50 rounded p-2 text-sm"
                                >
                                  <div className="flex items-center gap-2">
                                    {meal.recipeId && <ChefHat className="w-3 h-3 text-primary" />}
                                    <span>
                                      {meal.recipeId ? getRecipeTitle(meal.recipeId) : meal.title}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => deleteMeal(meal.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {viewMode === 'month' && (
          <div className="space-y-4">
            {/* Navigation mois */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={prevMonth}>
                  ←
                </Button>
                <h2 className="text-lg font-semibold">
                  {currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </h2>
                <Button variant="outline" size="sm" onClick={nextMonth}>
                  →
                </Button>
              </div>
            </Card>

            {/* Calendrier mensuel */}
            <Card className="p-4">
              {/* En-têtes des jours */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                  <div key={day} className="text-center text-xs font-semibold text-muted-foreground p-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Grille du calendrier */}
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((day, index) => {
                  const dateStr = day.toISOString().split('T')[0];
                  const isToday = dateStr === today;
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const dayMeals = meals.filter(m => m.date === dateStr);
                  const hasMeals = dayMeals.length > 0;

                  return (
                    <button
                      key={index}
                      onClick={() => {
                        setFormData({
                          ...formData,
                          date: dateStr,
                        });
                        setShowForm(true);
                      }}
                      className={`
                        min-h-[80px] p-2 rounded-lg border transition-all text-left
                        ${isToday ? 'border-primary border-2 bg-primary/5' : 'border-border'}
                        ${!isCurrentMonth ? 'opacity-30' : 'hover:bg-muted/50'}
                        ${hasMeals ? 'bg-muted/30' : ''}
                      `}
                    >
                      <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : 'text-foreground'}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayMeals.slice(0, 3).map(meal => {
                          const mealEmoji = getMealTypeEmoji(meal.mealType);
                          const title = meal.recipeId ? getRecipeTitle(meal.recipeId) : meal.title;
                          return (
                            <div
                              key={meal.id}
                              className="text-[10px] truncate flex items-center gap-1"
                              title={`${getMealTypeLabel(meal.mealType)}: ${title}`}
                            >
                              <span>{mealEmoji}</span>
                              <span className="truncate">{title}</span>
                            </div>
                          );
                        })}
                        {dayMeals.length > 3 && (
                          <div className="text-[10px] text-muted-foreground">
                            +{dayMeals.length - 3}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Légende */}
            <Card className="p-4">
              <h3 className="font-medium mb-3">Légende</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {MEAL_TYPES.map(type => (
                  <div key={type.value} className="flex items-center gap-2">
                    <span>{type.emoji}</span>
                    <span>{type.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Formulaire ajout repas */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Planifier un repas</h2>

            <div>
              <label className="text-sm font-medium text-foreground">Date</label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Type de repas</label>
              <select
                value={formData.mealType}
                onChange={(e) => setFormData({ ...formData, mealType: e.target.value as any })}
                className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
              >
                {MEAL_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.emoji} {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Recette (optionnel)</label>
              <select
                value={formData.recipeId}
                onChange={(e) => {
                  setFormData({ ...formData, recipeId: e.target.value, title: '' });
                }}
                className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="">Aucune recette</option>
                {recipes.map(recipe => (
                  <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
                ))}
              </select>
            </div>

            {!formData.recipeId && (
              <div>
                <label className="text-sm font-medium text-foreground">Titre du repas</label>
                <Input
                  placeholder="Ex: Pâtes carbonara"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1"
                />
              </div>
            )}

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
                onClick={handleAddMeal}
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
