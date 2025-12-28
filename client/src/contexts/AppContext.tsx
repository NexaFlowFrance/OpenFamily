import React, { createContext, useContext } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { ShoppingItem, ShoppingTemplate, Task, Appointment, FamilyMember, Recipe, Meal, Budget } from '@/types';
import { nanoid } from 'nanoid';
import { scheduleTaskNotification } from '@/lib/notifications';

interface AppContextType {
  shoppingItems: ShoppingItem[];
  shoppingTemplates: ShoppingTemplate[];
  tasks: Task[];
  appointments: Appointment[];
  familyMembers: FamilyMember[];
  recipes: Recipe[];
  meals: Meal[];
  budgets: Budget[];
  
  // Shopping actions
  addShoppingItem: (item: Omit<ShoppingItem, 'id' | 'createdAt'>) => void;
  updateShoppingItem: (id: string, item: Partial<ShoppingItem>) => void;
  deleteShoppingItem: (id: string) => void;
  
  // Shopping template actions
  addShoppingTemplate: (template: Omit<ShoppingTemplate, 'id' | 'createdAt'>) => void;
  deleteShoppingTemplate: (id: string) => void;
  applyShoppingTemplate: (templateId: string) => void;
  
  // Task actions
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => string;
  updateTask: (id: string, task: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  
  // Appointment actions
  addAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void;
  updateAppointment: (id: string, appointment: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  
  // Family member actions
  addFamilyMember: (member: Omit<FamilyMember, 'id'>) => void;
  updateFamilyMember: (id: string, member: Partial<FamilyMember>) => void;
  deleteFamilyMember: (id: string) => void;
  
  // Recipe actions
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt'>) => void;
  updateRecipe: (id: string, recipe: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  
  // Meal actions
  addMeal: (meal: Omit<Meal, 'id' | 'createdAt'>) => void;
  updateMeal: (id: string, meal: Partial<Meal>) => void;
  deleteMeal: (id: string) => void;
  
  // Budget actions
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => void;
  updateBudget: (id: string, budget: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  addExpense: (budgetId: string, expense: Omit<Budget['expenses'][0], 'id'>) => void;
  deleteExpense: (budgetId: string, expenseId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [shoppingItems, setShoppingItems] = useStorage<ShoppingItem[]>('openfamily_shopping', []);
  const [shoppingTemplates, setShoppingTemplates] = useStorage<ShoppingTemplate[]>('openfamily_shopping_templates', []);
  const [tasks, setTasks] = useStorage<Task[]>('openfamily_tasks', []);
  const [appointments, setAppointments] = useStorage<Appointment[]>('openfamily_appointments', []);
  const [familyMembers, setFamilyMembers] = useStorage<FamilyMember[]>('openfamily_members', [
    { id: 'parent1', name: 'Parent 1', role: 'parent', color: '#6b8e7f' }
  ]);
  const [recipes, setRecipes] = useStorage<Recipe[]>('openfamily_recipes', []);
  const [meals, setMeals] = useStorage<Meal[]>('openfamily_meals', []);
  const [budgets, setBudgets] = useStorage<Budget[]>('openfamily_budgets', []);

  // Shopping actions
  const addShoppingItem = (item: Omit<ShoppingItem, 'id' | 'createdAt'>) => {
    const newItem: ShoppingItem = {
      ...item,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    setShoppingItems([...shoppingItems, newItem]);
  };

  const updateShoppingItem = (id: string, updates: Partial<ShoppingItem>) => {
    setShoppingItems(shoppingItems.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const deleteShoppingItem = (id: string) => {
    setShoppingItems(shoppingItems.filter(item => item.id !== id));
  };

  // Shopping template actions
  const addShoppingTemplate = (template: Omit<ShoppingTemplate, 'id' | 'createdAt'>) => {
    const newTemplate: ShoppingTemplate = {
      ...template,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    setShoppingTemplates([...shoppingTemplates, newTemplate]);
  };

  const deleteShoppingTemplate = (id: string) => {
    setShoppingTemplates(shoppingTemplates.filter(t => t.id !== id));
  };

  const applyShoppingTemplate = (templateId: string) => {
    const template = shoppingTemplates.find(t => t.id === templateId);
    if (!template) return;

    template.items.forEach(item => {
      addShoppingItem({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        price: 0,
        completed: false,
        notes: '',
      });
    });
  };

  // Task actions
  const addTask = (task: Omit<Task, 'id' | 'createdAt'>) => {
    const newTask: Task = {
      ...task,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    setTasks([...tasks, newTask]);
    return newTask.id;
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(tasks.map(task => {
      if (task.id === id) {
        const updatedTask = { ...task, ...updates };
        // Replanifier la notification si la date/heure change
        if (updatedTask.dueTime && (updates.dueDate || updates.dueTime)) {
          scheduleTaskNotification(updatedTask);
        }
        return updatedTask;
      }
      return task;
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  // Appointment actions
  const addAppointment = (appointment: Omit<Appointment, 'id' | 'createdAt'>) => {
    const newAppointment: Appointment = {
      ...appointment,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    setAppointments([...appointments, newAppointment]);
  };

  const updateAppointment = (id: string, updates: Partial<Appointment>) => {
    setAppointments(appointments.map(apt => apt.id === id ? { ...apt, ...updates } : apt));
  };

  const deleteAppointment = (id: string) => {
    setAppointments(appointments.filter(apt => apt.id !== id));
  };

  // Family member actions
  const addFamilyMember = (member: Omit<FamilyMember, 'id'>) => {
    const newMember: FamilyMember = {
      ...member,
      id: nanoid(),
    };
    setFamilyMembers([...familyMembers, newMember]);
  };

  const updateFamilyMember = (id: string, updates: Partial<FamilyMember>) => {
    setFamilyMembers(familyMembers.map(member => member.id === id ? { ...member, ...updates } : member));
  };

  const deleteFamilyMember = (id: string) => {
    setFamilyMembers(familyMembers.filter(member => member.id !== id));
  };

  // Recipe actions
  const addRecipe = (recipe: Omit<Recipe, 'id' | 'createdAt'>) => {
    const newRecipe: Recipe = {
      ...recipe,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    setRecipes([...recipes, newRecipe]);
  };

  const updateRecipe = (id: string, updates: Partial<Recipe>) => {
    setRecipes(recipes.map(recipe => recipe.id === id ? { ...recipe, ...updates } : recipe));
  };

  const deleteRecipe = (id: string) => {
    setRecipes(recipes.filter(recipe => recipe.id !== id));
  };

  // Meal actions
  const addMeal = (meal: Omit<Meal, 'id' | 'createdAt'>) => {
    const newMeal: Meal = {
      ...meal,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    setMeals([...meals, newMeal]);
  };

  const updateMeal = (id: string, updates: Partial<Meal>) => {
    setMeals(meals.map(meal => meal.id === id ? { ...meal, ...updates } : meal));
  };

  const deleteMeal = (id: string) => {
    setMeals(meals.filter(meal => meal.id !== id));
  };

  // Budget actions
  const addBudget = (budget: Omit<Budget, 'id' | 'createdAt'>) => {
    const newBudget: Budget = {
      ...budget,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    setBudgets([...budgets, newBudget]);
  };

  const updateBudget = (id: string, updates: Partial<Budget>) => {
    setBudgets(budgets.map(budget => budget.id === id ? { ...budget, ...updates } : budget));
  };

  const deleteBudget = (id: string) => {
    setBudgets(budgets.filter(budget => budget.id !== id));
  };

  const addExpense = (budgetId: string, expense: Omit<Budget['expenses'][0], 'id'>) => {
    const newExpense = {
      ...expense,
      id: nanoid(),
    };
    setBudgets(budgets.map(budget => 
      budget.id === budgetId 
        ? { ...budget, expenses: [...budget.expenses, newExpense] }
        : budget
    ));
  };

  const deleteExpense = (budgetId: string, expenseId: string) => {
    setBudgets(budgets.map(budget =>
      budget.id === budgetId
        ? { ...budget, expenses: budget.expenses.filter(exp => exp.id !== expenseId) }
        : budget
    ));
  };

  const value: AppContextType = {
    shoppingItems,
    shoppingTemplates,
    tasks,
    appointments,
    familyMembers,
    recipes,
    meals,
    budgets,
    addShoppingItem,
    updateShoppingItem,
    deleteShoppingItem,
    addShoppingTemplate,
    deleteShoppingTemplate,
    applyShoppingTemplate,
    addTask,
    updateTask,
    deleteTask,
    addAppointment,
    updateAppointment,
    deleteAppointment,
    addFamilyMember,
    updateFamilyMember,
    deleteFamilyMember,
    addRecipe,
    updateRecipe,
    deleteRecipe,
    addMeal,
    updateMeal,
    deleteMeal,
    addBudget,
    updateBudget,
    deleteBudget,
    addExpense,
    deleteExpense,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
