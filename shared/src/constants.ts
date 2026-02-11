// Shopping List Categories
export const SHOPPING_CATEGORIES = {
    BABY: 'Bébé',
    FOOD: 'Alimentation',
    HOUSEHOLD: 'Ménage',
    HEALTH: 'Santé',
    OTHER: 'Autre',
} as const;

export type ShoppingCategory = typeof SHOPPING_CATEGORIES[keyof typeof SHOPPING_CATEGORIES];

// Recipe Categories
export const RECIPE_CATEGORIES = {
    STARTER: 'Entrée',
    MAIN: 'Plat',
    DESSERT: 'Dessert',
    SNACK: 'Snack',
} as const;

export type RecipeCategory = typeof RECIPE_CATEGORIES[keyof typeof RECIPE_CATEGORIES];

// Budget Categories
export const BUDGET_CATEGORIES = {
    FOOD: 'Alimentation',
    HEALTH: 'Santé',
    CHILDREN: 'Enfants',
    HOUSE: 'Maison',
    LEISURE: 'Loisirs',
    OTHER: 'Autre',
} as const;

export type BudgetCategory = typeof BUDGET_CATEGORIES[keyof typeof BUDGET_CATEGORIES];

// Meal Types
export const MEAL_TYPES = {
    BREAKFAST: 'Petit-déjeuner',
    LUNCH: 'Déjeuner',
    DINNER: 'Dîner',
    SNACK: 'Snack',
} as const;

export type MealType = typeof MEAL_TYPES[keyof typeof MEAL_TYPES];

// Task Frequencies
export const TASK_FREQUENCIES = {
    DAILY: 'Quotidien',
    WEEKLY: 'Hebdomadaire',
    MONTHLY: 'Mensuel',
    YEARLY: 'Annuel',
    ONCE: 'Une fois',
} as const;

export type TaskFrequency = typeof TASK_FREQUENCIES[keyof typeof TASK_FREQUENCIES];

// Days of Week
export const DAYS_OF_WEEK = {
    MONDAY: 'Lundi',
    TUESDAY: 'Mardi',
    WEDNESDAY: 'Mercredi',
    THURSDAY: 'Jeudi',
    FRIDAY: 'Vendredi',
    SATURDAY: 'Samedi',
    SUNDAY: 'Dimanche',
} as const;

export type DayOfWeek = typeof DAYS_OF_WEEK[keyof typeof DAYS_OF_WEEK];

// Recipe Difficulty
export const RECIPE_DIFFICULTY = {
    EASY: 'Facile',
    MEDIUM: 'Moyen',
    HARD: 'Difficile',
} as const;

export type RecipeDifficulty = typeof RECIPE_DIFFICULTY[keyof typeof RECIPE_DIFFICULTY];

// Task Priority
export const TASK_PRIORITY = {
    LOW: 'Basse',
    MEDIUM: 'Moyenne',
    HIGH: 'Haute',
} as const;

export type TaskPriority = typeof TASK_PRIORITY[keyof typeof TASK_PRIORITY];

// Blood Types
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export type BloodType = typeof BLOOD_TYPES[number];
