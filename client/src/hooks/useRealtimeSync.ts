// Hook React pour gérer la synchronisation WebSocket en temps réel
import { useEffect, useRef, useCallback } from 'react';
import { logger } from '../lib/logger';
interface SyncEvent {
  type: 'sync';
  entity: string;
  action: 'create' | 'update' | 'delete';
  data?: any;
  timestamp: string;
}

export function useRealtimeSync(
  familyId: string | null,
  reloadData: () => void | Promise<void>,
  enabled: boolean = true
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reloadDataRef = useRef(reloadData);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;

  // Keep latest reloadData without forcing reconnects on every render
  useEffect(() => {
    reloadDataRef.current = reloadData;
  }, [reloadData]);

  const connectWebSocket = useCallback(() => {
    if (!familyId || !enabled) return;

    // Si déjà connecté, ne pas reconnecter
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Déterminer l'URL du WebSocket (production ou local)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;
      
      logger.log(`[Sync] Connecting to WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        logger.log('[Sync] WebSocket connected');
        reconnectAttempts.current = 0;
        
        // S'authentifier avec le family_id
        ws.send(JSON.stringify({
          type: 'auth',
          familyId: familyId,
          userId: 'user-' + Date.now() // TODO: Utiliser le vrai userId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'auth_success') {
            logger.log('[Sync] Authentication successful');
          } else if (message.type === 'sync') {
            const syncEvent = message as SyncEvent;
            logger.log(`[Sync] Received: ${syncEvent.entity} ${syncEvent.action}`);
            
            // Reload data for the affected entity
            handleSyncEvent(syncEvent);
          } else if (message.type === 'pong') {
            // Réponse au ping, connexion OK
          }
        } catch (error) {
          logger.error('[Sync] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        logger.error('[Sync] WebSocket error:', error);
      };

      ws.onclose = () => {
        logger.log('[Sync] WebSocket disconnected');
        wsRef.current = null;
        
        // Tenter de reconnecter avec backoff exponentiel
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          logger.log(`[Sync] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connectWebSocket();
          }, delay);
        } else {
          logger.error('[Sync] Max reconnection attempts reached');
        }
      };

      wsRef.current = ws;

      // Ping régulier pour maintenir la connexion
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      // Nettoyer l'intervalle quand la connexion se ferme
      ws.addEventListener('close', () => {
        clearInterval(pingInterval);
      });

    } catch (error) {
      logger.error('[Sync] Error creating WebSocket:', error);
    }
  }, [familyId, enabled]);

  const handleSyncEvent = (event: SyncEvent) => {
    // Reload data for the modified entity
    logger.log(`[Sync] Reloading data for ${event.entity}`);
    
    // Reload all data for simplicity
    // TODO: Optimize to reload only the affected entity
    Promise.resolve(reloadDataRef.current()).catch((error) => {
      logger.error('[Sync] Error reloading data:', error);
    });
  };

  // Connecter au montage et reconnecter si familyId change
  useEffect(() => {
    if (enabled && familyId) {
      connectWebSocket();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [familyId, enabled, connectWebSocket]);

  // Handle reconnection when app becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && familyId) {
        // Check if connection is still active
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          logger.log('[Sync] App became visible, reconnecting...');
          connectWebSocket();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [familyId, enabled, connectWebSocket]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connectWebSocket
  };
}
