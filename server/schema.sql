-- OpenFamily Database Schema
-- PostgreSQL

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add missing columns only if the table already exists (avoids first-run errors)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'shopping_items'
    ) THEN
        ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT 0;
        ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS notes TEXT;
    END IF;
END $$;

-- Table: families
CREATE TABLE IF NOT EXISTS families (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: family_members
CREATE TABLE IF NOT EXISTS family_members (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50) NOT NULL,
    health_info JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: shopping_items
CREATE TABLE IF NOT EXISTS shopping_items (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    quantity INTEGER DEFAULT 1,
    category VARCHAR(100) DEFAULT 'other',
    checked BOOLEAN DEFAULT FALSE,
    assigned_to VARCHAR(255),
    price DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: tasks
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'todo',
    assigned_to VARCHAR(255),
    due_date TIMESTAMP,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: appointments
CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(10) NOT NULL,
    location TEXT,
    description TEXT,
    type VARCHAR(50) DEFAULT 'other',
    reminder VARCHAR(50) DEFAULT 'none',
    duration INTEGER DEFAULT 60,
    recurring JSONB,
    members JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: recipes
CREATE TABLE IF NOT EXISTS recipes (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'other',
    prep_time INTEGER DEFAULT 0,
    cook_time INTEGER DEFAULT 0,
    servings INTEGER DEFAULT 1,
    ingredients JSONB DEFAULT '[]',
    instructions JSONB DEFAULT '[]',
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: meals
CREATE TABLE IF NOT EXISTS meals (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type VARCHAR(50) NOT NULL,
    recipe_id VARCHAR(255) REFERENCES recipes(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: budgets
CREATE TABLE IF NOT EXISTS budgets (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) DEFAULT 0,
    spent DECIMAL(10, 2) DEFAULT 0,
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(family_id, category, month)
);

-- Table: budget_expenses
CREATE TABLE IF NOT EXISTS budget_expenses (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: family_configuration
CREATE TABLE IF NOT EXISTS family_configuration (
    id VARCHAR(255) PRIMARY KEY,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    storage_mode VARCHAR(50) DEFAULT 'local',
    theme VARCHAR(50) DEFAULT 'light',
    language VARCHAR(10) DEFAULT 'fr',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(family_id)
);

-- Table: push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    family_id VARCHAR(255) REFERENCES families(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
);

-- Table: scheduled_notifications
CREATE TABLE IF NOT EXISTS scheduled_notifications (
    id SERIAL PRIMARY KEY,
    appointment_id VARCHAR(255) NOT NULL,
    family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_shopping_items_family_id ON shopping_items(family_id);
CREATE INDEX IF NOT EXISTS idx_tasks_family_id ON tasks(family_id);
CREATE INDEX IF NOT EXISTS idx_appointments_family_id ON appointments(family_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_recipes_family_id ON recipes(family_id);
CREATE INDEX IF NOT EXISTS idx_meals_family_id ON meals(family_id);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_budgets_family_id ON budgets(family_id);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
CREATE INDEX IF NOT EXISTS idx_budget_expenses_family_id ON budget_expenses(family_id);
CREATE INDEX IF NOT EXISTS idx_budget_expenses_date ON budget_expenses(date);
CREATE INDEX IF NOT EXISTS idx_family_configuration_family_id ON family_configuration(family_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_family_id ON push_subscriptions(family_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled_time ON scheduled_notifications(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_sent ON scheduled_notifications(sent);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_family_id ON scheduled_notifications(family_id);

-- Données d'exemple (optionnel, pour les tests)
-- INSERT INTO families (id, name) VALUES ('family-demo', 'Famille Démo');
-- INSERT INTO family_members (id, family_id, name, color) VALUES 
--   ('member-1', 'family-demo', 'Papa', '#3b82f6'),
--   ('member-2', 'family-demo', 'Maman', '#ec4899');
