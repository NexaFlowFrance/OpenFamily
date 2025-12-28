import { nanoid } from 'nanoid';
import { IDataRepository } from './interface';
import { ShoppingItem, Task, Appointment, FamilyMember, Recipe, Meal, Budget } from '@/types';

/**
 * Implémentation du repository utilisant le localStorage
 * Maintient le comportement actuel de l'application
 */
export class LocalStorageRepository implements IDataRepository {
  private readonly KEYS = {
    shopping: 'openfamily_shopping',
    tasks: 'openfamily_tasks',
    appointments: 'openfamily_appointments',
    members: 'openfamily_members',
    recipes: 'openfamily_recipes',
    meals: 'openfamily_meals',
    budgets: 'openfamily_budgets',
  };

  // Helper methods
  private getFromStorage<T>(key: string): T[] {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  private saveToStorage<T>(key: string, data: T[]): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // Shopping Items
  async getShoppingItems(): Promise<ShoppingItem[]> {
    return this.getFromStorage<ShoppingItem>(this.KEYS.shopping);
  }

  async addShoppingItem(item: Omit<ShoppingItem, 'id' | 'createdAt'>): Promise<ShoppingItem> {
    const items = await this.getShoppingItems();
    const newItem: ShoppingItem = {
      ...item,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    items.push(newItem);
    this.saveToStorage(this.KEYS.shopping, items);
    return newItem;
  }

  async updateShoppingItem(id: string, updates: Partial<ShoppingItem>): Promise<ShoppingItem> {
    const items = await this.getShoppingItems();
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates };
      this.saveToStorage(this.KEYS.shopping, items);
      return items[index];
    }
    throw new Error(`Shopping item ${id} not found`);
  }

  async deleteShoppingItem(id: string): Promise<void> {
    const items = await this.getShoppingItems();
    const filtered = items.filter(item => item.id !== id);
    this.saveToStorage(this.KEYS.shopping, filtered);
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    return this.getFromStorage<Task>(this.KEYS.tasks);
  }

