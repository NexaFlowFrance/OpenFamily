import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api } from '../lib/api';
import { useAuth, DEFAULT_DASHBOARD_PREFS, type DashboardPrefs, type DashboardWidget } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { intlLocale, dateLocale } from '../i18n/format';
import {
    ShoppingCart, CheckSquare, Calendar, Wallet, AlertCircle, ChevronRight, Clock,
    SlidersHorizontal, Eye, EyeOff, ArrowUp, ArrowDown, CalendarDays,
} from 'lucide-react';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui';
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
    occurrence_id?: string;
    title: string;
    description?: string;
    start_time: string;
    end_time?: string;
    family_members_data?: Array<{ id: string; name: string; color: string }>;
}

interface PlanningEntry {
    id: string;
    family_member_name: string;
    family_member_color: string;
    title: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    location?: string;
}

const Dashboard: React.FC = () => {
    const { t } = useTranslation(['dashboard', 'common', 'notes']);
    const { user, isModuleEnabled, dashboardPrefs, updateDashboardPrefs } = useAuth();
    const currency = user?.currency || 'EUR';
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [planning, setPlanning] = useState<PlanningEntry[]>([]);
    const [notes, setNotes] = useState<FamilyNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [customizing, setCustomizing] = useState(false);
    const navigate = useNavigate();

    const prefs = dashboardPrefs ?? DEFAULT_DASHBOARD_PREFS;
    const agendaView = prefs.agendaView;

    const today = new Intl.DateTimeFormat(intlLocale(), {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date());

    // Monday-based week, matching the Planning page.
    const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);

    useEffect(() => { void loadAll(); }, [agendaView]);
    useWebSocketUpdates('tasks', () => { void loadAll(); });
    useWebSocketUpdates('shopping', () => { void loadAll(); });
    useWebSocketUpdates('appointments', () => { void loadAll(); });
    useWebSocketUpdates('budget', () => { void loadAll(); });
    useWebSocketUpdates('planning', () => { void loadPlanning(); });
    useWebSocketUpdates('notes', () => { void loadNotes(); });

    const loadNotes = async () => {
        try {
            const res = await api.get<{ success: boolean; data: FamilyNote[] }>('/api/notes');
            if (res.success) setNotes(res.data);
        } catch (e) {
            console.error('Notes load error:', e);
        }
    };

    const loadPlanning = async () => {
        if (!isModuleEnabled('planning')) return;
        try {
            const res = await api.get<{ success: boolean; data: PlanningEntry[] }>(
                `/api/planning?week_start=${format(weekStart, 'yyyy-MM-dd')}`
            );
            if (res.success) setPlanning(res.data);
        } catch (e) {
            console.error('Planning load error:', e);
        }
    };

    const loadAll = async () => {
        try {
            void loadNotes();
            void loadPlanning();
            const [statsRes, apptRes] = await Promise.all([
                api.get<{ success: boolean; data: DashboardStats }>('/api/dashboard'),
                (() => {
                    // Naive local bounds - appointment times are stored as local
                    // "YYYY-MM-DDTHH:mm:ss" strings, so the window must not be UTC.
                    // Week view spans Monday to Sunday, day view just today.
                    const from = agendaView === 'week' ? weekStart : new Date();
                    const to = agendaView === 'week' ? addDays(weekStart, 6) : new Date();
                    const start = format(from, "yyyy-MM-dd'T'00:00:00");
                    const end = format(to, "yyyy-MM-dd'T'23:59:59");
                    return api.get<{ success: boolean; data: Appointment[] }>(
                        `/api/appointments?start_date=${start}&end_date=${end}`
                    );
                })(),
            ]);
            if (statsRes.success) setStats(statsRes.data);
            if (apptRes.success) setAppointments(apptRes.data);
        } catch (e) {
            console.error('Dashboard load error:', e);
        } finally {
            setLoading(false);
        }
    };

    const savePrefs = (next: DashboardPrefs) => {
        void updateDashboardPrefs(next).catch((e) => console.error('Dashboard prefs save error:', e));
    };

    const toggleWidget = (key: DashboardWidget) => {
        const hidden = prefs.hidden.includes(key)
            ? prefs.hidden.filter((k) => k !== key)
            : [...prefs.hidden, key];
        savePrefs({ ...prefs, hidden });
    };

    const moveWidget = (key: DashboardWidget, direction: -1 | 1) => {
        const order = [...prefs.order];
        const from = order.indexOf(key);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= order.length) return;
        [order[from], order[to]] = [order[to], order[from]];
        savePrefs({ ...prefs, order });
    };

    const setAgendaView = (view: 'day' | 'week') => savePrefs({ ...prefs, agendaView: view });

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

    const fmtTime = (iso: string) =>
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

    // Week view groups appointments by day; day view is a single group.
    const appointmentDays = agendaView === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((date) => ({
            date,
            items: appointments.filter((a) => isSameDay(new Date(a.start_time), date)),
        })).filter((group) => group.items.length > 0)
        : [{ date: new Date(), items: appointments }];

    const renderAgenda = () => (
        <section key="agenda" className={prefs.hidden.includes('quick') ? '' : 'lg:col-span-2'}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h2 className="font-serif text-h2">
                    {agendaView === 'week' ? t('dashboard:today.weekTitle') : t('dashboard:today.title')}
                </h2>
                <div className="flex items-center gap-1 rounded-input border border-border p-0.5">
                    <button
                        type="button"
                        onClick={() => setAgendaView('day')}
                        className={`px-2.5 py-1 text-caption rounded transition-colors ${agendaView === 'day' ? 'bg-primary-soft text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {t('dashboard:today.viewDay')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setAgendaView('week')}
                        className={`px-2.5 py-1 text-caption rounded transition-colors ${agendaView === 'week' ? 'bg-primary-soft text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {t('dashboard:today.viewWeek')}
                    </button>
                </div>
            </div>

            {appointments.length === 0 ? (
                <div className="rounded-card border border-dashed border-border-strong p-8 text-center">
                    <p className="font-serif text-h2 text-muted-foreground mb-1">{t('dashboard:today.emptyTitle')}</p>
                    <p className="text-caption text-muted-foreground">
                        {agendaView === 'week' ? t('dashboard:today.emptyWeekSubtitle') : t('dashboard:today.emptySubtitle')}
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/calendar')}
                        className="mt-4 text-caption text-primary font-medium hover:underline underline-offset-4"
                    >
                        {t('dashboard:today.emptyCta')}
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {appointmentDays.map((group) => (
                        <div key={group.date.toISOString()}>
                            {agendaView === 'week' && (
                                <p className="text-micro uppercase tracking-[0.08em] text-muted-foreground mb-2 first-letter:uppercase">
                                    {format(group.date, 'EEEE d MMMM', { locale: dateLocale() })}
                                </p>
                            )}
                            <div className="rounded-card border border-border bg-card divide-y divide-border overflow-hidden">
                                {group.items.map((appt) => (
                                    <div key={appt.occurrence_id || appt.id} className="grid grid-cols-[72px_1fr_auto] gap-4 items-center px-5 py-4">
                                        <div className="font-serif text-body text-muted-foreground tabular-nums">
                                            {fmtTime(appt.start_time)}
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
                        </div>
                    ))}
                </div>
            )}
        </section>
    );

    const renderQuickAccess = () => (
        <aside key="quick" className="flex flex-col gap-4">
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
                <p className="font-serif text-4xl tracking-tight text-foreground">{stats?.shoppingItems ?? 0}</p>
                <p className="text-caption text-muted-foreground mt-1">
                    {t('dashboard:aside.shoppingCount', { count: stats?.shoppingItems ?? 0 })}
                </p>
            </div>

            {isModuleEnabled('budget') && (
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
            )}

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
                <p className="font-serif text-4xl tracking-tight text-foreground">{stats?.pendingTasks ?? 0}</p>
                <p className="text-caption text-muted-foreground mt-1">
                    {t('dashboard:aside.tasksCount', { count: stats?.pendingTasks ?? 0 })}
                </p>
            </div>
        </aside>
    );

    const renderStats = () => (
        <div key="stats" className="grid grid-cols-2 lg:grid-cols-4 overflow-hidden rounded-card border border-border bg-card">
            {statCards
                // A family that hid Budget must not see a budget tile.
                .filter((card) => (card.href === '/budget' ? isModuleEnabled('budget') : true))
                .map((card, i, visible) => {
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
                                i < visible.length - 1 ? 'lg:border-r lg:border-border' : '',
                                'lg:border-b-0',
                            ].join(' ')}
                        >
                            <span className="flex items-center gap-2 text-micro uppercase tracking-[0.04em] text-muted-foreground">
                                <Icon className="h-4 w-4" />
                                {card.title}
                            </span>
                            <span className={`font-serif text-4xl leading-none tracking-tight ${(card as { flag?: boolean }).flag ? 'text-primary' : 'text-foreground'}`}>
                                {card.value}
                            </span>
                        </button>
                    );
                })}
        </div>
    );

    // Weekly plannings (work, school, activities) straight on the home page.
    const renderPlanning = () => {
        const days = Array.from({ length: 7 }, (_, i) => ({
            date: addDays(weekStart, i),
            dayOfWeek: i + 1,
        })).map((day) => ({
            ...day,
            items: planning.filter((entry) => entry.day_of_week === day.dayOfWeek),
        })).filter((day) => day.items.length > 0);

        return (
            <section key="planning">
                <div className="flex items-baseline justify-between mb-4">
                    <h2 className="font-serif text-h2">{t('dashboard:planning.title')}</h2>
                    <button
                        type="button"
                        onClick={() => navigate('/planning')}
                        className="text-caption text-primary hover:underline underline-offset-4 flex items-center gap-1"
                    >
                        {t('dashboard:planning.viewAll')} <ChevronRight className="w-3 h-3" />
                    </button>
                </div>

                {days.length === 0 ? (
                    <div className="rounded-card border border-dashed border-border-strong p-6 text-center">
                        <p className="text-caption text-muted-foreground">{t('dashboard:planning.empty')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {days.map((day) => (
                            <div key={day.dayOfWeek} className="rounded-card border border-border bg-card p-4">
                                <p className="text-micro uppercase tracking-[0.08em] text-muted-foreground mb-3 first-letter:uppercase">
                                    {format(day.date, 'EEEE d', { locale: dateLocale() })}
                                </p>
                                <ul className="space-y-2.5">
                                    {day.items.map((entry) => (
                                        <li key={entry.id} className="flex items-start gap-2.5">
                                            <span
                                                className="mt-1.5 h-2 w-2 rounded-full flex-none"
                                                style={{ background: entry.family_member_color }}
                                            />
                                            <div className="min-w-0">
                                                <p className="text-caption font-medium text-foreground truncate">{entry.title}</p>
                                                <p className="text-micro text-muted-foreground">
                                                    {entry.start_time.slice(0, 5)} - {entry.end_time.slice(0, 5)} · {entry.family_member_name}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        );
    };

    const renderNotes = () => (
        <section key="notes">
            <h2 className="font-serif text-h2 mb-4">{t('notes:title')}</h2>
            <FamilyNotes notes={notes} onChanged={() => void loadNotes()} />
        </section>
    );

    // A widget shows when the member has not hidden it AND its module is enabled
    // for the family. Agenda and quick access sit side by side in one grid row.
    const isVisible = (key: DashboardWidget) => {
        if (prefs.hidden.includes(key)) return false;
        if (key === 'notes') return isModuleEnabled('notes');
        if (key === 'planning') return isModuleEnabled('planning');
        return true;
    };

    const widgetLabels: Record<DashboardWidget, string> = {
        stats: t('dashboard:customize.widgets.stats'),
        agenda: t('dashboard:customize.widgets.agenda'),
        planning: t('dashboard:customize.widgets.planning'),
        quick: t('dashboard:customize.widgets.quick'),
        notes: t('dashboard:customize.widgets.notes'),
    };

    const renderWidget = (key: DashboardWidget): React.ReactNode => {
        switch (key) {
            case 'stats': return renderStats();
            case 'agenda': return renderAgenda();
            case 'planning': return renderPlanning();
            case 'quick': return renderQuickAccess();
            case 'notes': return renderNotes();
            default: return null;
        }
    };

    // Agenda + quick access share a row when both are visible and adjacent.
    const blocks: React.ReactNode[] = [];
    const visibleOrder = prefs.order.filter(isVisible);
    for (let i = 0; i < visibleOrder.length; i++) {
        const key = visibleOrder[i];
        const next = visibleOrder[i + 1];
        if (key === 'agenda' && next === 'quick') {
            blocks.push(
                <div key="agenda-quick" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {renderAgenda()}
                    {renderQuickAccess()}
                </div>
            );
            i++;
            continue;
        }
        blocks.push(renderWidget(key));
    }

    return (
        <div className="space-y-8">
            {/* En-tête éditorial */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-micro uppercase tracking-[0.16em] text-muted-foreground mb-2 first-letter:uppercase">
                        {today}
                    </p>
                    <h1 className="font-serif text-display text-foreground">
                        {t('dashboard:heading.before')}<em className="italic text-primary">{t('dashboard:heading.highlight')}</em>{t('dashboard:heading.after')}
                    </h1>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCustomizing(true)}
                    className="shrink-0 flex items-center gap-2"
                >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('dashboard:customize.button')}</span>
                </Button>
            </div>

            {/* Alerte budget */}
            {stats && stats.budgetAlerts > 0 && isModuleEnabled('budget') && (
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

            {blocks}

            {visibleOrder.length === 0 && (
                <div className="rounded-card border border-dashed border-border-strong p-8 text-center">
                    <p className="text-caption text-muted-foreground mb-3">{t('dashboard:customize.allHidden')}</p>
                    <Button variant="secondary" size="sm" onClick={() => setCustomizing(true)}>
                        {t('dashboard:customize.button')}
                    </Button>
                </div>
            )}

            {/* Personnalisation : ordre, visibilité, vue de l'agenda */}
            <Dialog
                open={customizing}
                onOpenChange={setCustomizing}
                title={t('dashboard:customize.title')}
                description={t('dashboard:customize.description')}
            >
                <div className="space-y-5">
                    <div>
                        <p className="text-label font-medium text-foreground mb-2 flex items-center gap-2">
                            <CalendarDays className="h-4 w-4" />
                            {t('dashboard:customize.agendaViewLabel')}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={agendaView === 'day' ? 'primary' : 'secondary'}
                                size="sm"
                                className="flex-1"
                                onClick={() => setAgendaView('day')}
                            >
                                {t('dashboard:today.viewDay')}
                            </Button>
                            <Button
                                type="button"
                                variant={agendaView === 'week' ? 'primary' : 'secondary'}
                                size="sm"
                                className="flex-1"
                                onClick={() => setAgendaView('week')}
                            >
                                {t('dashboard:today.viewWeek')}
                            </Button>
                        </div>
                    </div>

                    <div>
                        <p className="text-label font-medium text-foreground mb-2">
                            {t('dashboard:customize.widgetsLabel')}
                        </p>
                        <ul className="space-y-2">
                            {prefs.order.map((key, index) => {
                                const hidden = prefs.hidden.includes(key);
                                const unavailable =
                                    (key === 'notes' && !isModuleEnabled('notes')) ||
                                    (key === 'planning' && !isModuleEnabled('planning'));
                                return (
                                    <li
                                        key={key}
                                        className="flex items-center gap-2 rounded-input border border-border bg-card px-3 py-2"
                                    >
                                        <span className={`flex-1 text-body-sm ${hidden || unavailable ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                            {widgetLabels[key]}
                                            {unavailable && (
                                                <span className="ml-2 text-micro text-muted-foreground no-underline">
                                                    {t('dashboard:customize.moduleDisabled')}
                                                </span>
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => moveWidget(key, -1)}
                                            disabled={index === 0}
                                            title={t('dashboard:customize.moveUp')}
                                            className="p-1 rounded hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <ArrowUp className="h-4 w-4 text-muted-foreground" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveWidget(key, 1)}
                                            disabled={index === prefs.order.length - 1}
                                            title={t('dashboard:customize.moveDown')}
                                            className="p-1 rounded hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <ArrowDown className="h-4 w-4 text-muted-foreground" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleWidget(key)}
                                            disabled={unavailable}
                                            title={hidden ? t('dashboard:customize.show') : t('dashboard:customize.hide')}
                                            className="p-1 rounded hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            {hidden
                                                ? <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                : <Eye className="h-4 w-4 text-primary" />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <div className="flex justify-between gap-3 pt-2 border-t border-border">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => savePrefs(DEFAULT_DASHBOARD_PREFS)}
                        >
                            {t('dashboard:customize.reset')}
                        </Button>
                        <Button type="button" onClick={() => setCustomizing(false)}>
                            {t('common:actions.close')}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
};

export default Dashboard;
