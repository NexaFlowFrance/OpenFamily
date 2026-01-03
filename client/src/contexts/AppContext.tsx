import React, { createContext, useContext, useState, useEffect } from 'react';
import { ShoppingItem, ShoppingTemplate, Task, Appointment, FamilyMember, Recipe, Meal, Budget } from '@/types';
import { nanoid } from 'nanoid';
import { scheduleTaskNotification } from '@/lib/notifications';
import { RepositoryFactory } from '@/repositories/factory';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { logger } from '../lib/logger';

interface AppContextType {
  shoppingItems: ShoppingItem[];
  shoppingTemplates: ShoppingTemplate[];
  tasks: Task[];
  appointments: Appointment[];
  familyMembers: FamilyMember[];
  recipes: Recipe[];
  meals: Meal[];
  budgets: Budget[];
  loading: boolean;
  isInitialized: boolean;
  reloadData: () => Promise<void>;
  
  // Shopping actions
  addShoppingItem: (item: Omit<ShoppingItem, 'id' | 'createdAt'>) => Promise<void>;
  updateShoppingItem: (id: string, item: Partial<ShoppingItem>) => Promise<void>;
  deleteShoppingItem: (id: string) => Promise<void>;
  
  // Shopping template actions
  addShoppingTemplate: (template: Omit<ShoppingTemplate, 'id' | 'createdAt'>) => void;
  deleteShoppingTemplate: (id: string) => void;
  applyShoppingTemplate: (templateId: string) => void;
  
  // Task actions
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<string>;
  updateTask: (id: string, task: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  
  // Appointment actions
  addAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => Promise<void>;
  updateAppointment: (id: string, appointment: Partial<Appointment>) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  
  // Family member actions
  addFamilyMember: (member: Omit<FamilyMember, 'id'>) => Promise<void>;
  updateFamilyMember: (id: string, member: Partial<FamilyMember>) => Promise<void>;
  deleteFamilyMember: (id: string) => Promise<void>;
  
  // Recipe actions
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt'>) => Promise<void>;
  updateRecipe: (id: string, recipe: Partial<Recipe>) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  
  // Meal actions
  addMeal: (meal: Omit<Meal, 'id' | 'createdAt'>) => Promise<void>;
  updateMeal: (id: string, meal: Partial<Meal>) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  
  // Budget actions
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => Promise<void>;
  updateBudget: (id: string, budget: Partial<Budget>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  addExpense: (budgetId: string, expense: Omit<Budget['expenses'][0], 'id'>) => Promise<void>;
  deleteExpense: (budgetId: string, expenseId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // État d'initialisation pour éviter les problèmes en production
  const [isInitialized, setIsInitialized] = useState(false);
  
  // États locaux
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [shoppingTemplates, setShoppingTemplates] = useState<ShoppingTemplate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([
    { id: 'parent1', name: 'Parent 1', role: 'parent', color: '#6b8e7f' }
  ]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  // Fonction pour recharger toutes les données (utilisée par le WebSocket et le refresh manuel)
  const reloadData = async () => {
    try {
      logger.log('🔄 Reloading data...');
      const repo = RepositoryFactory.getRepository();
      
      const results = await Promise.allSettled([
        repo.getShoppingItems(),
        repo.getTasks(),
        repo.getAppointments(),
        repo.getFamilyMembers(),
        repo.getRecipes(),
        repo.getMeals(),
        repo.getBudgets()
      ]);

      const loadedShopping = results[0].status === 'fulfilled' ? results[0].value : [];
      const loadedTasks = results[1].status === 'fulfilled' ? results[1].value : [];
      const loadedAppointments = results[2].status === 'fulfilled' ? results[2].value : [];
      const loadedMembers = results[3].status === 'fulfilled' ? results[3].value : [];
      const loadedRecipes = results[4].status === 'fulfilled' ? results[4].value : [];
      const loadedMeals = results[5].status === 'fulfilled' ? results[5].value : [];
      const loadedBudgets = results[6].status === 'fulfilled' ? results[6].value : [];

      setShoppingItems(loadedShopping);
      setTasks(loadedTasks);
      setAppointments(loadedAppointments);
      setFamilyMembers(loadedMembers.length > 0 ? loadedMembers : [
        { id: 'parent1', name: 'Parent 1', role: 'parent', color: '#6b8e7f' }
      ]);
      setRecipes(loadedRecipes);
      setMeals(loadedMeals);
      setBudgets(loadedBudgets);
      logger.log('✅ Data reloaded successfully');
    } catch (error) {
      logger.error('❌ Error reloading data:', error);
    }
  };

  // Charger toutes les données au démarrage
  useEffect(() => {
    logger.log('🚀 AppContext useEffect - Starting to load data');
    const loadData = async () => {
      try {
        await reloadData();
      } catch (error) {
        logger.error('Erreur lors du chargement des données:', error);
      } finally {
        setLoading(false);
        setIsInitialized(true); // Marquer comme initialisé
      }
    };

    loadData();
  }, []);

  // Shopping actions
  const addShoppingItem = async (item: Omit<ShoppingItem, 'id' | 'createdAt'>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const newItem = await repo.addShoppingItem(item);
      setShoppingItems([...shoppingItems, newItem]);
    } catch (error) {
      logger.error('Erreur lors de l\'ajout d\'un article:', error);
    }
  };

  const updateShoppingItem = async (id: string, updates: Partial<ShoppingItem>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const updated = await repo.updateShoppingItem(id, updates);
      setShoppingItems(shoppingItems.map(item => item.id === id ? updated : item));
    } catch (error) {
      logger.error('Erreur lors de la mise à jour d\'un article:', error);
    }
  };

  const deleteShoppingItem = async (id: string) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.deleteShoppingItem(id);
      setShoppingItems(shoppingItems.filter(item => item.id !== id));
    } catch (error) {
      logger.error('Erreur lors de la suppression d\'un article:', error);
    }
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
  const addTask = async (task: Omit<Task, 'id' | 'createdAt'>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const newTask = await repo.addTask(task);
      setTasks([...tasks, newTask]);
      
      // Planifier la notification si nécessaire
      if (newTask.dueTime) {
        scheduleTaskNotification(newTask);
      }
      return newTask.id;
    } catch (error) {
      logger.error('Erreur lors de l\'ajout d\'une tâche:', error);
      return '';
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const updated = await repo.updateTask(id, updates);
      setTasks(tasks.map(task => task.id === id ? updated : task));
      
      // Replanifier la notification si la date/heure change
      if (updated.dueTime && (updates.dueDate || updates.dueTime)) {
        scheduleTaskNotification(updated);
      }
    } catch (error) {
      logger.error('Erreur lors de la mise à jour d\'une tâche:', error);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.deleteTask(id);
      setTasks(tasks.filter(task => task.id !== id));
    } catch (error) {
      logger.error('Erreur lors de la suppression d\'une tâche:', error);
    }
  };