  async addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
    const tasks = await this.getTasks();
    const newTask: Task = {
      ...task,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    this.saveToStorage(this.KEYS.tasks, tasks);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(task => task.id === id);
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...updates };
      this.saveToStorage(this.KEYS.tasks, tasks);
      return tasks[index];
    }
    throw new Error(`Task ${id} not found`);
  }

  async deleteTask(id: string): Promise<void> {
    const tasks = await this.getTasks();
    const filtered = tasks.filter(task => task.id !== id);
    this.saveToStorage(this.KEYS.tasks, filtered);
  }

  // Appointments
  async getAppointments(): Promise<Appointment[]> {
    return this.getFromStorage<Appointment>(this.KEYS.appointments);
  }

  async addAppointment(appointment: Omit<Appointment, 'id' | 'createdAt'>): Promise<Appointment> {
    const appointments = await this.getAppointments();
    const newAppointment: Appointment = {
      ...appointment,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    appointments.push(newAppointment);
    this.saveToStorage(this.KEYS.appointments, appointments);
    return newAppointment;
  }

  async updateAppointment(id: string, updates: Partial<Appointment>): Promise<Appointment> {
    const appointments = await this.getAppointments();
    const index = appointments.findIndex(apt => apt.id === id);
    if (index !== -1) {
      appointments[index] = { ...appointments[index], ...updates };
      this.saveToStorage(this.KEYS.appointments, appointments);
      return appointments[index];
    }
    throw new Error(`Appointment ${id} not found`);
  }

  async deleteAppointment(id: string): Promise<void> {
    const appointments = await this.getAppointments();
    const filtered = appointments.filter(apt => apt.id !== id);
    this.saveToStorage(this.KEYS.appointments, filtered);
  }

  // Family Members
  async getFamilyMembers(): Promise<FamilyMember[]> {
    return this.getFromStorage<FamilyMember>(this.KEYS.members);
  }

  async addFamilyMember(member: Omit<FamilyMember, 'id'>): Promise<FamilyMember> {
    const members = await this.getFamilyMembers();
    const newMember: FamilyMember = {
      ...member,
      id: nanoid(),
    };
    members.push(newMember);
    this.saveToStorage(this.KEYS.members, members);
    return newMember;
  }

  async updateFamilyMember(id: string, updates: Partial<FamilyMember>): Promise<FamilyMember> {
    const members = await this.getFamilyMembers();
    const index = members.findIndex(member => member.id === id);
    if (index !== -1) {
      members[index] = { ...members[index], ...updates };
      this.saveToStorage(this.KEYS.members, members);
      return members[index];
    }
    throw new Error(`Family member ${id} not found`);
  }

  async deleteFamilyMember(id: string): Promise<void> {
    const members = await this.getFamilyMembers();
    const filtered = members.filter(member => member.id !== id);
    this.saveToStorage(this.KEYS.members, filtered);
  }

  // Recipes
  async getRecipes(): Promise<Recipe[]> {
    return this.getFromStorage<Recipe>(this.KEYS.recipes);
  }

  async addRecipe(recipe: Omit<Recipe, 'id' | 'createdAt'>): Promise<Recipe> {
    const recipes = await this.getRecipes();
    const newRecipe: Recipe = {
      ...recipe,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    recipes.push(newRecipe);
    this.saveToStorage(this.KEYS.recipes, recipes);
    return newRecipe;
  }

  async updateRecipe(id: string, updates: Partial<Recipe>): Promise<Recipe> {
    const recipes = await this.getRecipes();
    const index = recipes.findIndex(recipe => recipe.id === id);
    if (index !== -1) {
      recipes[index] = { ...recipes[index], ...updates };
      this.saveToStorage(this.KEYS.recipes, recipes);
      return recipes[index];
    }
    throw new Error(`Recipe ${id} not found`);
  }

  async deleteRecipe(id: string): Promise<void> {
    const recipes = await this.getRecipes();
    const filtered = recipes.filter(recipe => recipe.id !== id);
    this.saveToStorage(this.KEYS.recipes, filtered);
  }

  // Meals
  async getMeals(): Promise<Meal[]> {
    return this.getFromStorage<Meal>(this.KEYS.meals);
  }

  async addMeal(meal: Omit<Meal, 'id' | 'createdAt'>): Promise<Meal> {
    const meals = await this.getMeals();
    const newMeal: Meal = {
      ...meal,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    meals.push(newMeal);
    this.saveToStorage(this.KEYS.meals, meals);
    return newMeal;
  }

  async updateMeal(id: string, updates: Partial<Meal>): Promise<Meal> {
    const meals = await this.getMeals();
    const index = meals.findIndex(meal => meal.id === id);
    if (index !== -1) {
      meals[index] = { ...meals[index], ...updates };
      this.saveToStorage(this.KEYS.meals, meals);
      return meals[index];
    }
    throw new Error(`Meal ${id} not found`);
  }

  async deleteMeal(id: string): Promise<void> {
    const meals = await this.getMeals();
    const filtered = meals.filter(meal => meal.id !== id);
    this.saveToStorage(this.KEYS.meals, filtered);
  }

  // Budgets
  async getBudgets(): Promise<Budget[]> {
    return this.getFromStorage<Budget>(this.KEYS.budgets);
  }

  async addBudget(budget: Omit<Budget, 'id' | 'createdAt'>): Promise<Budget> {
    const budgets = await this.getBudgets();
    const newBudget: Budget = {
      ...budget,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    budgets.push(newBudget);
    this.saveToStorage(this.KEYS.budgets, budgets);
    return newBudget;
  }

  async updateBudget(id: string, updates: Partial<Budget>): Promise<Budget> {
    const budgets = await this.getBudgets();
    const index = budgets.findIndex(budget => budget.id === id);
    if (index !== -1) {
      budgets[index] = { ...budgets[index], ...updates };
      this.saveToStorage(this.KEYS.budgets, budgets);
      return budgets[index];
    }
    throw new Error(`Budget ${id} not found`);
  }

  async deleteBudget(id: string): Promise<void> {
    const budgets = await this.getBudgets();
    const filtered = budgets.filter(budget => budget.id !== id);
    this.saveToStorage(this.KEYS.budgets, filtered);
  }

  async addExpense(budgetId: string, expense: Omit<Budget['expenses'][0], 'id'>): Promise<void> {
    const budgets = await this.getBudgets();
    const budget = budgets.find(b => b.id === budgetId);
    if (budget) {
      const newExpense = {
        ...expense,
        id: nanoid(),
      };
      budget.expenses.push(newExpense);
      await this.updateBudget(budgetId, budget);
    }
  }

  async deleteExpense(budgetId: string, expenseId: string): Promise<void> {
    const budgets = await this.getBudgets();
    const budget = budgets.find(b => b.id === budgetId);
    if (budget) {
      budget.expenses = budget.expenses.filter(e => e.id !== expenseId);
      await this.updateBudget(budgetId, budget);
    }
  }

  // Backup & Import
  async exportData(): Promise<string> {
    const data = {
      shopping: await this.getShoppingItems(),
      tasks: await this.getTasks(),
      appointments: await this.getAppointments(),
      members: await this.getFamilyMembers(),
      recipes: await this.getRecipes(),
      meals: await this.getMeals(),
      budgets: await this.getBudgets(),
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData);
    if (data.shopping) this.saveToStorage(this.KEYS.shopping, data.shopping);
    if (data.tasks) this.saveToStorage(this.KEYS.tasks, data.tasks);
    if (data.appointments) this.saveToStorage(this.KEYS.appointments, data.appointments);
    if (data.members) this.saveToStorage(this.KEYS.members, data.members);
    if (data.recipes) this.saveToStorage(this.KEYS.recipes, data.recipes);
    if (data.meals) this.saveToStorage(this.KEYS.meals, data.meals);
    if (data.budgets) this.saveToStorage(this.KEYS.budgets, data.budgets);
  }

  async clearAllData(): Promise<void> {
    Object.values(this.KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }
}
