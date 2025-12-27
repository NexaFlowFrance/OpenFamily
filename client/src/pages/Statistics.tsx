import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Circle, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Calendar,
  UtensilsCrossed,
  ShoppingCart
} from 'lucide-react';

export default function Statistics() {
  const { tasks, appointments, budgets, meals, recipes, shoppingItems } = useApp();

  // Statistiques des tâches
  const completedTasks = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;
  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Tâches de cette semaine
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Lundi
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Dimanche

  const weekTasks = tasks.filter(task => {
    if (!task.dueDate) return false;
    const taskDate = new Date(task.dueDate);
    return taskDate >= startOfWeek && taskDate <= endOfWeek;
  });
  const weekCompletedTasks = weekTasks.filter(t => t.completed).length;
  const weekCompletionRate = weekTasks.length > 0 ? (weekCompletedTasks / weekTasks.length) * 100 : 0;

  // Statistiques de budget
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentBudget = budgets.find(b => b.month === currentMonth);
  const totalBudget = currentBudget 
    ? Object.values(currentBudget.categories).reduce((sum, val) => sum + val, 0)
    : 0;
  const totalSpent = currentBudget
    ? currentBudget.expenses.reduce((sum, exp) => sum + exp.amount, 0)
    : 0;
  const budgetUsage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // Statistiques de courses
  const pendingShoppingItems = shoppingItems.filter(item => !item.completed).length;
  const completedShoppingItems = shoppingItems.filter(item => item.completed).length;

  // Statistiques de repas
  const mealsThisWeek = meals.filter(meal => {
    const mealDate = new Date(meal.date);
    return mealDate >= startOfWeek && mealDate <= endOfWeek;
  });
  const plannedMealsCount = mealsThisWeek.length;
  const maxMealsPerWeek = 28; // 7 jours * 4 repas
  const mealPlanningRate = (plannedMealsCount / maxMealsPerWeek) * 100;

  // Rendez-vous à venir
  const upcomingAppointments = appointments.filter(apt => {
    const aptDate = new Date(`${apt.date}T${apt.time}`);
    return aptDate > now;
  }).length;

  return (
    <div className="container mx-auto p-6 max-w-7xl pb-24">
      <h1 className="text-3xl font-bold mb-6">Statistiques</h1>

      {/* Vue d'ensemble */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Tâches complétées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks} / {totalTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {taskCompletionRate.toFixed(0)}% terminé
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Budget utilisé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSpent.toFixed(0)} €</div>
            <p className="text-xs text-muted-foreground mt-1">
              {budgetUsage.toFixed(0)}% de {totalBudget.toFixed(0)} €
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Articles à acheter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingShoppingItems}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {completedShoppingItems} déjà achetés
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Rendez-vous à venir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingAppointments}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Prochainement
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performances de la semaine */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Cette semaine</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Tâches */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Tâches</span>
                <span className="text-sm text-muted-foreground">
                  {weekCompletedTasks} / {weekTasks.length}
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-green-500 transition-all"
                  style={{ width: `${weekCompletionRate}%` }}
                />
              </div>
            </div>

            {/* Planning des repas */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Repas planifiés</span>
                <span className="text-sm text-muted-foreground">
                  {plannedMealsCount} / {maxMealsPerWeek}
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${mealPlanningRate}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tendances */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recettes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Total</span>
                <Badge>{recipes.length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Utilisées cette semaine</span>
                <Badge variant="outline">
                  {mealsThisWeek.filter(m => m.recipeId).length}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Budget mensuel</CardTitle>
          </CardHeader>
          <CardContent>
            {currentBudget ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Reste disponible</span>
                  <div className={`flex items-center gap-2 ${totalBudget - totalSpent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {totalBudget - totalSpent >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span className="font-bold">{(totalBudget - totalSpent).toFixed(2)} €</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Dépenses</span>
                  <Badge variant="outline">{currentBudget.expenses.length} transactions</Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun budget ce mois-ci</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tâches récurrentes actives */}
      <Card>
        <CardHeader>
          <CardTitle>Tâches récurrentes</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.filter(t => t.recurring).length > 0 ? (
            <div className="space-y-2">
              {tasks.filter(t => t.recurring).map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.recurring?.frequency === 'daily' && 'Quotidienne'}
                        {task.recurring?.frequency === 'weekly' && 'Hebdomadaire'}
                        {task.recurring?.frequency === 'monthly' && 'Mensuelle'}
                        {task.recurring?.frequency === 'yearly' && 'Annuelle'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune tâche récurrente</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