  // Appointment actions
  const addAppointment = async (appointment: Omit<Appointment, 'id' | 'createdAt'>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const newAppointment = await repo.addAppointment(appointment);
      setAppointments([...appointments, newAppointment]);
    } catch (error) {
      logger.error('Erreur lors de l\'ajout d\'un rendez-vous:', error);
    }
  };

  const updateAppointment = async (id: string, updates: Partial<Appointment>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const updated = await repo.updateAppointment(id, updates);
      setAppointments(appointments.map(apt => apt.id === id ? updated : apt));
    } catch (error) {
      logger.error('Erreur lors de la mise à jour d\'un rendez-vous:', error);
    }
  };

  const deleteAppointment = async (id: string) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.deleteAppointment(id);
      setAppointments(appointments.filter(apt => apt.id !== id));
    } catch (error) {
      // Si le rendez-vous n'existe pas côté serveur, on le supprime quand même côté client
      if (error instanceof Error && error.message.includes('Not Found')) {
        logger.warn('Rendez-vous introuvable côté serveur, suppression côté client uniquement');
        setAppointments(appointments.filter(apt => apt.id !== id));
      } else {
        logger.error('Erreur lors de la suppression d\'un rendez-vous:', error);
        throw error; // Re-lancer l'erreur si ce n'est pas un problème de "Not Found"
      }
    }
  };

  // Family member actions
  const addFamilyMember = async (member: Omit<FamilyMember, 'id'>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const newMember = await repo.addFamilyMember(member);
      setFamilyMembers([...familyMembers, newMember]);
    } catch (error) {
      logger.error('Erreur lors de l\'ajout d\'un membre:', error);
    }
  };

  const updateFamilyMember = async (id: string, updates: Partial<FamilyMember>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const updated = await repo.updateFamilyMember(id, updates);
      setFamilyMembers(familyMembers.map(member => member.id === id ? updated : member));
    } catch (error) {
      logger.error('Erreur lors de la mise à jour d\'un membre:', error);
    }
  };

  const deleteFamilyMember = async (id: string) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.deleteFamilyMember(id);
      setFamilyMembers(familyMembers.filter(member => member.id !== id));
    } catch (error) {
      logger.error('Erreur lors de la suppression d\'un membre:', error);
    }
  };

  // Recipe actions
  const addRecipe = async (recipe: Omit<Recipe, 'id' | 'createdAt'>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const newRecipe = await repo.addRecipe(recipe);
      setRecipes([...recipes, newRecipe]);
    } catch (error) {
      logger.error('Erreur lors de l\'ajout d\'une recette:', error);
    }
  };

  const updateRecipe = async (id: string, updates: Partial<Recipe>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const updated = await repo.updateRecipe(id, updates);
      setRecipes(recipes.map(recipe => recipe.id === id ? updated : recipe));
    } catch (error) {
      logger.error('Erreur lors de la mise à jour d\'une recette:', error);
    }
  };

  const deleteRecipe = async (id: string) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.deleteRecipe(id);
      setRecipes(recipes.filter(recipe => recipe.id !== id));
    } catch (error) {
      logger.error('Erreur lors de la suppression d\'une recette:', error);
    }
  };

  // Meal actions
  const addMeal = async (meal: Omit<Meal, 'id' | 'createdAt'>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const newMeal = await repo.addMeal(meal);
      setMeals([...meals, newMeal]);
    } catch (error) {
      logger.error('Erreur lors de l\'ajout d\'un repas:', error);
    }
  };

  const updateMeal = async (id: string, updates: Partial<Meal>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const updated = await repo.updateMeal(id, updates);
      setMeals(meals.map(meal => meal.id === id ? updated : meal));
    } catch (error) {
      logger.error('Erreur lors de la mise à jour d\'un repas:', error);
    }
  };

  const deleteMeal = async (id: string) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.deleteMeal(id);
      setMeals(meals.filter(meal => meal.id !== id));
    } catch (error) {
      logger.error('Erreur lors de la suppression d\'un repas:', error);
    }
  };

  // Budget actions
  const addBudget = async (budget: Omit<Budget, 'id' | 'createdAt'>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const newBudget = await repo.addBudget(budget);
      setBudgets([...budgets, newBudget]);
    } catch (error) {
      logger.error('Erreur lors de l\'ajout d\'un budget:', error);
    }
  };

  const updateBudget = async (id: string, updates: Partial<Budget>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      const updated = await repo.updateBudget(id, updates);
      setBudgets(budgets.map(budget => budget.id === id ? updated : budget));
    } catch (error) {
      logger.error('Erreur lors de la mise à jour d\'un budget:', error);
    }
  };

  const deleteBudget = async (id: string) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.deleteBudget(id);
      setBudgets(budgets.filter(budget => budget.id !== id));
    } catch (error) {
      logger.error('Erreur lors de la suppression d\'un budget:', error);
    }
  };

  const addExpense = async (budgetId: string, expense: Omit<Budget['expenses'][0], 'id'>) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.addExpense(budgetId, expense);
      const refreshed = await repo.getBudgets();
      setBudgets(refreshed);
    } catch (error) {
      logger.error('Erreur lors de l\'ajout d\'une dépense:', error);
    }
  };

  const deleteExpense = async (budgetId: string, expenseId: string) => {
    try {
      const repo = RepositoryFactory.getRepository();
      await repo.deleteExpense(budgetId, expenseId);
      const refreshed = await repo.getBudgets();
      setBudgets(refreshed);
    } catch (error) {
      logger.error('Erreur lors de la suppression d\'une dépense:', error);
    }
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
    loading,
    isInitialized,
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
    reloadData,
  };

  // Activer la synchronisation en temps réel via WebSocket
  const familyId = 'family-default'; // TODO: Récupérer depuis la configuration utilisateur
  useRealtimeSync(familyId, reloadData, true);

  return (
    <AppContext.Provider value={value}>
      {!isInitialized || loading ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        children
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    logger.error('❌ useApp hook called outside AppProvider. Component tree:', 
      new Error().stack?.split('\n').slice(0, 5).join('\n'));
    throw new Error('useApp must be used within AppProvider. Make sure the component using this hook is wrapped inside <AppProvider>.');
  }
  return context;
}

