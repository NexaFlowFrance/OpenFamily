import { Pool } from 'pg';
import { loadEnv } from './config/loadEnv';

loadEnv();

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
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

export const getClient = async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    const release = client.release.bind(client);

    // Set a timeout of 5 seconds, after which we will log this client's last query
    const timeout = setTimeout(() => {
        console.error('A client has been checked out for more than 5 seconds!');
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
            location TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CHECK (end_time > start_time)
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
    ];

    for (const migration of migrations) {
        await pool.query(migration);
    }
};

export default pool;
