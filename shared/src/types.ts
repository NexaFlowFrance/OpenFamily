import type {
    ShoppingCategory,
    RecipeCategory,
    BudgetCategory,
    MealType,
    TaskFrequency,
    RecipeDifficulty,
    TaskPriority,
    BloodType,
} from './constants';

// Base Entity
export interface BaseEntity {
    id: string;
    created_at: Date;
    updated_at: Date;
}

// User
export interface User extends BaseEntity {
    email: string;
    password_hash: string;
    name: string;
}

// Family Member
export interface FamilyMember extends BaseEntity {
    user_id: string;
    name: string;
    birth_date?: Date;
    color: string;
    blood_type?: BloodType;
    allergies?: string;
    vaccines?: string;
    emergency_contact?: string;
    medical_notes?: string;
    avatar_url?: string;
}

// Shopping Item
export interface ShoppingItem extends BaseEntity {
    user_id: string;
    name: string;
    category: ShoppingCategory;
    quantity?: number;
    unit?: string;
    price?: number;
    is_checked: boolean;
    notes?: string;
}

// Shopping List Template
export interface ShoppingListTemplate extends BaseEntity {
    user_id: string;
    name: string;
    items: Array<{
        name: string;
        category: ShoppingCategory;
        quantity?: number;
        unit?: string;
    }>;
}

// Task
export interface Task extends BaseEntity {
    user_id: string;
    title: string;
    description?: string;
    is_completed: boolean;
    due_date?: Date;
    frequency?: TaskFrequency;
    priority?: TaskPriority;
    assigned_to?: string; // family_member_id
    completed_at?: Date;
}

// Appointment
export interface Appointment extends BaseEntity {
    user_id: string;
    title: string;
    description?: string;
    start_time: Date;
    end_time?: Date;
    location?: string;
    family_member_id?: string;
    reminder_30min: boolean;
    reminder_1hour: boolean;
    notes?: string;
}

// Recipe
export interface Recipe extends BaseEntity {
    user_id: string;
    name: string;
    category: RecipeCategory;
    description?: string;
    ingredients: string[];
    instructions: string[];
    prep_time?: number; // minutes
    cook_time?: number; // minutes
    servings?: number;
    difficulty?: RecipeDifficulty;
    tags?: string[];
    image_url?: string;
}

// Meal Plan
export interface MealPlan extends BaseEntity {
    user_id: string;
    date: Date;
    meal_type: MealType;
    recipe_id?: string;
    custom_meal?: string;
    notes?: string;
}

// Budget Entry
export interface BudgetEntry extends BaseEntity {
    user_id: string;
    category: BudgetCategory;
    amount: number;
    description?: string;
    date: Date;
    is_expense: boolean; // true for expense, false for income
}

// Budget Limit
export interface BudgetLimit extends BaseEntity {
    user_id: string;
    category: BudgetCategory;
    monthly_limit: number;
    month: number; // 1-12
    year: number;
}

// Notification
export interface Notification extends BaseEntity {
    user_id: string;
    title: string;
    message: string;
    type: 'appointment' | 'task' | 'budget' | 'general';
    is_read: boolean;
    related_id?: string; // ID of related entity
}

// API Response Types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// Statistics Types
export interface TaskStatistics {
    total: number;
    completed: number;
    pending: number;
    completionRate: number;
    byPriority: Record<TaskPriority, number>;
    byFrequency: Record<TaskFrequency, number>;
}

export interface BudgetStatistics {
    totalExpenses: number;
    totalIncome: number;
    balance: number;
    byCategory: Record<BudgetCategory, number>;
    monthlyTrend: Array<{
        month: string;
        expenses: number;
        income: number;
    }>;
}

export interface DashboardStats {
    upcomingAppointments: number;
    pendingTasks: number;
    shoppingItems: number;
    thisMonthExpenses: number;
    budgetAlerts: number;
}
