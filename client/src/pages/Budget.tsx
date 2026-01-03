import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAddButton } from '@/contexts/AddButtonContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, TrendingUp, TrendingDown, BarChart3, PieChart, Edit, Trash, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateOnly, formatYearMonth } from '@/lib/dateOnly';

const getCategoryLabels = (t: any) => ({
  food: t.budget.food,
  health: t.budget.health,
  children: t.budget.children,
  home: t.budget.home,
  leisure: t.budget.leisure,
  other: t.budget.other,
});

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
  const { setAddAction } = useAddButton();
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();
  
  const categoryLabels = getCategoryLabels(t);
  const [selectedMonth, setSelectedMonth] = useState(formatYearMonth(new Date()));
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [isEditBudgetDialogOpen, setIsEditBudgetDialogOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  
  const [newExpense, setNewExpense] = useState({
    category: 'food' as const,
    amount: 0,
    description: '',
    date: formatDateOnly(new Date()),
  });

  const [newBudgetLimits, setNewBudgetLimits] = useState({
    food: 400,
    health: 200,
    children: 300,
    home: 500,
    leisure: 200,
    other: 100,
  });

  useEffect(() => {
    setAddAction(() => setIsExpenseDialogOpen(true));
    return () => setAddAction(null);
  }, [setAddAction]);

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

    if (currentBudget.expenses) {
      currentBudget.expenses.forEach(expense => {
        const amount = Number(expense.amount) || 0;
        spent[expense.category] += amount;
      });
    }

    const total = Object.values(spent).reduce((sum, val) => sum + val, 0);
    const limit = currentBudget.categories 
      ? Object.values(currentBudget.categories).reduce((sum, val) => sum + (Number(val) || 0), 0) 
      : 0;

    return { spent, total, limit };
  };

  const handleAddExpense = () => {
    if (!currentBudget) {
      alert(t.budget.createBudgetFirst);
      return;
    }

    addExpense(currentBudget.id, newExpense);
    setNewExpense({
      category: 'food',
      amount: 0,
      description: '',
      date: formatDateOnly(new Date()),
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

  const handleEditBudget = () => {
    if (currentBudget) {
      updateBudget(currentBudget.id, {
        month: selectedMonth,
        categories: newBudgetLimits,
        expenses: currentBudget.expenses,
      });
      setIsEditBudgetDialogOpen(false);
    }
  };

  const handleDeleteBudget = () => {
    if (currentBudget && confirm(t.budget.deleteConfirm)) {
      deleteBudget(currentBudget.id);
      setIsEditBudgetDialogOpen(false);
    }
  };

  const openEditDialog = () => {
    if (currentBudget) {
      setNewBudgetLimits(currentBudget.categories);
      setIsEditBudgetDialogOpen(true);
    }
  };

  const goToPreviousMonth = () => {
    const date = new Date(selectedMonth + '-01');
    date.setMonth(date.getMonth() - 1);
    setSelectedMonth(formatYearMonth(date));
  };

  const goToNextMonth = () => {
    const date = new Date(selectedMonth + '-01');
    date.setMonth(date.getMonth() + 1);
    setSelectedMonth(formatYearMonth(date));
  };

  const formatMonthYear = (monthString: string) => {
    const date = new Date(monthString + '-01');
    return date.toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' });
  };

  const totals = calculateTotals();
  const remaining = Number(totals.limit - totals.total) || 0;

  // Calcul des statistiques sur les 6 derniers mois
  const getMonthlyStats = () => {
    const stats = [];
    const currentDate = new Date(selectedMonth);
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      const monthStr = formatYearMonth(date);
      const budget = budgets.find(b => b.month === monthStr);
      
      if (budget) {
        const total = budget.expenses ? budget.expenses.reduce((sum, exp) => sum + Number(exp.amount), 0) : 0;
        const limit = budget.categories ? Object.values(budget.categories).reduce((sum, val) => sum + Number(val), 0) : 0;
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
    <div className="container mx-auto p-4 md:p-6 pb-[calc(8rem+env(safe-area-inset-bottom))] max-w-7xl h-screen overflow-y-auto">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">{t.budget.title}</h1>
        <div className="flex gap-2 items-center">
          <div className="flex items-center border rounded-md bg-background">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToPreviousMonth}
              className="px-2 hover:bg-muted rounded-r-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="px-3 py-2 text-sm font-medium border-x min-w-[4rem] text-center">
              {formatMonthYear(selectedMonth)}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToNextMonth}
              className="px-2 hover:bg-muted rounded-l-none"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            {currentBudget && (
              <Button variant="outline" onClick={openEditDialog} className="h-10 px-3">
                <Edit className="w-4 h-4" />
                <span className="hidden md:inline ml-2">{t.budget.editBudget}</span>
              </Button>
            )}
            {currentBudget ? (
              <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-10">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">{t.budget.addExpense}</span>
                    <span className="sm:hidden">{t.budget.expense}</span>
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.budget.newExpense}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>{t.budget.category}</Label>
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
                    <Label>{t.budget.amount}</Label>
                    <Input
                      type="number"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>{t.budget.description}</Label>
                    <Input
                      value={newExpense.description}
                      onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{t.budget.date}</Label>
                    <Input
                      type="date"
                      value={newExpense.date}
                      onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleAddExpense} className="w-full">
                    {t.add}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
              <DialogTrigger asChild>
                <Button>{t.budget.createBudget}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.budget.newBudgetFor} {selectedMonth}</DialogTitle>
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
                    {t.add}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          </div>
        </div>
      </div>

      {!currentBudget ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground mb-4">{t.budget.noBudget}</p>
            <Button onClick={() => setIsBudgetDialogOpen(true)}>
              {t.budget.createBudget}
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
              {showStats ? t.budget.hideStats : t.budget.showStats}
            </Button>
          </div>

          {/* Statistiques */}
          {showStats && monthlyStats.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  {t.budget.last6Months}
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
                            {formatPrice(stat.total)} / {formatPrice(stat.limit)}
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
                    {t.budget.categoryBreakdown}
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
                                {formatPrice(amount)} / {formatPrice(limit)}
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
                <CardTitle className="text-sm font-medium text-muted-foreground">{t.budget.totalBudget}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(totals.limit)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t.budget.spent}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatPrice(totals.total)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {((totals.total / totals.limit) * 100).toFixed(0)}% {t.budget.used}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t.budget.remaining}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPrice(remaining)}
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
              <CardTitle>{t.budget.byCategory}</CardTitle>
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
                          {formatPrice(spent)} / {formatPrice(limit)}
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
              <CardTitle>{t.budget.monthExpenses}</CardTitle>
            </CardHeader>
            <CardContent>
              {currentBudget.expenses.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{t.budget.noExpenses}</p>
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
                          <span className="font-bold">{formatPrice(expense.amount)}</span>
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

      {/* Dialog de modification du budget */}
      <Dialog open={isEditBudgetDialogOpen} onOpenChange={setIsEditBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.budget.editBudgetFor} {selectedMonth}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t.budget.modifyAmounts}
            </p>
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditBudgetDialogOpen(false)} className="flex-1">
                {t.cancel}
              </Button>
              <Button variant="destructive" onClick={handleDeleteBudget}>
                <Trash className="w-4 h-4 mr-2" />
                {t.budget.deleteBudget}
              </Button>
              <Button onClick={handleEditBudget} className="flex-1">
                {t.save}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
