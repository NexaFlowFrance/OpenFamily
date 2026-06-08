import { useEffect, useRef } from 'react';
import { useWebSocket, WsEntity } from '../contexts/WebSocketContext';

/**
 * Subscribe to real-time updates for a specific entity.
 * Calls `onUpdate` whenever another client mutates the entity.
 *
 * Uses an internal ref so that pages never need to wrap their load
 * functions in useCallback; the latest version is always called.
 *
 * @example
 * useWebSocketUpdates('tasks', loadTasks);
 */
export function useWebSocketUpdates(entity: WsEntity, onUpdate: () => void): void {
    const { subscribe } = useWebSocket();

    // Always store the latest callback without re-subscribing
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => {
        onUpdateRef.current = onUpdate;
    });

    useEffect(() => {
        const unsubscribe = subscribe(entity, () => onUpdateRef.current());
        return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entity, subscribe]);
}
