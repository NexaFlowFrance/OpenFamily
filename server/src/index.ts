import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import app from './app';
import pool, { runMigrations } from './db';
import logger from './lib/logger';
import { clients, broadcast } from './lib/broadcaster';
import { startReminderScheduler } from './lib/reminderScheduler';
import { getJwtSecret } from './config/loadEnv';

export { broadcast };

const PORT = process.env.SERVER_PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
    logger.info('ws.connection_open');

    let userId: string | null = null;

    ws.on('message', (message: string) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'auth' && typeof data.token === 'string') {
                try {
                    const decoded = jwt.verify(data.token, getJwtSecret()) as { userId: string };
                    userId = decoded.userId;

                    if (!clients.has(userId)) {
                        clients.set(userId, new Set());
                    }
                    clients.get(userId)!.add(ws);

                    logger.info('ws.authenticated', { userId });
                    ws.send(JSON.stringify({ type: 'auth', success: true }));
                } catch {
                    logger.warn('ws.auth_failed');
                    ws.send(JSON.stringify({ type: 'auth', success: false }));
                    ws.close(4001, 'Unauthorized');
                }
            }
            // ping/pong for keepalive — no response needed, TCP layer handles it
        } catch (error) {
            logger.warn('ws.message_error', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    ws.on('close', () => {
        if (userId && clients.has(userId)) {
            clients.get(userId)!.delete(ws);
            if (clients.get(userId)!.size === 0) {
                clients.delete(userId);
            }
            logger.info('ws.connection_closed', { userId });
        }
    });

    ws.on('error', (error) => {
        logger.warn('ws.error', {
            error: error instanceof Error ? error.message : String(error),
        });
    });
});

// Start server
const startServer = async () => {
    try {
        await runMigrations();
        // Test database connection
        await pool.query('SELECT NOW()');
        logger.info('server.database_connected');

        startReminderScheduler();

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
