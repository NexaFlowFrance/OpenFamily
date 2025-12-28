import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from 'pg';
import { createApp } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialise la famille par défaut dans la base de données
 */
async function initializeDefaultFamily(pool: Pool) {
  const familyId = 'family-default';
  
  try {
    // Vérifier si la famille existe déjà
    const familyResult = await pool.query(
      'SELECT id FROM families WHERE id = $1',
      [familyId]
    );

    if (familyResult.rows.length === 0) {
      // Créer la famille par défaut
      await pool.query(
        'INSERT INTO families (id, name) VALUES ($1, $2)',
        [familyId, 'Famille par défaut']
      );
      console.log('✅ Default family created');
    } else {
      console.log('✅ Default family already exists');
    }
  } catch (error) {
    console.error('⚠️ Error initializing default family:', error);
  }
}

// Configuration de la base de données
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'openfamily',
  user: process.env.DB_USER || 'openfamily',
  password: process.env.DB_PASSWORD || 'openfamily',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function startServer() {
  try {
    // Tester la connexion à la base de données
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');

    // Initialiser la famille par défaut si elle n'existe pas
    await initializeDefaultFamily(pool);
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.error('Please ensure PostgreSQL is running and the database is created.');
    console.error('Run: psql -U postgres -f server/schema.sql');
    process.exit(1);
  }

  // Créer l'API app
  const apiApp = createApp(pool);
  
  // Créer l'app Express principal
  const app = express();
  const server = createServer(app);

  // Monter l'API
  app.use('/api', apiApp);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`🚀 OpenFamily server running on http://localhost:${port}/`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`🔐 API endpoint: http://localhost:${port}/api`);
  });
  
  // Gestion des erreurs de connexion à la base de données
  pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
    process.exit(-1);
  });

  // Gestion de l'arrêt propre
  process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server and database connection');
    await pool.end();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing HTTP server and database connection');
    await pool.end();
    process.exit(0);
  });
}

startServer().catch(console.error);
