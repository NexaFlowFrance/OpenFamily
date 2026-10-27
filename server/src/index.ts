import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import app from './app';
import pool, { runMigrations } from './db';
import logger from './lib/logger';
import { clients, broadcast } from './lib/broadcaster';
import { startReminderScheduler } from './lib/reminderScheduler';
import { startCalendarSubscriptionScheduler } from './lib/calendarSources';
import { verifyAccessToken, WS_SESSION_REVOKED } from './lib/authTokens';
import { getAuthConfig } from './config/authConfig';

export { broadcast };

const PORT = process.env.SERVER_PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
    logger.info('ws.connection_open');

    let userId: string | null = null;

    ws.on('message', async (message: string) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'auth' && typeof data.token === 'string') {
                try {
                    const verified = await verifyAccessToken(data.token);
                    // The socket may have closed while the session was checked.
                    if (ws.readyState !== WebSocket.OPEN) return;
                    userId = verified.userId;

                    if (!clients.has(userId)) {
                        clients.set(userId, new Set());
                    }
                    clients.get(userId)!.add(ws);

                    // A revocation committed during the first check closed only
                    // the sockets registered at the time. Now that this one is
                    // registered, any later revocation closes it too, and a
                    // second check catches one that came in between.
                    await verifyAccessToken(data.token);
                    if (ws.readyState !== WebSocket.OPEN) return;

                    logger.info('ws.authenticated', { userId });
                    ws.send(JSON.stringify({ type: 'auth', success: true }));
                } catch {
                    logger.warn('ws.auth_failed');
                    ws.send(JSON.stringify({ type: 'auth', success: false }));
                    ws.close(WS_SESSION_REVOKED, 'Unauthorized');
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
