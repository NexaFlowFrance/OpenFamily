import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { getDateFnsLocale } from '../../lib/dateLocale';
import {
    Bell,
    BellOff,
    CheckCheck,
    Trash2,
    Calendar as CalendarIcon,
    CheckSquare,
    AlertCircle,
    Receipt,
    Wrench,
    ShieldCheck,
    Info,
} from 'lucide-react';
import { Button } from '../ui/Button';
import {
    notificationDestination,
    useDeleteNotification,
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
    useNotifications,
    useUnreadNotificationsCount,
    type Notification,
} from '../../hooks/useNotifications';

// =============================================================================
// NotificationsBell
//
// Bell icon in the header. Badge shows unread count (polled every 60s).
// Click opens a dropdown with the most recent notifications. Click on a
// notification:
//   - marks it as read,
//   - navigates to the relevant page (calendar / tasks / house) based on
//     the notification type.
//
// Dropdown closed via click-outside or Esc; built without Radix Popover to
// avoid pulling a new dependency just for this.
// =============================================================================

const iconForType = (type: string) => {
    switch (type) {
        case 'appointment_reminder_30min':
        case 'appointment_reminder_1hour':
            return CalendarIcon;
        case 'task_due_today':
            return CheckSquare;
        case 'task_overdue':
            return AlertCircle;
        case 'contract_due_soon':
            return Receipt;
        case 'maintenance_due_soon':
            return Wrench;
        case 'warranty_expiring':
            return ShieldCheck;
        default:
            return Info;
    }
};

const colorForType = (type: string): string => {
    if (type === 'task_overdue') return 'text-destructive bg-destructive/10';
    if (type === 'warranty_expiring' || type === 'contract_due_soon')
        return 'text-warning bg-warning-soft';
    if (type === 'appointment_reminder_30min') return 'text-primary bg-primary-soft';
    return 'text-muted-foreground bg-surface-2';
};

const formatRelative = (iso: string): string => {
    try {
        return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: getDateFnsLocale() });
    } catch {
        return '';
    }
};

const NotificationsBell: React.FC = () => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const unreadQuery = useUnreadNotificationsCount();
    const listQuery = useNotifications();
    const markReadMut = useMarkNotificationRead();
    const markAllMut = useMarkAllNotificationsRead();
    const deleteMut = useDeleteNotification();

    // Click-outside + Escape close. Bound only while open to keep the global
    // listener cost zero when the dropdown is collapsed.
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const unreadCount = unreadQuery.data ?? 0;
    const notifications = listQuery.data ?? [];

    const handleClickNotification = async (n: Notification) => {
        if (!n.is_read) {
            try {
                await markReadMut.mutateAsync(n.id);
            } catch {
                // swallow — we still navigate; read state will sync on next poll.
            }
        }
        setOpen(false);
        navigate(notificationDestination(n));
    };

    return (
        <div ref={containerRef} className="relative">
            <Button
                variant="secondary"
                size="icon"
                onClick={() => setOpen((v) => !v)}
                aria-label={
                    unreadCount > 0
                        ? t('notifications.ariaLabelWithCount', { count: unreadCount })
                        : t('notifications.ariaLabel')
                }
            >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span
                        className="absolute -top-1 -right-1 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white"
                        aria-hidden
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </Button>

            {open && (
                <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-card border border-border bg-card shadow-surface-hover z-50 overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                        <p className="text-caption font-semibold">
                            {t('notifications.title')}
                            {unreadCount > 0 && (
                                <span className="ml-2 text-micro text-muted-foreground font-normal">
                                    {t('notifications.unread', { count: unreadCount })}
                                </span>
                            )}
                        </p>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={() => markAllMut.mutate()}
                                className="flex items-center gap-1 text-micro text-primary hover:underline"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                {t('notifications.markAllRead')}
                            </button>
                        )}
                    </div>

                    <div className="max-h-[420px] overflow-y-auto">
                        {listQuery.isPending ? (
                            <div className="p-6 text-center text-micro text-muted-foreground">
                                {t('common.loading')}
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 flex flex-col items-center gap-2 text-center text-micro text-muted-foreground">
                                <BellOff className="h-6 w-6" />
                                <p>{t('notifications.empty')}</p>
                                <p className="italic">{t('notifications.emptyHint')}</p>
                            </div>
                        ) : (
                            <ul>
                                {notifications.map((n) => (
                                    <NotificationRow
                                        key={n.id}
                                        notification={n}
                                        onClick={() => handleClickNotification(n)}
                                        onDelete={() => deleteMut.mutate(n.id)}
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const NotificationRow: React.FC<{
    notification: Notification;
    onClick: () => void;
    onDelete: () => void;
}> = ({ notification, onClick, onDelete }) => {
    const { t } = useTranslation();
    const Icon = iconForType(notification.type);
    const colorClass = colorForType(notification.type);
    return (
        <li
            className={`group flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-2 border-b border-border last:border-b-0 ${
                !notification.is_read ? 'bg-primary-soft/30' : ''
            }`}
            onClick={onClick}
        >
            <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${colorClass}`}
            >
                <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-caption font-medium truncate">
                    {notification.title}
                    {!notification.is_read && (
                        <span
                            className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary"
                            aria-label={t('notifications.unreadDot')}
                        />
                    )}
                </p>
                <p className="text-micro text-muted-foreground truncate">{notification.message}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatRelative(notification.created_at)}
                </p>
            </div>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 shrink-0"
                aria-label={t('common.delete')}
            >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
        </li>
    );
};

export default NotificationsBell;
