import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useCallback,
    ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WsEntity =
    | 'tasks'
    | 'shopping'
    | 'appointments'
    | 'family'
    | 'budget'
    | 'recipes'
    | 'meal-plans'
    | 'planning'
    | 'notifications';

export type WsAction = 'created' | 'updated' | 'deleted';

export interface WsUpdateMessage {
    type: 'update';
    entity: WsEntity;
    action: WsAction;
}

type Subscriber = () => void;

interface WebSocketContextType {
    /** Subscribe to updates for a given entity. Returns an unsubscribe function. */
    subscribe: (entity: WsEntity, cb: Subscriber) => () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

// VITE_WS_URL non défini en dev -> ws://localhost:3001.
// En build de production, on dérive l'URL WebSocket de window.location (même
// origine), pour fonctionner depuis un mobile via http://<ip-du-pc>:3000.
const rawWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
const WS_URL = rawWsUrl !== undefined
    ? rawWsUrl
    : (import.meta.env.PROD ? '' : 'ws://localhost:3001');

const resolveWsBase = (): string => {
    if (WS_URL) return WS_URL;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
};

const RECONNECT_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

// ─── Provider ────────────────────────────────────────────────────────────────

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();

    // Map entity → set of subscriber callbacks
    const subscribers = useRef<Map<WsEntity, Set<Subscriber>>>(new Map());

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectDelay = useRef(RECONNECT_DELAY_MS);
    const unmounted = useRef(false);

    // Notify all subscribers for a given entity
    const notify = useCallback((entity: WsEntity) => {
        const cbs = subscribers.current.get(entity);
        if (cbs) {
            cbs.forEach((cb) => cb());
        }
    }, []);

    const clearPing = () => {
        if (pingTimer.current) {
            clearInterval(pingTimer.current);
            pingTimer.current = null;
        }
    };

    const connect = useCallback(() => {
        if (unmounted.current || !user) return;

        // Close any existing socket
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }

        const ws = new WebSocket(`${resolveWsBase()}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
            reconnectDelay.current = RECONNECT_DELAY_MS;

            // Authenticate with JWT — never send the raw userId
            ws.send(JSON.stringify({ type: 'auth', token: api.getToken() }));

            // Heartbeat to keep connection alive through proxies
            clearPing();
            pingTimer.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, PING_INTERVAL_MS);
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data as string) as WsUpdateMessage;
                if (msg.type === 'update' && msg.entity) {
                    notify(msg.entity);
                }
            } catch {
                // ignore malformed frames
            }
        };

        ws.onclose = () => {
            clearPing();
            if (unmounted.current) return;

            // Exponential back-off reconnection
            reconnectTimer.current = setTimeout(() => {
                reconnectDelay.current = Math.min(
                    reconnectDelay.current * 2,
                    RECONNECT_MAX_DELAY_MS,
                );
                connect();
            }, reconnectDelay.current);
        };

        ws.onerror = () => {
            // onclose will fire after onerror, reconnect handled there
            ws.close();
        };
    }, [user, notify]);

    // Connect when user is available, disconnect on logout
    useEffect(() => {
        unmounted.current = false;

        if (user) {
            connect();
        }

        return () => {
            unmounted.current = true;
            clearPing();
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user, connect]);

    const subscribe = useCallback((entity: WsEntity, cb: Subscriber): (() => void) => {
        if (!subscribers.current.has(entity)) {
            subscribers.current.set(entity, new Set());
        }
        subscribers.current.get(entity)!.add(cb);

        return () => {
            subscribers.current.get(entity)?.delete(cb);
        };
    }, []);

    return (
        <WebSocketContext.Provider value={{ subscribe }}>
            {children}
        </WebSocketContext.Provider>
    );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useWebSocket = (): WebSocketContextType => {
    const ctx = useContext(WebSocketContext);
    if (!ctx) {
        throw new Error('useWebSocket must be used inside <WebSocketProvider>');
    }
    return ctx;
};
