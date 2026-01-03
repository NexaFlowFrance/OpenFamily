import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from 'pg';
import { createApp } from './app.js';
import { startNotificationScheduler } from './scheduler.js';
import { SyncWebSocketServer } from './websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migre les colonnes manquantes pour shopping_items
 */
async function migrateShoppingItemsColumns(pool: Pool) {
  try {
    // Add price column if it doesn't exist
    await pool.query(`
      ALTER TABLE shopping_items 
      ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT 0
    `);
    
    // Add notes column if it doesn't exist
    await pool.query(`
      ALTER TABLE shopping_items 
      ADD COLUMN IF NOT EXISTS notes TEXT
    `);
    
    console.log('✅ Shopping items columns migrated');
  } catch (error) {
    console.error('⚠️ Error migrating shopping items columns:', error);
  }
}

/**
 * Crée les tables pour les notifications push
 */
async function migratePushNotificationTables(pool: Pool) {
  try {
    // Table push_subscriptions
    await pool.query(`
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
      )
    `);

    // Table scheduled_notifications
    await pool.query(`
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
      )
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_family_id ON push_subscriptions(family_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled_time ON scheduled_notifications(scheduled_time)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_sent ON scheduled_notifications(sent)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_family_id ON scheduled_notifications(family_id)
    `);

    console.log('✅ Push notification tables migrated');
  } catch (error) {
    console.error('⚠️ Error migrating push notification tables:', error);
  }
}

/**
 * Ensure tasks table has a JSONB data column (used to store full task objects)
 */
async function migrateTasksDataColumn(pool: Pool) {
  try {
    await pool.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'
    `);
    console.log('✅ Tasks data column migrated');
  } catch (error) {
    console.error('⚠️ Error migrating tasks data column:', error);
  }
}

/**
 * Ajoute la colonne description à la table recipes
 */
async function migrateRecipesDescriptionColumn(pool: Pool) {
  try {
    await pool.query(`
      ALTER TABLE recipes
      ADD COLUMN IF NOT EXISTS description TEXT
    `);
    console.log('✅ Recipes description column migrated');
  } catch (error) {
    console.error('⚠️ Error migrating recipes description column:', error);
  }
}

/**
 * Crée la table budget_expenses
 */
async function migrateBudgetExpensesTable(pool: Pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS budget_expenses (
        id VARCHAR(255) PRIMARY KEY,
        family_id VARCHAR(255) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        category VARCHAR(100) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        description TEXT NOT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_expenses_family_id ON budget_expenses(family_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_expenses_date ON budget_expenses(date)
    `);

    console.log('✅ Budget expenses table migrated');
  } catch (error) {
    console.error('⚠️ Error migrating budget expenses table:', error);
  }
}

/**
 * Initialise la famille par défaut dans la base de données
 */
async function initializeDefaultFamily(pool: Pool) {
  const familyId = 'family-default';
  
  try {
    // Check if family already exists
    const familyResult = await pool.query(
      'SELECT id FROM families WHERE id = $1',
      [familyId]
    );

    if (familyResult.rows.length === 0) {
      // Create default family
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

// Database configuration
// Prefer a full DATABASE_URL when provided (e.g. in Docker).
const databaseUrl = process.env.DATABASE_URL;

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : new Pool({
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
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');

    // Initialiser la famille par défaut si elle n'existe pas
    await initializeDefaultFamily(pool);
    
    // Migrer les colonnes manquantes pour shopping_items
    await migrateShoppingItemsColumns(pool);

    // Ensure tasks.data exists
    await migrateTasksDataColumn(pool);
    
    // Ensure recipes.description exists
    await migrateRecipesDescriptionColumn(pool);
    
    // Create push notifications tables
    await migratePushNotificationTables(pool);
    
    // Create budget_expenses table
    await migrateBudgetExpensesTable(pool);
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.error('Please ensure PostgreSQL is running and the database is created.');
    console.error('Run: psql -U postgres -f server/schema.sql');
    process.exit(1);
  }

  // Create API app
  const apiApp = createApp(pool);
  
  // Create main Express app
  const app = express();
  const server = createServer(app);

  // Initialiser WebSocket pour la synchronisation en temps réel
  const wsServer = new SyncWebSocketServer(server);
  console.log('🔄 WebSocket synchronization server initialized');
  
  // Add wsServer to app so routes can use it
  (app as any).wsServer = wsServer;
  (apiApp as any).wsServer = wsServer;

  // Monter l'API
  app.use('/api', apiApp);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(
    express.static(staticPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith('/sw.js')) {
          // Ensure SW updates are picked up quickly
          res.setHeader('Cache-Control', 'no-store, must-revalidate');
          // Allow SW to control the whole origin (useful behind some proxies)
          res.setHeader('Service-Worker-Allowed', '/');
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
      },
    })
  );

  // Handle client-side routing - serve index.html for all routes
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`🚀 OpenFamily server running on http://localhost:${port}/`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`🔐 API endpoint: http://localhost:${port}/api`);
    
    // Démarrer le scheduler de notifications
    startNotificationScheduler(pool);
    console.log('📬 Notification scheduler started');
  });
  
  // Database connection error handling
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
