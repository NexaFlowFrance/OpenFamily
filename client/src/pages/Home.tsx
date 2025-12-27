import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
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
  Plus
} from "lucide-react";

interface HomeProps {
  onNavigate?: (page: 'shopping' | 'tasks' | 'appointments' | 'settings' | 'recipes' | 'meals' | 'budget' | 'statistics') => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { shoppingItems, tasks, appointments, recipes, meals, budgets, familyMembers } = useApp();

  const today = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(task => task.dueDate === today && !task.completed);
  const completedTodayTasks = tasks.filter(task => task.dueDate === today && task.completed);
  const upcomingAppointments = appointments.filter(apt => {
    const aptDate = new Date(`${apt.date}T${apt.time}`);
    return aptDate > new Date();
  }).slice(0, 3);
  const nextAppointment = upcomingAppointments[0];
  const pendingShoppingItems = shoppingItems.filter(item => !item.completed);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentBudget = budgets.find(b => b.month === currentMonth);
  
  // Calculs pour les widgets
  const totalBudget = currentBudget 
    ? Object.values(currentBudget.categories).reduce((sum, val) => sum + val, 0)
    : 0;
  const totalSpent = currentBudget
    ? currentBudget.expenses.reduce((sum, exp) => sum + exp.amount, 0)
    : 0;
  const budgetRemaining = totalBudget - totalSpent;
  const budgetPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const cards = [
    {
      title: "Tâches du jour",
      icon: ClipboardList,
      color: "from-purple-500/20 to-purple-600/20",
      iconColor: "text-purple-600",
      description: `${todayTasks.length} tâche(s) à faire`,
      page: "tasks" as const,
      badge: todayTasks.length
    },
    {
      title: "Courses",
      icon: ShoppingCart,
      color: "from-orange-500/20 to-orange-600/20",
      iconColor: "text-orange-600",
      description: `${pendingShoppingItems.length} article(s)`,
      page: "shopping" as const,
      badge: pendingShoppingItems.length
    },
    {
      title: "Budget",
      icon: Wallet,
      color: "from-emerald-500/20 to-emerald-600/20",
      iconColor: "text-emerald-600",
      description: currentBudget ? "Gérer les finances" : "Créer un budget",
      page: "budget" as const,
    },
    {
      title: "Statistiques",
      icon: BarChart3,
      color: "from-indigo-500/20 to-indigo-600/20",
      iconColor: "text-indigo-600",
      description: "Aperçu et graphiques",
      page: "statistics" as const,
    },
    {
      title: "Listes",
      icon: ListChecks,
      color: "from-cyan-500/20 to-cyan-600/20",
      iconColor: "text-cyan-600",
      description: "Toutes vos listes",
      page: "tasks" as const,
    },
    {
      title: "Repas",
      icon: UtensilsCrossed,
      color: "from-pink-500/20 to-pink-600/20",
      iconColor: "text-pink-600",
      description: "Planning des repas",
      page: "meals" as const,
      badge: meals.length
    },
    {
      title: "Recettes",
      icon: ChefHat,
      color: "from-yellow-500/20 to-yellow-600/20",
      iconColor: "text-yellow-600",
      description: "Livre de recettes",
      page: "recipes" as const,
      badge: recipes.length
    },
    {
      title: "Paramètres",
      icon: Settings,
      color: "from-gray-500/20 to-gray-600/20",
      iconColor: "text-gray-600",
      description: "Configuration",
      page: "settings" as const,
    },
  ];

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground mb-2">Accueil</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="p-4">
        {/* Widgets détaillés */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          {/* Widget Tâches du jour */}
          {todayTasks.length > 0 && (
            <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                  Aujourd'hui
                </h3>
                <Badge variant="secondary">{todayTasks.length} à faire</Badge>
              </div>
              <div className="space-y-2">
                {todayTasks.slice(0, 3).map(task => (
                  <div key={task.id} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="flex-1 truncate">{task.title}</span>
                  </div>
                ))}
                {todayTasks.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{todayTasks.length - 3} autres tâches
                  </p>
                )}
              </div>
              {completedTodayTasks.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-green-600">
                    ✓ {completedTodayTasks.length} tâche(s) terminée(s)
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Widget Prochain rendez-vous */}
          {nextAppointment && (
            <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-green-600" />
                  Prochain RDV
                </h3>
              </div>
              <div className="space-y-2">
                <p className="font-medium">{nextAppointment.title}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(nextAppointment.date).toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long' 
                  })} à {nextAppointment.time}
                </p>
                {nextAppointment.location && (
                  <p className="text-xs text-muted-foreground">📍 {nextAppointment.location}</p>
                )}
              </div>
            </Card>
          )}

          {/* Widget Budget */}
          {currentBudget && (
            <Card className="p-4 bg-gradient-to-br from-emerald-500/10 to-emerald-600/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                  Budget du mois
                </h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Utilisé</span>
                    <span className="font-medium">{totalSpent.toFixed(0)} € / {totalBudget.toFixed(0)} €</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${budgetPercentage > 90 ? 'bg-red-500' : budgetPercentage > 70 ? 'bg-orange-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                    />
                  </div>
                </div>
                <div className={`text-sm font-medium ${budgetRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {budgetRemaining >= 0 ? `Reste ${budgetRemaining.toFixed(0)} €` : `Dépassé de ${Math.abs(budgetRemaining).toFixed(0)} €`}
                </div>
              </div>
            </Card>
          )}

          {/* Widget Repas planifiés */}
          {meals.length > 0 && (
            <Card className="p-4 bg-gradient-to-br from-pink-500/10 to-pink-600/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-pink-600" />
                  Cette semaine
                </h3>
                <Badge variant="secondary">{meals.length} repas</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {recipes.length} recette(s) dans votre bibliothèque
              </p>
            </Card>
          )}
        </div>

        {/* Résumé rapide */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-3 text-center bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-200">
            <div className="text-2xl font-bold text-blue-600">{todayTasks.length}</div>
            <div className="text-xs text-muted-foreground">Tâches du jour</div>
          </Card>
          <Card className="p-3 text-center bg-gradient-to-br from-green-500/10 to-green-600/10 border-green-200">
            <div className="text-2xl font-bold text-green-600">{upcomingAppointments.length}</div>
            <div className="text-xs text-muted-foreground">RDV à venir</div>
          </Card>
          <Card className="p-3 text-center bg-gradient-to-br from-orange-500/10 to-orange-600/10 border-orange-200">
            <div className="text-2xl font-bold text-orange-600">{pendingShoppingItems.length}</div>
            <div className="text-xs text-muted-foreground">À acheter</div>
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
                  Bientôt
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
                      <span className="bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
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
            <h2 className="text-lg font-semibold">Rendez-vous à venir</h2>
            <Button
              size="sm"
              onClick={() => onNavigate?.('appointments')}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </Button>
          </div>
          {upcomingAppointments.length === 0 ? (
            <Card className="p-8 text-center">
              <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucun rendez-vous à venir</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate?.('appointments')}
                className="mt-4"
              >
                Ajouter un rendez-vous
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
            <h2 className="text-lg font-semibold mb-3">Tâches du jour</h2>
            <div className="space-y-2">
              {todayTasks.slice(0, 3).map(task => (
                <Card key={task.id} className="p-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{task.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Priorité: {task.priority === 'high' ? 'Haute' : task.priority === 'medium' ? 'Moyenne' : 'Basse'}
                    </p>
                  </div>
                </Card>
              ))}
              {todayTasks.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{todayTasks.length - 3} autre(s) tâche(s)
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
