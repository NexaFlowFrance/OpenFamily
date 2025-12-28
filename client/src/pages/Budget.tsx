import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, TrendingUp, TrendingDown, BarChart3, PieChart } from 'lucide-react';

const categoryLabels = {
  food: 'Alimentation',
  health: 'Santé',
  children: 'Enfants',
  home: 'Maison',
  leisure: 'Loisirs',
  other: 'Autre',
};

const categoryColors = {
  food: 'bg-green-500',
  health: 'bg-red-500',
  children: 'bg-blue-500',
  home: 'bg-yellow-500',
  leisure: 'bg-purple-500',
  other: 'bg-gray-500',
};

export default function Budget() {
  const { budgets, addBudget, updateBudget, deleteBudget, addExpense, deleteExpense } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  
  const [newExpense, setNewExpense] = useState({
    category: 'food' as const,
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const [newBudgetLimits, setNewBudgetLimits] = useState({
    food: 400,
    health: 200,
    children: 300,
    home: 500,
    leisure: 200,
    other: 100,
  });

  const currentBudget = budgets.find(b => b.month === selectedMonth);

  const calculateTotals = () => {
    const spent = {
      food: 0,
      health: 0,
      children: 0,
      home: 0,
      leisure: 0,
      other: 0,
    };
    
    if (!currentBudget) return { spent, total: 0, limit: 0 };

    currentBudget.expenses.forEach(expense => {
      spent[expense.category] += expense.amount;
    });

    const total = Object.values(spent).reduce((sum, val) => sum + val, 0);
    const limit = Object.values(currentBudget.categories).reduce((sum, val) => sum + val, 0);

    return { spent, total, limit };
  };

  const handleAddExpense = () => {
    if (!currentBudget) {
      alert('Créez d\'abord un budget pour ce mois');
      return;
    }
    addExpense(currentBudget.id, newExpense);
    setNewExpense({
      category: 'food',
      amount: 0,
      description: '',
      date: new Date().toISOString().split('T')[0],
    });
    setIsExpenseDialogOpen(false);
  };

  const handleCreateBudget = () => {
    addBudget({
      month: selectedMonth,
      categories: newBudgetLimits,
      expenses: [],
    });
    setIsBudgetDialogOpen(false);
  };

  const totals = calculateTotals();
  const remaining = totals.limit - totals.total;

  // Calcul des statistiques sur les 6 derniers mois
  const getMonthlyStats = () => {
    const stats = [];
    const currentDate = new Date(selectedMonth);
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      const monthStr = date.toISOString().slice(0, 7);
      const budget = budgets.find(b => b.month === monthStr);
      
      if (budget) {
        const total = budget.expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const limit = Object.values(budget.categories).reduce((sum, val) => sum + val, 0);
        stats.push({
          month: monthStr,
          monthLabel: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
          total,
          limit,
        });
      }
    }
    
    return stats;
  };

  const monthlyStats = getMonthlyStats();

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Budget Familial</h1>
        <div className="flex gap-2">
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-48"
          />
          {currentBudget ? (
            <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter une dépense
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nouvelle dépense</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Catégorie</Label>
                    <Select
                      value={newExpense.category}
                      onValueChange={(value: any) => setNewExpense({ ...newExpense, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Montant (€)</Label>
                    <Input
                      type="number"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={newExpense.description}
                      onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newExpense.date}
                      onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleAddExpense} className="w-full">
                    Ajouter
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
              <DialogTrigger asChild>
                <Button>Créer un budget</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nouveau budget pour {selectedMonth}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <div key={key}>
                      <Label>{label}</Label>
                      <Input
                        type="number"
                        value={newBudgetLimits[key as keyof typeof newBudgetLimits]}
                        onChange={(e) => setNewBudgetLimits({
                          ...newBudgetLimits,
                          [key]: parseFloat(e.target.value) || 0
                        })}
                      />
                    </div>
                  ))}
                  <Button onClick={handleCreateBudget} className="w-full">
                    Créer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {!currentBudget ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground mb-4">Aucun budget pour ce mois</p>
            <Button onClick={() => setIsBudgetDialogOpen(true)}>
              Créer un budget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Bouton statistiques */}
          <div className="mb-4">
            <Button
              variant={showStats ? 'default' : 'outline'}
              onClick={() => setShowStats(!showStats)}
            >
              {showStats ? <BarChart3 className="w-4 h-4 mr-2" /> : <PieChart className="w-4 h-4 mr-2" />}
              {showStats ? 'Masquer les statistiques' : 'Voir les statistiques'}
            </Button>
          </div>

          {/* Statistiques */}
          {showStats && monthlyStats.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Évolution des 6 derniers mois
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Graphique en barres simple */}
                <div className="space-y-4">
                  {monthlyStats.map((stat) => {
                    const percentage = (stat.total / stat.limit) * 100;
                    const isOver = percentage > 100;
                    
                    return (
                      <div key={stat.month} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{stat.monthLabel}</span>
                          <span className={isOver ? 'text-red-500 font-semibold' : 'text-muted-foreground'}>
                            {stat.total.toFixed(0)}€ / {stat.limit}€
                          </span>
                        </div>
                        <div className="relative h-8 bg-muted rounded-lg overflow-hidden">
                          <div
                            className={`h-full ${isOver ? 'bg-red-500' : 'bg-primary'} transition-all`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                          {isOver && (
                            <div
                              className="absolute top-0 h-full bg-red-600 opacity-50"
                              style={{ width: `${((percentage - 100) / percentage) * 100}%`, right: 0 }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Répartition par catégorie */}
                <div className="mt-8 pt-8 border-t">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <PieChart className="w-5 h-5" />
                    Répartition par catégorie (mois en cours)
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(totals.spent)
                      .sort(([, a], [, b]) => b - a)
                      .map(([category, amount]) => {
                        const limit = currentBudget.categories[category as keyof typeof currentBudget.categories];
                        const percentage = limit > 0 ? (amount / limit) * 100 : 0;
                        const isOver = percentage > 100;
                        
                        return (
                          <div key={category}>
                            <div className="flex justify-between text-sm mb-1">
                              <span>{categoryLabels[category as keyof typeof categoryLabels]}</span>
                              <span className={isOver ? 'text-red-500 font-semibold' : ''}>
                                {amount.toFixed(0)}€ / {limit}€
                              </span>
                            </div>
                            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${categoryColors[category as keyof typeof categoryColors]} transition-all`}
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vue d'ensemble */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Budget Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.limit.toFixed(2)} €</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Dépensé</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{totals.total.toFixed(2)} €</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {((totals.total / totals.limit) * 100).toFixed(0)}% utilisé
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Restant</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {remaining.toFixed(2)} €
                  {remaining >= 0 ? (
                    <TrendingUp className="inline ml-2 w-5 h-5" />
                  ) : (
                    <TrendingDown className="inline ml-2 w-5 h-5" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Catégories */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Par catégorie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>).map((key) => {
                  const label = categoryLabels[key];
                  const limit = currentBudget.categories[key];
                  const spent = totals.spent[key];
                  const percentage = (spent / limit) * 100;
                  
                  return (
                    <div key={key}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-sm text-muted-foreground">
                          {spent.toFixed(2)} € / {limit.toFixed(2)} €
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${categoryColors[key]} transition-all`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Liste des dépenses */}
          <Card>
            <CardHeader>
              <CardTitle>Dépenses du mois</CardTitle>
            </CardHeader>
            <CardContent>
              {currentBudget.expenses.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Aucune dépense enregistrée</p>
              ) : (
                <div className="space-y-2">
                  {currentBudget.expenses
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((expense) => (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${categoryColors[expense.category]}`} />
                          <div>
                            <p className="font-medium">{expense.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {categoryLabels[expense.category]} • {new Date(expense.date).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">{expense.amount.toFixed(2)} €</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteExpense(currentBudget.id, expense.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
