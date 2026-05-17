import { WebSocket } from 'ws';

export type WsEntity =
    | 'tasks'
    | 'shopping'
    | 'appointments'
    | 'family'
    | 'budget'
    | 'recipes'
    | 'meal-plans'
    | 'planning';

export type WsAction = 'created' | 'updated' | 'deleted';

export interface WsUpdatePayload {
    type: 'update';
    entity: WsEntity;
    action: WsAction;
}

/** Registered WebSocket connections keyed by userId */
export const clients = new Map<string, Set<WebSocket>>();

/** Push a real-time update to all connections of a given user */
export const broadcast = (userId: string, data: WsUpdatePayload): void => {
    const userClients = clients.get(userId);
    if (!userClients) return;

    const message = JSON.stringify(data);
    userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};
