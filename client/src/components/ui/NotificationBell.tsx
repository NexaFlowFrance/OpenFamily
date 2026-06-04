import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useNotifications, AppNotification } from '../../hooks/useNotifications';
import { useWebSocketUpdates } from '../../hooks/useWebSocketUpdates';
import { Button } from './Button';

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'à l\'instant';
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    return `il y a ${Math.floor(hours / 24)}j`;
}

// Determine which page a notification should open when clicked.
function notificationRoute(n: AppNotification): string {
    const t = n.type || '';
    if (t.startsWith('family')) return '/family';
    if (t.startsWith('task')) return '/tasks';
    if (t.startsWith('appointment') || t.startsWith('reminder') || t.startsWith('calendar')) return '/calendar';
    if (t.startsWith('shopping')) return '/shopping';
    if (t.startsWith('meal')) return '/meal-planning';
    if (t.startsWith('recipe')) return '/recipes';
    if (t.startsWith('budget')) return '/budget';
    if (t.startsWith('schedule') || t.startsWith('planning')) return '/planning';
    return '/';
}

export const NotificationBell: React.FC = () => {
    const {
        isSupported,
        unreadCount,
        notifications,
        fetchNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllAsRead,
    } = useNotifications();

    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    // Real-time refresh when a new notification is pushed
    useWebSocketUpdates('notifications', () => {
        void fetchUnreadCount();
        if (open) void fetchNotifications();
    });

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleOpen = () => {
        setOpen((o) => {
            if (!o) void fetchNotifications();
            return !o;
        });
    };

    const handleMarkAsRead = (n: AppNotification) => {
        if (!n.is_read) void markAsRead(n.id);
        setOpen(false);
        navigate(notificationRoute(n));
    };

    if (!isSupported) return null;

    return (
        <div ref={ref} className="relative">
            <Button
                variant="secondary"
                size="icon"
                onClick={handleOpen}
                aria-label="Notifications"
                className="relative"
            >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </Button>

            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-card border border-border bg-card shadow-surface-hover">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <span className="text-caption font-semibold text-foreground">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={() => void markAllAsRead()}
                                className="flex items-center gap-1 text-micro text-primary hover:text-primary/80"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                Tout marquer lu
                            </button>
                        )}
                    </div>

                    {/* Notification list */}
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-muted-foreground">
                                <BellOff className="h-8 w-8 opacity-40" />
                                <p className="text-micro">Aucune notification</p>
                            </div>
                        ) : (
                            notifications.slice(0, 10).map((n) => (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => handleMarkAsRead(n)}
                                    className={cn(
                                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2',
                                        !n.is_read && 'bg-primary-soft/30'
                                    )}
                                >
                                    {!n.is_read && (
                                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                    )}
                                    <div className={cn('flex-1 min-w-0', n.is_read && 'ml-5')}>
                                        <p className="truncate text-micro font-medium text-foreground">
                                            {n.title}
                                        </p>
                                        <p className="mt-0.5 line-clamp-2 text-micro text-muted-foreground">
                                            {n.message}
                                        </p>
                                        <p className="mt-1 text-micro text-muted-foreground/60">
                                            {timeAgo(n.created_at)}
                                        </p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-border px-4 py-2">
                        <Link
                            to="/settings"
                            onClick={() => setOpen(false)}
                            className="block text-center text-micro text-primary hover:text-primary/80"
                        >
                            Gérer les notifications →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};
