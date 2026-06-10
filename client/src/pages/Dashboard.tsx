import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { intlLocale } from '../i18n/format';
import { ShoppingCart, CheckSquare, Calendar, Wallet, AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import FamilyNotes, { type FamilyNote } from '../components/app/FamilyNotes';

interface DashboardStats {
    upcomingAppointments: number;
    pendingTasks: number;
    shoppingItems: number;
    thisMonthExpenses: number;
    budgetAlerts: number;
}

interface Appointment {
    id: string;
    title: string;
    description?: string;
    start_time: string;
    end_time?: string;
    family_members_data?: Array<{ id: string; name: string; color: string }>;
}

const Dashboard: React.FC = () => {
    const { t } = useTranslation(['dashboard', 'common']);
    const { user } = useAuth();
    const currency = user?.currency || 'EUR';
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
    const [notes, setNotes] = useState<FamilyNote[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const today = new Intl.DateTimeFormat(intlLocale(), {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date());

    useEffect(() => { void loadAll(); }, []);
    useWebSocketUpdates('tasks', () => { void loadAll(); });
    useWebSocketUpdates('shopping', () => { void loadAll(); });
    useWebSocketUpdates('appointments', () => { void loadAll(); });
    useWebSocketUpdates('budget', () => { void loadAll(); });
    useWebSocketUpdates('notes', () => { void loadNotes(); });

    const loadNotes = async () => {
        try {
            const res = await api.get<{ success: boolean; data: FamilyNote[] }>('/api/notes');
            if (res.success) setNotes(res.data);
        } catch (e) {
            console.error('Notes load error:', e);
        }
    };

    const loadAll = async () => {
        try {
            void loadNotes();
            const [statsRes, apptRes] = await Promise.all([
                api.get<{ success: boolean; data: DashboardStats }>('/api/dashboard'),
                (() => {
                    // Naive local bounds — appointment times are stored as local
                    // "YYYY-MM-DDTHH:mm:ss" strings, so the window must not be UTC.
                    const d = new Date();
                    const start = format(d, "yyyy-MM-dd'T'00:00:00");
                    const end   = format(d, "yyyy-MM-dd'T'23:59:59");
                    return api.get<{ success: boolean; data: Appointment[] }>(
                        `/api/appointments?start_date=${start}&end_date=${end}`
                    );
                })(),
            ]);
            if (statsRes.success) setStats(statsRes.data);
            if (apptRes.success) setTodayAppointments(apptRes.data);
        } catch (e) {
            console.error('Dashboard load error:', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">{t('common:states.loading')}</p>
                </div>
            </div>
        );
    }

    const fmt = (iso: string) =>
        new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

    const statCards = [
        { title: t('dashboard:stats.appointments'), value: stats?.upcomingAppointments ?? 0, icon: Calendar,      href: '/calendar' },
        { title: t('dashboard:stats.tasks'),        value: stats?.pendingTasks ?? 0,          icon: CheckSquare,   href: '/tasks'    },
        { title: t('dashboard:stats.shopping'),     value: stats?.shoppingItems ?? 0,          icon: ShoppingCart,  href: '/shopping' },
        {
            title: t('dashboard:stats.monthExpenses'),
            value: formatCurrency(Number(stats?.thisMonthExpenses ?? 0), currency),
            icon: Wallet, href: '/budget', flag: true,
        },
    ];

    return (
        <div className="space-y-8">
            {/* En-tête éditorial */}
            <div>
                <p className="text-micro uppercase tracking-[0.16em] text-muted-foreground mb-2 first-letter:uppercase">
                    {today}
                </p>
                <h1 className="font-serif text-display text-foreground">
                    {t('dashboard:heading.before')}<em className="italic text-primary">{t('dashboard:heading.highlight')}</em>{t('dashboard:heading.after')}
                </h1>
            </div>

            {/* Alerte budget */}
            {stats && stats.budgetAlerts > 0 && (
                <div className="flex items-start gap-4 rounded-card border border-border bg-card p-4">
                    <div className="p-2 bg-primary-soft rounded-input shrink-0">
                        <AlertCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-serif text-h2 text-foreground">{t('dashboard:budgetAlert.title')}</h3>
                        <p className="text-caption text-muted-foreground mt-1">
                            {t('dashboard:budgetAlert.message', { count: stats.budgetAlerts })}
                        </p>
                    </div>
                    <Button size="sm" onClick={() => navigate('/budget')} className="shrink-0">
                        {t('dashboard:budgetAlert.cta')}
                    </Button>
                </div>
            )}

            {/* Bande de statistiques */}
            <div className="grid grid-cols-2 lg:grid-cols-4 overflow-hidden rounded-card border border-border bg-card">
                {statCards.map((card, i) => {
                    const Icon = card.icon;
                    return (
                        <button
                            type="button"
                            key={card.title}
                            onClick={() => navigate(card.href)}
                            className={[
                                'group flex flex-col items-start gap-3 p-5 text-left transition-colors hover:bg-surface-2',
                                i < 2 ? 'border-b lg:border-b-0' : '',
                                i % 2 === 0 ? 'border-r border-border' : '',
                                'lg:border-b-0 lg:[&:not(:last-child)]:border-r lg:border-border',
                            ].join(' ')}
                        >
                            <span className="flex items-center gap-2 text-micro uppercase tracking-[0.04em] text-muted-foreground">
                                <Icon className="h-4 w-4" />
                                {card.title}
                            </span>
                            <span className={`font-serif text-4xl leading-none tracking-tight ${(card as any).flag ? 'text-primary' : 'text-foreground'}`}>
                                {card.value}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Corps : agenda + accès rapides */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Agenda du jour */}
                <section className="lg:col-span-2">
                    <div className="flex items-baseline justify-between mb-4">
                        <h2 className="font-serif text-h2">{t('dashboard:today.title')}</h2>
                        <button
                            type="button"
                            onClick={() => navigate('/calendar')}
                            className="text-caption text-primary hover:underline underline-offset-4 flex items-center gap-1"
                        >
                            {t('dashboard:today.viewWeek')} <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>

                    {todayAppointments.length === 0 ? (
                        <div className="rounded-card border border-dashed border-border-strong p-8 text-center">
                            <p className="font-serif text-h2 text-muted-foreground mb-1">{t('dashboard:today.emptyTitle')}</p>
                            <p className="text-caption text-muted-foreground">{t('dashboard:today.emptySubtitle')}</p>
                            <button
                                type="button"
                                onClick={() => navigate('/calendar')}
                                className="mt-4 text-caption text-primary font-medium hover:underline underline-offset-4"
                            >
                                {t('dashboard:today.emptyCta')}
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-card border border-border bg-card divide-y divide-border overflow-hidden">
                            {todayAppointments.map((appt) => (
                                <div key={appt.id} className="grid grid-cols-[72px_1fr_auto] gap-4 items-center px-5 py-4">
                                    <div className="font-serif text-body text-muted-foreground tabular-nums">
                                        {fmt(appt.start_time)}
                                    </div>
                                    <div>
                                        <p className="text-body font-medium text-foreground">{appt.title}</p>
                                        {appt.description && (
                                            <p className="text-caption text-muted-foreground mt-0.5">{appt.description}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-caption text-muted-foreground">
                                        {appt.family_members_data?.[0] && (
                                            <>
                                                <span
                                                    className="h-2 w-2 rounded-full flex-none"
                                                    style={{ background: appt.family_members_data[0].color }}
                                                />
                                                <span>{appt.family_members_data[0].name}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Accès rapides */}
                <aside className="flex flex-col gap-4">
                    {/* Shopping */}
                    <div
                        className="rounded-card border border-border bg-card p-5 cursor-pointer hover:bg-surface-2 transition-colors"
                        onClick={() => navigate('/shopping')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && navigate('/shopping')}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-micro uppercase tracking-[0.04em] text-muted-foreground flex items-center gap-2">
                                <ShoppingCart className="h-4 w-4" /> {t('dashboard:aside.shopping')}
                            </span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="font-serif text-4xl tracking-tight text-foreground">
                            {stats?.shoppingItems ?? 0}
                        </p>
                        <p className="text-caption text-muted-foreground mt-1">
                            {t('dashboard:aside.shoppingCount', { count: stats?.shoppingItems ?? 0 })}
                        </p>
                    </div>

                    {/* Budget */}
                    <div
                        className="rounded-card border border-border bg-card p-5 cursor-pointer hover:bg-surface-2 transition-colors"
                        onClick={() => navigate('/budget')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && navigate('/budget')}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-micro uppercase tracking-[0.04em] text-muted-foreground flex items-center gap-2">
                                <Wallet className="h-4 w-4" /> {t('dashboard:aside.budget')}
                            </span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="font-serif text-4xl tracking-tight text-primary">
                            {formatCurrency(Number(stats?.thisMonthExpenses ?? 0), currency)}
                        </p>
                        <p className="text-caption text-muted-foreground mt-1">{t('dashboard:aside.budgetSubtitle')}</p>
                    </div>

                    {/* Tâches */}
                    <div
                        className="rounded-card border border-border bg-card p-5 cursor-pointer hover:bg-surface-2 transition-colors"
                        onClick={() => navigate('/tasks')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && navigate('/tasks')}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-micro uppercase tracking-[0.04em] text-muted-foreground flex items-center gap-2">
                                <Clock className="h-4 w-4" /> {t('dashboard:aside.tasks')}
                            </span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="font-serif text-4xl tracking-tight text-foreground">
                            {stats?.pendingTasks ?? 0}
                        </p>
                        <p className="text-caption text-muted-foreground mt-1">
                            {t('dashboard:aside.tasksCount', { count: stats?.pendingTasks ?? 0 })}
                        </p>
                    </div>
                </aside>
            </div>

            {/* Mots de la famille — post-its sur le frigo numérique */}
            <section>
                <h2 className="font-serif text-h2 mb-4">{t('notes:title')}</h2>
                <FamilyNotes notes={notes} onChanged={() => void loadNotes()} />
            </section>
        </div>
    );
};

export default Dashboard;
