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
    ];

    for (const migration of migrations) {
        await pool.query(migration);
    }
};

export default pool;
