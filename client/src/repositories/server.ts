import { nanoid } from 'nanoid';
import { IDataRepository, ServerConfig } from './interface';
import { ShoppingItem, Task, Appointment, FamilyMember, Recipe, Meal, Budget } from '@/types';
import { logger } from '../lib/logger';

/**
 * Implémentation du repository utilisant un serveur auto-hébergé
 * Communique avec une API REST
 */
export class ServerRepository implements IDataRepository {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(config: ServerConfig) {
    this.baseUrl = config.apiUrl.replace(/\/$/, ''); // Enlever le / final
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.authToken || 'default-token'}`,
      'X-Family-Id': config.familyId || 'family-default',
    };
    logger.log('📡 ServerRepository initialized:', { baseUrl: this.baseUrl, headers: this.headers });
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    logger.log('📤 CLIENT REQUEST:', {
      method: options?.method || 'GET',
      url,
      headers: this.headers,
      body: options?.body ? JSON.parse(options.body as string) : null
    });

    const response = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    });

    logger.log('📥 CLIENT RESPONSE:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('🔴 CLIENT ERROR RESPONSE:', errorText);
      throw new Error(`API Error: ${response.statusText}`);
    }

    // Gérer les réponses 204 (No Content) qui n'ont pas de JSON
    if (response.status === 204) {
      logger.log('✅ CLIENT SUCCESS: No Content (204)');
      return null as T;
    }

    const data = await response.json();
    logger.log('✅ CLIENT SUCCESS DATA:', data);
    return data;
  }

  // Shopping Items
  async getShoppingItems(): Promise<ShoppingItem[]> {
    return this.request<ShoppingItem[]>('/shopping-items');
  }

  async addShoppingItem(item: Omit<ShoppingItem, 'id' | 'createdAt'>): Promise<ShoppingItem> {
    return this.request<ShoppingItem>('/shopping-items', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateShoppingItem(id: string, updates: Partial<ShoppingItem>): Promise<ShoppingItem> {
    return this.request<ShoppingItem>(`/shopping-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteShoppingItem(id: string): Promise<void> {
    await this.request(`/shopping-items/${id}`, { method: 'DELETE' });
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    logger.log('🔍 ServerRepository.getTasks() called');
    const result = await this.request<Task[]>('/tasks');
    logger.log('🔍 ServerRepository.getTasks() result:', result);
    return result;
  }

  async addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
    return this.request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    return this.request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteTask(id: string): Promise<void> {
    await this.request(`/tasks/${id}`, { method: 'DELETE' });
  }

  // Appointments
  async getAppointments(): Promise<Appointment[]> {
    return this.request<Appointment[]>('/appointments');
  }

  async addAppointment(appointment: Omit<Appointment, 'id' | 'createdAt'>): Promise<Appointment> {
    return this.request<Appointment>('/appointments', {
      method: 'POST',
      body: JSON.stringify(appointment),
    });
  }

  async updateAppointment(id: string, updates: Partial<Appointment>): Promise<Appointment> {
    return this.request<Appointment>(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteAppointment(id: string): Promise<void> {
    await this.request(`/appointments/${id}`, { method: 'DELETE' });
  }

  // Family Members
  async getFamilyMembers(): Promise<FamilyMember[]> {
    return this.request<FamilyMember[]>('/members');
  }

  async addFamilyMember(member: Omit<FamilyMember, 'id'>): Promise<FamilyMember> {
    return this.request<FamilyMember>('/members', {
      method: 'POST',
      body: JSON.stringify(member),
    });
  }

  async updateFamilyMember(id: string, updates: Partial<FamilyMember>): Promise<FamilyMember> {
    return this.request<FamilyMember>(`/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteFamilyMember(id: string): Promise<void> {
    await this.request(`/members/${id}`, { method: 'DELETE' });
  }

  // Recipes
  async getRecipes(): Promise<Recipe[]> {
    return this.request<Recipe[]>('/recipes');
  }

  async addRecipe(recipe: Omit<Recipe, 'id' | 'createdAt'>): Promise<Recipe> {
    return this.request<Recipe>('/recipes', {
      method: 'POST',
      body: JSON.stringify(recipe),
    });
  }

  async updateRecipe(id: string, updates: Partial<Recipe>): Promise<Recipe> {
    return this.request<Recipe>(`/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteRecipe(id: string): Promise<void> {
    await this.request(`/recipes/${id}`, { method: 'DELETE' });
  }

  // Meals
  async getMeals(): Promise<Meal[]> {
    return this.request<Meal[]>('/meals');
  }

  async addMeal(meal: Omit<Meal, 'id' | 'createdAt'>): Promise<Meal> {
    return this.request<Meal>('/meals', {
      method: 'POST',
      body: JSON.stringify(meal),
    });
  }

  async updateMeal(id: string, updates: Partial<Meal>): Promise<Meal> {
    return this.request<Meal>(`/meals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteMeal(id: string): Promise<void> {
    await this.request(`/meals/${id}`, { method: 'DELETE' });
  }

  // Budgets
  async getBudgets(): Promise<Budget[]> {
    return this.request<Budget[]>('/budgets');
  }

  async addBudget(budget: Omit<Budget, 'id' | 'createdAt'>): Promise<Budget> {
    return this.request<Budget>('/budgets', {
      method: 'POST',
      body: JSON.stringify(budget),
    });
  }

  async updateBudget(id: string, updates: Partial<Budget>): Promise<Budget> {
    return this.request<Budget>(`/budgets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteBudget(id: string): Promise<void> {
    await this.request(`/budgets/${id}`, { method: 'DELETE' });
  }

  async addExpense(budgetId: string, expense: Omit<Budget['expenses'][0], 'id'>): Promise<void> {
    await this.request(`/budgets/${budgetId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  }

  async deleteExpense(budgetId: string, expenseId: string): Promise<void> {
    await this.request(`/budgets/${budgetId}/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  }

  // Backup & Import
  async exportData(): Promise<string> {
    const data = await this.request<any>('/export');
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData);
    await this.request('/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async clearAllData(): Promise<void> {
    await this.request('/clear', { method: 'POST' });
  }
}
