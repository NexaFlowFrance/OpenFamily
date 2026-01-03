import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAddButton } from "@/contexts/AddButtonContext";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useState, useEffect } from "react";
import { generateTaskOccurrences } from "@/lib/recurrence";
import { formatDateOnly, formatYearMonth } from "@/lib/dateOnly";
import { 
  Calendar, 
  ListChecks, 
  ShoppingCart, 
  CalendarDays, 
  UtensilsCrossed, 
  ChefHat, 
  ClipboardList,
  Settings,
  CheckCircle2,
  Wallet,
  BarChart3,
  MapPin,
  Plus,
  Columns3
} from "lucide-react";

interface HomeProps {
  onNavigate?: (page: 'shopping' | 'tasks' | 'appointments' | 'settings' | 'recipes' | 'meals' | 'budget' | 'statistics' | 'tasks-kanban') => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { shoppingItems, tasks, appointments, recipes, meals, budgets, familyMembers, addShoppingItem, addTask } = useApp();
  const { t } = useLanguage();
  const { setAddAction } = useAddButton();
  const dragScrollRef = useDragScroll<HTMLDivElement>();
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [showQuickShopping, setShowQuickShopping] = useState(false);
  const [quickTaskName, setQuickTaskName] = useState('');
  const [quickShoppingName, setQuickShoppingName] = useState('');

  useEffect(() => {
    setAddAction(() => setShowQuickTask(true));
    return () => setAddAction(null);
  }, [setAddAction]);

  const today = formatDateOnly(new Date());
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  
  // Calculer les tâches du jour en incluant les occurrences récurrentes
  const getTodayTasks = () => {
    const dayTasks: Array<{ task: any; isCompleted: boolean }> = [];
    tasks.forEach(task => {
      const occurrences = task.recurring 
        ? generateTaskOccurrences(task, todayStart, todayEnd)
        : [{ date: task.dueDate, time: task.dueTime }];
      
      occurrences.forEach(occ => {
        if (occ.date === today) {
          const isCompleted = task.recurring 
            ? (task.completedDates?.includes(occ.date) || false)
            : task.completed;
          dayTasks.push({ task, isCompleted });
        }
      });
    });
    return dayTasks;
  };
  
  const allTodayTasks = getTodayTasks();
  const todayTasks = allTodayTasks.filter(t => !t.isCompleted).map(t => t.task);
  const completedTodayTasks = allTodayTasks.filter(t => t.isCompleted).map(t => t.task);
  const upcomingAppointments = appointments.filter(apt => {
    const aptDate = new Date(`${apt.date}T${apt.time}`);
    return aptDate > new Date();
  }).slice(0, 3);
  const nextAppointment = upcomingAppointments[0];
  const pendingShoppingItems = shoppingItems.filter(item => !item.completed);
  const currentMonth = formatYearMonth(new Date());
  const currentBudget = budgets.find(b => b.month === currentMonth);
  
  // Calculs pour les widgets
  const totalBudget = currentBudget && currentBudget.categories
    ? Object.values(currentBudget.categories).reduce((sum, val) => sum + val, 0)
    : 0;
  const totalSpent = currentBudget && currentBudget.expenses
    ? currentBudget.expenses.reduce((sum, exp) => sum + exp.amount, 0)
    : 0;
  const budgetRemaining = totalBudget - totalSpent;
  const budgetPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  type HomeCard = {
    title: string;
    icon: any;
    color: string;
    iconColor: string;
    description: string;
    page?: NonNullable<HomeProps['onNavigate']> extends (page: infer P) => void ? P : never;
    badge?: number;
    comingSoon?: boolean;
  };

