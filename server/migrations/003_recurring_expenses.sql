-- Migration 003: Recurring expenses with monthly pointing system

-- Recurring expenses (prélèvements récurrents)
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'Maison',
    debit_day INTEGER NOT NULL DEFAULT 1 CHECK (debit_day >= 1 AND debit_day <= 31),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monthly checkmarks to "point" recurring expenses (mark as actually debited)
CREATE TABLE IF NOT EXISTS recurring_expense_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recurring_expense_id UUID NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    is_pointed BOOLEAN DEFAULT FALSE,
    pointed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(recurring_expense_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_id ON recurring_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expense_logs_user_id ON recurring_expense_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expense_logs_month_year ON recurring_expense_logs(month, year);
