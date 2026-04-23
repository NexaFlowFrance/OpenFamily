import { Pool, types } from 'pg';
import { loadEnv } from './config/loadEnv';
import logger from './lib/logger';

loadEnv();

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JavaScript Date objects.
// This prevents timezone-related date shifts (e.g. '2026-03-09' → '2026-03-08T23:00:00.000Z').
types.setTypeParser(1082, (val: string) => val);

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'openfamily',
    user: process.env.POSTGRES_USER || 'openfamily',
    password: process.env.POSTGRES_PASSWORD || 'changeme',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    logger.error('db.pool_error', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error && process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
    process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
    const start = Date.now();
    const operation = text.trim().split(/\s+/)[0]?.toUpperCase() || 'UNKNOWN';

    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('db.query', {
            operation,
            durationMs: duration,
            rows: res.rowCount ?? 0,
            hasParams: Array.isArray(params) && params.length > 0,
        });
        return res;
    } catch (error) {
        logger.error('db.query_error', {
            operation,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error && process.env.NODE_ENV !== 'production' ? error.stack : undefined,
        });
        throw error;
    }
};

export const getClient = async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    const release = client.release.bind(client);

    // Set a timeout of 5 seconds, after which we will log this client's last query
    const timeout = setTimeout(() => {
        logger.warn('db.client_checkout_timeout', { timeoutMs: 5000 });
    }, 5000);

    // Monkey patch the query method to keep track of the last query executed
    client.query = ((...args: Parameters<typeof query>) => {
        return query(...args);
    }) as typeof client.query;

    client.release = () => {
        clearTimeout(timeout);
        return release();
    };

    return client;
};

export const runMigrations = async () => {
    // Keep migrations idempotent so startup works on existing installations.
    logger.info('db.migrations_start');

    const migrations = [
        "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'Autre'",
        'ALTER TABLE family_members ADD COLUMN IF NOT EXISTS medications TEXT',
        'ALTER TABLE family_members ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT',
        'ALTER TABLE family_members ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT',
        'ALTER TABLE family_members ADD COLUMN IF NOT EXISTS notes TEXT',
        "UPDATE family_members SET notes = medical_notes WHERE notes IS NULL AND medical_notes IS NOT NULL",
        "UPDATE family_members SET medications = vaccines WHERE medications IS NULL AND vaccines IS NOT NULL",
        `CREATE TABLE IF NOT EXISTS schedule_entries (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
            schedule_type VARCHAR(30) NOT NULL DEFAULT 'work',
            title VARCHAR(255) NOT NULL,
            day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            specific_date DATE,
            location TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        'CREATE INDEX IF NOT EXISTS idx_schedule_entries_user_day ON schedule_entries(user_id, day_of_week)',
        'CREATE INDEX IF NOT EXISTS idx_schedule_entries_member ON schedule_entries(family_member_id)',
        'ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES family_members(id) ON DELETE SET NULL',
        'CREATE INDEX IF NOT EXISTS idx_budget_entries_assigned_to ON budget_entries(assigned_to)',
        `DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'update_schedule_entries_updated_at'
            ) THEN
                CREATE TRIGGER update_schedule_entries_updated_at
                BEFORE UPDATE ON schedule_entries
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
            END IF;
        END
        $$`,
        // Issue #43: fix for existing installations – drop constraint preventing cross-midnight schedules,
        // add missing columns (specific_date, location) used by the planning routes.
        'ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_check',
        'ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS specific_date DATE',
        'ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS location TEXT',
    ];

    for (const migration of migrations) {
        await pool.query(migration);
    }

    logger.info('db.migrations_complete', { count: migrations.length });
};

export default pool;