  const cards: HomeCard[] = [
    {
      title: t.home.cards.todayTasks,
      icon: ClipboardList,
      color: "from-purple-500/20 to-purple-600/20",
      iconColor: "text-purple-600",
      description: t.home.cards.todayTasksDescription.replace('{count}', todayTasks.length.toString()),
      page: "tasks" as const,
      badge: todayTasks.length
    },
    {
      title: t.home.cards.kanban,
      icon: Columns3,
      color: "from-cyan-500/20 to-cyan-600/20",
      iconColor: "text-cyan-600",
      description: t.home.cards.kanbanDescription,
      page: "tasks-kanban" as const,
    },
    {
      title: t.home.cards.shopping,
      icon: ShoppingCart,
      color: "from-orange-500/20 to-orange-600/20",
      iconColor: "text-orange-600",
      description: t.home.cards.shoppingDescription.replace('{count}', pendingShoppingItems.length.toString()),
      page: "shopping" as const,
      badge: pendingShoppingItems.length
    },
    {
      title: t.home.cards.budget,
      icon: Wallet,
      color: "from-emerald-500/20 to-emerald-600/20",
      iconColor: "text-emerald-600",
      description: currentBudget ? t.home.cards.budgetDescriptionManage : t.home.cards.budgetDescriptionCreate,
      page: "budget" as const,
    },
    {
      title: t.home.cards.recipes,
      icon: ChefHat,
      color: "from-yellow-500/20 to-yellow-600/20",
      iconColor: "text-yellow-600",
      description: t.home.cards.recipesDescription,
      page: "recipes" as const,
      badge: recipes.length
    },
    {
      title: t.home.cards.meals,
      icon: UtensilsCrossed,
      color: "from-pink-500/20 to-pink-600/20",
      iconColor: "text-pink-600",
      description: t.home.cards.mealsDescription,
      page: "meals" as const,
      badge: meals.length
    },
    {
      title: t.home.cards.statistics,
      icon: BarChart3,
      color: "from-indigo-500/20 to-indigo-600/20",
      iconColor: "text-indigo-600",
      description: t.home.cards.statisticsDescription,
      page: "statistics" as const,
    },
    {
      title: t.home.cards.settings,
      icon: Settings,
      color: "from-gray-500/20 to-gray-600/20",
      iconColor: "text-gray-600",
      description: t.home.cards.settingsDescription,
      page: "settings" as const,
    },
  ];

