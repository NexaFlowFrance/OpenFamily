import { useApp } from '@/contexts/AppContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatYearMonth } from '@/lib/dateOnly';
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
  const { t } = useLanguage();
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
  const currentMonth = formatYearMonth(new Date());
  const currentBudget = budgets.find(b => b.month === currentMonth);
  const totalBudget = currentBudget && currentBudget.categories
    ? Object.values(currentBudget.categories).reduce((sum, val) => sum + (Number(val) || 0), 0)
    : 0;
  const totalSpent = currentBudget && currentBudget.expenses
    ? currentBudget.expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0)
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
      <h1 className="text-3xl font-bold mb-6">{t.statistics.title}</h1>

      {/* Vue d'ensemble */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {t.statistics.tasksCompleted}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks} / {totalTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {taskCompletionRate.toFixed(0)}% {t.statistics.completed}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              {t.statistics.budgetUsed}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSpent.toFixed(0)} €</div>
            <p className="text-xs text-muted-foreground mt-1">
              {budgetUsage.toFixed(0)}% {t.statistics.of} {totalBudget.toFixed(0)} €
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              {t.statistics.itemsToBuy}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingShoppingItems}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {completedShoppingItems} {t.statistics.alreadyBought}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {t.statistics.upcomingAppointments}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingAppointments}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t.statistics.upcoming}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performances de la semaine */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t.statistics.thisWeek}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Tâches */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">{t.statistics.tasks}</span>
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
                <span className="text-sm font-medium">{t.statistics.plannedMeals}</span>
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
            <CardTitle className="text-lg">{t.statistics.recipes}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">{t.statistics.total}</span>
                <Badge>{recipes.length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">{t.statistics.usedThisWeek}</span>
                <Badge variant="outline">
                  {mealsThisWeek.filter(m => m.recipeId).length}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t.statistics.monthlyBudget}</CardTitle>
          </CardHeader>
          <CardContent>
            {currentBudget ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">{t.statistics.remainingAvailable}</span>
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
                  <span className="text-sm">{t.statistics.expenses}</span>
                  <Badge variant="outline">{currentBudget.expenses.length} {t.statistics.transactions}</Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.statistics.noBudgetThisMonth}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tâches récurrentes actives */}
      <Card>
        <CardHeader>
          <CardTitle>{t.statistics.recurringTasks}</CardTitle>
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
                        {task.recurring?.frequency === 'daily' && t.statistics.frequencies.daily}
                        {task.recurring?.frequency === 'weekly' && t.statistics.frequencies.weekly}
                        {task.recurring?.frequency === 'monthly' && t.statistics.frequencies.monthly}
                        {task.recurring?.frequency === 'yearly' && t.statistics.frequencies.yearly}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">{t.statistics.noRecurringTask}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
