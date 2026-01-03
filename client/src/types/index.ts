export interface ShoppingItem {
  id: string;
  name: string;
  category: string; // Permettre les catégories personnalisées
  quantity: number;
  price: number;
  completed: boolean;
  createdAt: string;
  notes?: string;
}

export interface ShoppingTemplate {
  id: string;
  name: string;
  items: Array<{
    name: string;
    category: 'baby' | 'food' | 'household' | 'health' | 'other';
    quantity: number;
  }>;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: 'household' | 'baby' | 'personal' | 'other';
  assignedTo?: string;
  dueDate: string;
  dueTime?: string; // Heure de la tâche (HH:mm)
  duration?: number; // Durée en minutes
  status?: 'todo' | 'in-progress' | 'done';
  completed: boolean;
  completedDates?: string[]; // Pour les tâches récurrentes: liste des dates (YYYY-MM-DD) où l'occurrence a été complétée
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    endDate?: string;
    // Pour récurrence mensuelle : garder le même jour du mois (ex: 12 de chaque mois)
    dayOfMonth?: number; // 1-31
    // Pour récurrence hebdomadaire : garder le même jour de la semaine (ex: tous les samedis)
    dayOfWeek?: number; // 0=dimanche, 1=lundi, ..., 6=samedi
  };
  createdAt: string;
  priority: 'low' | 'medium' | 'high';
}

export interface Appointment {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  duration?: number;
  location?: string;
  type: 'doctor' | 'school' | 'work' | 'personal' | 'other';
  attendees?: string[];
  notes?: string;
  reminder?: 'none' | '15min' | '30min' | '1hour' | '1day';
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    endDate?: string;
    // Pour récurrence mensuelle : garder le même jour du mois (ex: 12 de chaque mois)
    dayOfMonth?: number; // 1-31
    // Pour récurrence hebdomadaire : garder le même jour de la semaine (ex: tous les samedis)
    dayOfWeek?: number; // 0=dimanche, 1=lundi, ..., 6=samedi
  };
  createdAt: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: 'parent' | 'child' | 'other';
  color?: string;
  birthdate?: string;
  allergies?: string[];
  medicalNotes?: string;
  bloodType?: string;
  vaccines?: {
    name: string;
    date: string;
    nextDue?: string;
  }[];
  emergencyContact?: {
    name: string;
    phone: string;
    relation: string;
  };
  workSchedule?: WorkSchedule;
}

export interface WorkSchedule {
  // Jours de travail réguliers (0=dimanche, 1=lundi, ..., 6=samedi)
  workDays: number[];
  // Horaires par défaut
  defaultStartTime: string; // HH:mm
  defaultEndTime: string; // HH:mm
  // Horaires spécifiques par jour (optionnel)
  customSchedule?: {
    [day: number]: {
      startTime: string;
      endTime: string;
    };
  };
  // Périodes de vacances
  vacations?: {
    id: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    description?: string;
  }[];
  // Jours de congés isolés
  offDays?: string[]; // Array de dates YYYY-MM-DD
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  category: 'starter' | 'main' | 'dessert' | 'snack' | 'other';
  ingredients: string[];
  instructions: string;
  prepTime?: number; // en minutes
  cookTime?: number; // en minutes
  servings?: number;
  image?: string;
  tags?: string[];
  createdAt: string;
}

export interface Meal {
  id: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId?: string; // référence à une recette
  title: string; // si pas de recette liée
  notes?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  month: string; // YYYY-MM
  categories: {
    food: number;
    health: number;
    children: number;
    home: number;
    leisure: number;
    other: number;
  };
  expenses: {
    id: string;
    category: 'food' | 'health' | 'children' | 'home' | 'leisure' | 'other';
    amount: number;
    description: string;
    date: string;
  }[];
  createdAt: string;
}

export interface NotificationSettings {
  appointmentReminders: {
    enabled: boolean;
    timings: Array<{
      id: string;
      label: string;
      minutes: number; // minutes avant le rendez-vous
      enabled: boolean;
    }>;
  };
  taskReminders: {
    enabled: boolean;
    defaultTiming: number; // minutes avant la tâche
  };
}

export interface AppState {
  shoppingItems: ShoppingItem[];
  tasks: Task[];
  appointments: Appointment[];
  familyMembers: FamilyMember[];
  recipes: Recipe[];
  meals: Meal[];
  budgets: Budget[];
}