  return (
    <div ref={dragScrollRef} className="pb-24 overflow-y-auto h-screen">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t.home.title}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="p-4">
        {/* Widgets raccourcis rapides */}
        <Card className="p-4 mb-6 bg-gradient-to-br from-blue-500/10 to-blue-600/10">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            {t.home.quickActions}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {!showQuickTask ? (
              <Button
                variant="outline"
                className="h-auto py-3 flex-col gap-2"
                onClick={() => setShowQuickTask(true)}
              >
                <ClipboardList className="w-5 h-5" />
                <span className="text-xs">{t.home.addTask}</span>
              </Button>
            ) : (
              <div className="col-span-2 space-y-2">
                <Input
                  placeholder={t.home.newTask}
                  value={quickTaskName}
                  onChange={(e) => setQuickTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && quickTaskName.trim()) {
                      addTask({
                        title: quickTaskName,
                        category: 'household',
                        dueDate: new Date().toISOString().split('T')[0],
                        completed: false,
                        priority: 'medium',
                      });
                      setQuickTaskName('');
                      setShowQuickTask(false);
                    }
                  }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowQuickTask(false);
                      setQuickTaskName('');
                    }}
                    className="flex-1"
                  >
                    {t.cancel}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (quickTaskName.trim()) {
                        addTask({
                          title: quickTaskName,
                          category: 'household',
                          dueDate: new Date().toISOString().split('T')[0],
                          completed: false,
                          priority: 'medium',
                        });
                        setQuickTaskName('');
                        setShowQuickTask(false);
                      }
                    }}
                    className="flex-1"
                  >
                    {t.add}
                  </Button>
                </div>
              </div>
            )}
            
            {!showQuickShopping && !showQuickTask && (
              <Button
                variant="outline"
                className="h-auto py-3 flex-col gap-2"
                onClick={() => setShowQuickShopping(true)}
              >
                <ShoppingCart className="w-5 h-5" />
                <span className="text-xs">{t.home.addItem}</span>
              </Button>
            )}
            
            {showQuickShopping && (
              <div className="col-span-2 space-y-2">
                <Input
                  placeholder={t.home.newItem}
                  value={quickShoppingName}
                  onChange={(e) => setQuickShoppingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && quickShoppingName.trim()) {
                      addShoppingItem({
                        name: quickShoppingName,
                        category: 'food',
                        quantity: 1,
                        price: 0,
                        completed: false,
                      });
                      setQuickShoppingName('');
                      setShowQuickShopping(false);
                    }
                  }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowQuickShopping(false);
                      setQuickShoppingName('');
                    }}
                    className="flex-1"
                  >
                    {t.cancel}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (quickShoppingName.trim()) {
                        addShoppingItem({
                          name: quickShoppingName,
                          category: 'food',
                          quantity: 1,
                          price: 0,
                          completed: false,
                        });
                        setQuickShoppingName('');
                        setShowQuickShopping(false);
                      }
                    }}
                    className="flex-1"
                  >
                    {t.add}
                  </Button>
                </div>
              </div>
            )}

            {!showQuickTask && !showQuickShopping && (
              <>
                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col gap-2"
                  onClick={() => onNavigate?.('meals')}
                >
                  <UtensilsCrossed className="w-5 h-5" />
                  <span className="text-xs">{t.home.mealPlanning}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col gap-2"
                  onClick={() => onNavigate?.('recipes')}
                >
                  <ChefHat className="w-5 h-5" />
                  <span className="text-xs">{t.home.viewRecipes}</span>
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* Résumé rapide */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-3 text-center bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-0">
            <div className="text-2xl font-bold text-blue-600">{todayTasks.length}</div>
            <div className="text-xs text-muted-foreground">{t.home.tasksToday}</div>
          </Card>
          <Card className="p-3 text-center bg-gradient-to-br from-green-500/10 to-green-600/10 border-0">
            <div className="text-2xl font-bold text-green-600">{upcomingAppointments.length}</div>
            <div className="text-xs text-muted-foreground">{t.home.upcomingAppointments}</div>
          </Card>
          <Card className="p-3 text-center bg-gradient-to-br from-orange-500/10 to-orange-600/10 border-0">
            <div className="text-2xl font-bold text-orange-600">{pendingShoppingItems.length}</div>
            <div className="text-xs text-muted-foreground">{t.home.toBuy}</div>
          </Card>
        </div>

        {/* Cards principales */}
        <div className="grid grid-cols-2 gap-4">
          {cards.map((card) => (
            <Card
              key={card.title}
              onClick={() => !card.comingSoon && card.page && onNavigate?.(card.page)}
              className={`p-4 cursor-pointer transition-all hover:shadow-lg active:scale-95 bg-gradient-to-br ${card.color} border-0 relative overflow-hidden ${
                card.comingSoon ? 'opacity-60' : ''
              }`}
            >
              {card.comingSoon && (
                <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                  {t.home.comingSoon}
                </div>
              )}
              
              <div className="flex flex-col items-center text-center gap-2">
                <div className={`p-3 rounded-full bg-background/50 ${card.iconColor}`}>
                  <card.icon className="w-6 h-6" />
                </div>
                
                <div>
                  <h3 className="font-semibold text-foreground flex items-center justify-center gap-2">
                    {card.title}
                    {card.badge !== undefined && card.badge > 0 && (
                      <span className={`bg-background/50 ${card.iconColor} text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium`}>
                        {card.badge}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Rendez-vous à venir */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{t.home.upcomingAppointments}</h2>
            <Button
              size="sm"
              onClick={() => onNavigate?.('appointments')}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              {t.add}
            </Button>
          </div>
          {upcomingAppointments.length === 0 ? (
            <Card className="p-8 text-center">
              <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">{t.home.noUpcomingAppointments}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate?.('appointments')}
                className="mt-4"
              >
                {t.home.addAppointment}
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {upcomingAppointments.map(apt => (
                <Card key={apt.id} className="p-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer" onClick={() => onNavigate?.('appointments')}>
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/20 flex flex-col items-center justify-center">
                    <div className="text-xs font-medium text-primary">
                      {new Date(apt.date).toLocaleDateString('fr-FR', { month: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-primary">
                      {apt.date.split('-')[2]}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{apt.title}</h3>
                    <p className="text-xs text-muted-foreground">{apt.time}</p>
                    {apt.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {apt.location}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Aperçu des tâches du jour */}
        {todayTasks.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-3">{t.home.tasksToday}</h2>
            <div className="space-y-2">
              {todayTasks.slice(0, 3).map(task => (
                <Card key={task.id} className="p-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{task.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t.home.priority} {task.priority === 'high' ? t.home.priorities.high : task.priority === 'medium' ? t.home.priorities.medium : t.home.priorities.low}
                    </p>
                  </div>
                </Card>
              ))}
              {todayTasks.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{todayTasks.length - 3} {t.home.otherTasks}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
