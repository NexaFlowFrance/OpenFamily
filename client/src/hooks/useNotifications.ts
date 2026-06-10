import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

export interface AppNotification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    type: string;
    is_read: boolean;
    related_id: string | null;
    created_at: string;
}

export type NotificationPermission = 'default' | 'granted' | 'denied';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function useNotifications() {
    const { t } = useTranslation('notifications');
    const [permission, setPermission] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? (Notification.permission as NotificationPermission) : 'default'
    );
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const isSupported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

    // Check current subscription status
    const checkSubscription = useCallback(async () => {
        if (!isSupported) return;
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            setIsSubscribed(sub !== null);
        } catch {
            setIsSubscribed(false);
        }
    }, [isSupported]);

    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: { count: number } }>(
                '/api/notifications/unread-count'
            );
            if (res.success) setUnreadCount(res.data.count);
        } catch {
            // silently fail
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: AppNotification[] }>('/api/notifications');
            if (res.success) setNotifications(res.data);
        } catch {
            // silently fail
        }
    }, []);

    useEffect(() => {
        void checkSubscription();
        void fetchUnreadCount();
    }, [checkSubscription, fetchUnreadCount]);

    // Refresh unread count on window focus
    useEffect(() => {
        const onFocus = () => void fetchUnreadCount();
        window.addEventListener('visibilitychange', onFocus);
        return () => window.removeEventListener('visibilitychange', onFocus);
    }, [fetchUnreadCount]);

    const subscribe = useCallback(async (): Promise<void> => {
        if (!isSupported) throw new Error(t('push.unsupported'));

        setIsLoading(true);
        try {
            // 1. Request browser permission
            const perm = await Notification.requestPermission();
            setPermission(perm as NotificationPermission);
            if (perm !== 'granted') throw new Error(t('push.denied'));

            // 2. Get VAPID public key from server
            const keyRes = await api.get<{ success: boolean; data: string }>(
                '/api/notifications/vapid-public-key'
            );
            if (!keyRes.success || !keyRes.data) throw new Error(t('push.noVapid'));

            // 3. Register service worker and subscribe
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyRes.data) as unknown as BufferSource,
            });

            // 4. Send subscription to server
            const { endpoint, keys } = subscription.toJSON() as {
                endpoint: string;
                keys: { auth: string; p256dh: string };
            };

            await api.post('/api/notifications/subscribe', { endpoint, keys });
            setIsSubscribed(true);
        } finally {
            setIsLoading(false);
        }
    }, [isSupported, t]);

    const unsubscribe = useCallback(async (): Promise<void> => {
        setIsLoading(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                const endpoint = sub.endpoint;
                await sub.unsubscribe();
                await api.delete(`/api/notifications/subscribe?endpoint=${encodeURIComponent(endpoint)}`);
            }
            setIsSubscribed(false);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const markAsRead = useCallback(async (id: string): Promise<void> => {
        await api.put(`/api/notifications/${id}/read`, {});
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
    }, []);

    const markAllAsRead = useCallback(async (): Promise<void> => {
        await api.put('/api/notifications/read-all', {});
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnreadCount(0);
    }, []);

    return {
        isSupported,
        permission,
        isSubscribed,
        isLoading,
        unreadCount,
        notifications,
        subscribe,
        unsubscribe,
        fetchNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllAsRead,
    };
}
