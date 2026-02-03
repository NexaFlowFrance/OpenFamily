import { Pool } from 'pg';

// Configuration de la connexion PostgreSQL
// Note: Ce pool n'est plus utilisé, voir server/index.ts pour la connexion principale
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/openfamily';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

// Auto-connexion désactivée pour éviter les problèmes avec Docker
// La connexion est maintenant testée dans server/index.ts

export default pool;
