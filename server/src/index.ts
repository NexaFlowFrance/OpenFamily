import http from 'http';
import app from './app';
import pool, { runMigrations } from './db';
import logger from './lib/logger';
import { broadcast } from './lib/broadcaster';
import { attachWebSocketServer } from './lib/wsServer';
import { startReminderScheduler } from './lib/reminderScheduler';
import { startCalendarSubscriptionScheduler } from './lib/calendarSources';
import { getAuthConfig } from './config/authConfig';

export { broadcast };

const PORT = process.env.SERVER_PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// The real-time channel (see lib/wsServer)
attachWebSocketServer(server);

// Start server
const startServer = async () => {
    try {
        await runMigrations();
        // Test database connection
        await pool.query('SELECT NOW()');
        logger.info('server.database_connected');

        // Read the sign-in settings now, so a missing SSO variable is logged at boot.
        getAuthConfig();

        startReminderScheduler();
        startCalendarSubscriptionScheduler();

        server.listen(PORT, () => {
            logger.info('server.started', {
                port: Number(PORT),
                httpUrl: `http://localhost:${PORT}`,
                wsUrl: `ws://localhost:${PORT}/ws`,
            });
        });
    } catch (error) {
        logger.error('server.start_failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error && process.env.NODE_ENV !== 'production' ? error.stack : undefined,
        });
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
    logger.info('server.sigterm_received');
    server.close(() => {
        logger.info('server.closed');
        pool.end();
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('server.sigint_received');
    server.close(() => {
        logger.info('server.closed');
        pool.end();
        process.exit(0);
    });
});

startServer();
