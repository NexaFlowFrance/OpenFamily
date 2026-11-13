import { WebSocket } from 'ws';

export type WsEntity =
    | 'tasks'
    | 'shopping'
    | 'appointments'
    | 'family'
    | 'budget'
    | 'recipes'
    | 'meal-plans'
    | 'planning'
    | 'notifications'
    | 'integrations'
    | 'rewards'
    | 'notes'
    | 'posts';

export type WsAction = 'created' | 'updated' | 'deleted' | 'synced';

export interface WsUpdatePayload {
    type: 'update';
    entity: WsEntity;
    action: WsAction;
}

/** WebSocket close code telling the client its session or token ended. */
export const WS_SESSION_REVOKED = 4001;

export interface WsRegistration {
    /** The signed-in account, or the account whose API token opened the socket. */
    userId: string;
    /** The family owner whose data the socket follows (the account itself when standalone). */
    ownerId: string;
    /** Set when an API token opened the socket: revoking the token closes it. */
    apiTokenId?: string;
}

/** Registered WebSocket connections keyed by userId */
export const clients = new Map<string, Set<WebSocket>>();
/** The same connections keyed by the family owner's id. */
const familyClients = new Map<string, Set<WebSocket>>();
const registrations = new Map<WebSocket, WsRegistration>();

const addTo = (map: Map<string, Set<WebSocket>>, key: string, ws: WebSocket): void => {
    let set = map.get(key);
    if (!set) {
        set = new Set();
        map.set(key, set);
    }
    set.add(ws);
};

const removeFrom = (map: Map<string, Set<WebSocket>>, key: string, ws: WebSocket): void => {
    const set = map.get(key);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) map.delete(key);
};

/** Registers a signed-in socket. A socket that signs in again is moved, not counted twice. */
export const registerClient = (ws: WebSocket, registration: WsRegistration): void => {
    unregisterClient(ws);
    registrations.set(ws, registration);
    addTo(clients, registration.userId, ws);
    addTo(familyClients, registration.ownerId, ws);
};

export const unregisterClient = (ws: WebSocket): WsRegistration | undefined => {
    const registration = registrations.get(ws);
    if (!registration) return undefined;
    registrations.delete(ws);
    removeFrom(clients, registration.userId, ws);
    removeFrom(familyClients, registration.ownerId, ws);
    return registration;
};

/**
 * Push a real-time update to every connection of a family, given its owner's
 * id (the key every data row carries), or of one account, given its own id
 * (its notifications). An owner's own id is both, and reaches the family.
 */
export const broadcast = (userId: string, data: WsUpdatePayload): void => {
    const sockets = new Set<WebSocket>([...(clients.get(userId) ?? []), ...(familyClients.get(userId) ?? [])]);
    if (sockets.size === 0) return;

    const message = JSON.stringify(data);
    sockets.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

/** Closes the sockets an API token opened, once the token is revoked. */
export const closeApiTokenSockets = (apiTokenId: string): void => {
    for (const [ws, registration] of registrations) {
        if (registration.apiTokenId === apiTokenId) {
            ws.close(WS_SESSION_REVOKED, 'Token revoked');
        }
    }
};
