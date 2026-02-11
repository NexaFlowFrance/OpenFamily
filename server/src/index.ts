import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import app from './app';
import pool, { runMigrations } from './db';

const PORT = process.env.SERVER_PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// Store connected clients with user IDs
const clients = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection');

    let userId: string | null = null;

    ws.on('message', (message: string) => {
        try {
            const data = JSON.parse(message.toString());

            // Handle authentication
            if (data.type === 'auth' && data.userId) {
                userId = data.userId;

                if (!clients.has(userId!)) {
                    clients.set(userId!, new Set());
                }
                clients.get(userId!)!.add(ws);

                console.log(`User ${userId!} authenticated via WebSocket`);
                ws.send(JSON.stringify({ type: 'auth', success: true }));
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        if (userId && clients.has(userId)) {
            clients.get(userId)!.delete(ws);
            if (clients.get(userId)!.size === 0) {
                clients.delete(userId);
            }
            console.log(`User ${userId} disconnected from WebSocket`);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Broadcast function to send updates to specific users
export const broadcast = (userId: string, data: any) => {
    if (clients.has(userId)) {
        const userClients = clients.get(userId)!;
        const message = JSON.stringify(data);

        userClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
};

// Start server
const startServer = async () => {
    try {
        await runMigrations();
        // Test database connection
        await pool.query('SELECT NOW()');
        console.log('Database connected successfully');

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`HTTP: http://localhost:${PORT}`);
            console.log(`WebSocket: ws://localhost:${PORT}/ws`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        pool.end();
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, closing server...');
    server.close(() => {
        console.log('Server closed');
        pool.end();
        process.exit(0);
    });
});

startServer();
