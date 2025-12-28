import { ShoppingItem, Task, Appointment, FamilyMember, Recipe, Meal, Budget } from '@/types';

/**
 * Interface commune pour le stockage des données
 * Permet de supporter différents backends (localStorage, serveur, etc.)
 */
export interface IDataRepository {
  // Shopping Items
  getShoppingItems(): Promise<ShoppingItem[]>;
  addShoppingItem(item: Omit<ShoppingItem, 'id' | 'createdAt'>): Promise<ShoppingItem>;
  updateShoppingItem(id: string, item: Partial<ShoppingItem>): Promise<ShoppingItem>;
  deleteShoppingItem(id: string): Promise<void>;

  // Tasks
  getTasks(): Promise<Task[]>;
  addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task>;
  updateTask(id: string, task: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Appointments
  getAppointments(): Promise<Appointment[]>;
  addAppointment(appointment: Omit<Appointment, 'id' | 'createdAt'>): Promise<Appointment>;
  updateAppointment(id: string, appointment: Partial<Appointment>): Promise<Appointment>;
  deleteAppointment(id: string): Promise<void>;

  // Family Members
  getFamilyMembers(): Promise<FamilyMember[]>;
  addFamilyMember(member: Omit<FamilyMember, 'id'>): Promise<FamilyMember>;
  updateFamilyMember(id: string, member: Partial<FamilyMember>): Promise<FamilyMember>;
  deleteFamilyMember(id: string): Promise<void>;

  // Recipes
  getRecipes(): Promise<Recipe[]>;
  addRecipe(recipe: Omit<Recipe, 'id' | 'createdAt'>): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<Recipe>): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;

  // Meals
  getMeals(): Promise<Meal[]>;
  addMeal(meal: Omit<Meal, 'id' | 'createdAt'>): Promise<Meal>;
  updateMeal(id: string, meal: Partial<Meal>): Promise<Meal>;
  deleteMeal(id: string): Promise<void>;

  // Budgets
  getBudgets(): Promise<Budget[]>;
  addBudget(budget: Omit<Budget, 'id' | 'createdAt'>): Promise<Budget>;
  updateBudget(id: string, budget: Partial<Budget>): Promise<Budget>;
  deleteBudget(id: string): Promise<void>;
  addExpense(budgetId: string, expense: Omit<Budget['expenses'][0], 'id'>): Promise<void>;
  deleteExpense(budgetId: string, expenseId: string): Promise<void>;

  // Sync & Backup
  exportData(): Promise<string>;
  importData(data: string): Promise<void>;
  clearAllData(): Promise<void>;
}

export type StorageMode = 'local' | 'server';

export interface ServerConfig {
  apiUrl: string;
  authToken?: string;
  familyId?: string;
}
