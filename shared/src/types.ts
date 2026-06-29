import type {
    ShoppingCategory,
    RecipeCategory,
    BudgetCategory,
    MealType,
    TaskFrequency,
    RecipeDifficulty,
    TaskPriority,
    BloodType,
    GardenZoneType,
    GardenLocation,
    GardenSunExposure,
    GardenPlantType,
    GardenHealthStatus,
    GardenCareType,
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
    currency?: string | null;
    // NULL/undefined = this account owns its own family. Set = member of the
    // referenced owner's family (data scoped to the owner).
    family_owner_id?: string | null;
    // Forces a password change on first login (member temp passwords).
    must_change_password?: boolean;
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
    dietary_preferences?: DietaryPreferences;
    // Login account backing this member card (set once an account is created).
    account_user_id?: string | null;
    // Email the owner entered to give this member an account.
    email?: string | null;
}

// Dietary preferences — consumed by the AI recipe generator and (future)
// smart meal planning. Persisted as jsonb on family_members; every key is
// optional so the form can grow without breaking older rows.
export type DietaryRegime = 'omnivore' | 'vegetarian' | 'vegan' | 'halal' | 'kosher' | 'no_pork';

export type SpiceLevel = 'none' | 'mild' | 'medium' | 'hot';

export interface DietaryPreferences {
    regime?: DietaryRegime;
    dislikes?: string[];
    favorites?: string[];
    spice_level?: SpiceLevel;
    notes?: string;
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
    assigned_to?: string[]; // array of family_member_id
    assigned_to_members?: Array<{ id: string; name: string; color: string }>;
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
    family_member_ids?: string[]; // array of family_member_id
    family_members_data?: Array<{ id: string; name: string; color: string }>;
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

// Vacation
export type VacationStatus = 'planning' | 'upcoming' | 'ongoing' | 'past' | 'cancelled';
export type VacationAccommodationType =
    | 'airbnb'
    | 'chalet'
    | 'hotel'
    | 'camping'
    | 'family'
    | 'other';
export type LuggageCategory =
    | 'clothing'
    | 'toiletries'
    | 'documents'
    | 'health'
    | 'electronics'
    | 'kids'
    | 'misc';
export type ItineraryMeal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface ItineraryActivity {
    id: string;
    title: string;
    time?: string;
    duration_min?: number;
    cost?: number;
    location?: string;
    notes?: string;
}

export interface ItineraryMealSuggestion {
    meal: ItineraryMeal;
    suggestion: string;
    restaurant?: string;
    cost?: number;
}

export interface VacationItineraryDay extends BaseEntity {
    vacation_id: string;
    day_number: number;
    date: Date;
    theme?: string;
    activities: ItineraryActivity[];
    meals_suggestions: ItineraryMealSuggestion[];
    estimated_cost?: number;
    transport_notes?: string;
    notes?: string;
}

export interface VacationLuggageItem extends BaseEntity {
    vacation_id: string;
    family_member_id?: string | null;
    family_member_name?: string;
    family_member_color?: string;
    category: LuggageCategory;
    item: string;
    quantity: number;
    packed: boolean;
    notes?: string;
}

export interface VacationParticipant {
    id: string;
    name: string;
    color: string;
}

export interface Vacation extends BaseEntity {
    user_id: string;
    title: string;
    destination: string;
    country?: string;
    start_date: Date;
    end_date: Date;
    status: VacationStatus;
    accommodation_type?: VacationAccommodationType;
    accommodation_name?: string;
    accommodation_url?: string;
    accommodation_address?: string;
    accommodation_contact?: string;
    budget_planned?: number;
    actual_cost?: number;
    objectives: string[];
    notes?: string;
    rating?: number;
    review_text?: string;
    participants?: VacationParticipant[];
    itinerary?: VacationItineraryDay[];
    luggage?: VacationLuggageItem[];
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

// Garden & Lawn Types
export interface GardenZone extends BaseEntity {
    user_id: string;
    name: string;
    zone_type: GardenZoneType;
    location?: GardenLocation | null;
    area_m2?: number | null;
    sun_exposure?: GardenSunExposure | null;
    soil_type?: string | null;
    notes?: string | null;
}

export interface GardenPlant extends BaseEntity {
    user_id: string;
    zone_id?: string | null;
    name: string;
    plant_type: GardenPlantType;
    variety?: string | null;
    planted_date?: string | null;
    watering_frequency_days?: number | null;
    health_status: GardenHealthStatus;
    photo_url?: string | null;
    notes?: string | null;
}

export interface GardenCare extends BaseEntity {
    user_id: string;
    zone_id?: string | null;
    plant_id?: string | null;
    care_type: GardenCareType;
    title: string;
    planned_date?: string | null;
    performed_date?: string | null;
    cost?: number | null;
    recurrence_days?: number | null;
    notes?: string | null;
}

export interface GardenObservation extends BaseEntity {
    user_id: string;
    zone_id?: string | null;
    plant_id?: string | null;
    observed_at: string;
    health_status?: GardenHealthStatus | null;
    height_cm?: number | null;
    notes?: string | null;
    photo_url?: string | null;
}
