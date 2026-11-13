import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import logger from './logger';
import { registerClient, unregisterClient, WS_SESSION_REVOKED } from './broadcaster';
import { verifyAccessToken } from './authTokens';

/**
 * The real-time channel. A client first sends {type: 'auth', token}, with a
 * session token or a personal API token, and then receives
 * {type: 'update', entity, action} whenever its family's data changes. A
 * socket whose session or token is revoked is closed with WS_SESSION_REVOKED.
 */
export const attachWebSocketServer = (server: http.Server): WebSocketServer => {
    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws: WebSocket) => {
        logger.info('ws.connection_open');

        ws.on('message', async (message: string) => {
            try {
                const data = JSON.parse(message.toString());

                if (data.type === 'auth' && typeof data.token === 'string') {
                    try {
                        const verified = await verifyAccessToken(data.token);
                        // The socket may have closed while the session was checked.
                        if (ws.readyState !== WebSocket.OPEN) return;
                        registerClient(ws, {
                            userId: verified.userId,
                            ownerId: verified.ownerId,
                            apiTokenId: verified.apiTokenId,
                        });

                        // A revocation committed during the first check closed only
                        // the sockets registered at the time. Now that this one is
                        // registered, any later revocation closes it too, and a
                        // second check catches one that came in between.
                        await verifyAccessToken(data.token);
                        if (ws.readyState !== WebSocket.OPEN) return;

                        logger.info('ws.authenticated', { userId: verified.userId, kind: verified.kind });
                        ws.send(JSON.stringify({ type: 'auth', success: true }));
                    } catch {
                        logger.warn('ws.auth_failed');
                        ws.send(JSON.stringify({ type: 'auth', success: false }));
                        ws.close(WS_SESSION_REVOKED, 'Unauthorized');
                    }
                }
                // ping/pong for keepalive: no response needed, the TCP layer handles it
            } catch (error) {
                logger.warn('ws.message_error', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        ws.on('close', () => {
            const registration = unregisterClient(ws);
            if (registration) {
                logger.info('ws.connection_closed', { userId: registration.userId });
            }
        });

        ws.on('error', (error) => {
            logger.warn('ws.error', {
                error: error instanceof Error ? error.message : String(error),
            });
        });
    });

    return wss;
};
