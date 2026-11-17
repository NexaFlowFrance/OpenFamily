import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api } from '../lib/api';
import { useAuth, DEFAULT_DASHBOARD_PREFS, type DashboardPrefs, type DashboardWidget } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { dateLocale, formatDateTime, formatTime, intlLocale, isoWeekdayAtOffset, weekStartsOn } from '../i18n/format';
import {
    ShoppingCart, CheckSquare, Calendar, Wallet, AlertCircle, ChevronRight, Clock,
    SlidersHorizontal, Eye, EyeOff, ArrowUp, ArrowDown, CalendarDays,
    Cake, Refrigerator, UtensilsCrossed,
} from 'lucide-react';
import { addDays, differenceInCalendarDays, format, isSameDay, startOfWeek } from 'date-fns';
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
    is_all_day?: boolean;
    kind?: string;
}

// What the small cards list: a few lines each, never the whole section.
const CARD_LINES = 5;
interface HomeTask { id: string; title: string; is_completed: boolean; due_date?: string | null; assigned_to_members?: Array<{ id: string; name: string; color: string }> }
interface HomeMeal { id: string; date: string; meal_type: string; custom_meal?: string | null; recipe?: { name: string } | null; recipe_name?: string | null }
interface HomeShoppingItem { id: string; name: string; is_checked?: boolean; quantity?: string | number | null; unit?: string | null }
interface HomePantryItem { id: string; name: string; expires_on: string | null }
interface HomeBirthday { id: string; occurrence_id?: string; start_time: string; kind?: string; color?: string; birthday?: { name: string; age: number } }
// Meal slots are stored under their French names, in the order of the day.
const MEAL_ORDER = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Snack'];
/** From this many days before its date, a product is to be eaten soon. */
const EAT_SOON_DAYS = 7;
/** How far ahead the birthdays card looks. */
const BIRTHDAY_DAYS = 120;
/** The agenda's day view: today, and this many days after it. */
const AGENDA_DAYS_AHEAD = 2;

/** A small card of the home page: a title, a way to the whole section, a few lines. */
const HomeCard: React.FC<{
    icon: typeof Calendar;
    title: string;
    count?: number;
    allLabel: string;
    onOpen: () => void;
    children: React.ReactNode;
}> = ({ icon: Icon, title, count, allLabel, onOpen, children }) => (
    <section className="flex h-full flex-col rounded-card border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2.5 font-serif text-h2 text-foreground">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" />
                </span>
                <span className="truncate">{title}</span>
                {count !== undefined && count > 0 && (
                    <span className="rounded-pill bg-surface-2 px-2 py-0.5 font-sans text-micro font-medium text-muted-foreground">{count}</span>
                )}
            </h2>
            <button
                type="button"
                onClick={onOpen}
                className="flex shrink-0 items-center gap-0.5 rounded-input px-1.5 py-1 text-micro font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
                {allLabel}
                <ChevronRight className="h-3.5 w-3.5" />
            </button>
        </div>
        <div className="flex-1">{children}</div>
    </section>
);

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

interface LatestFamilyPost {
    id: string;
    author_name: string;
    author_avatar?: string | null;
    content?: string | null;
    image_url?: string | null;
    link_url?: string | null;
    created_at: string;
    seen_by: Array<{
        id: string;
        name: string;
        seen_at: string;
    }>;
    is_seen: boolean;
}

const Dashboard: React.FC = () => {
    const { t } = useTranslation(['dashboard', 'common', 'notes', 'meals', 'pantry', 'calendar']);
    const { user, isModuleEnabled, dashboardPrefs, updateDashboardPrefs } = useAuth();
    const currency = user?.currency || 'EUR';
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [planning, setPlanning] = useState<PlanningEntry[]>([]);
    const [notes, setNotes] = useState<FamilyNote[]>([]);
    const [latestPost, setLatestPost] = useState<LatestFamilyPost | null>(null);
    const [homeTasks, setHomeTasks] = useState<HomeTask[]>([]);
    const [homeMeals, setHomeMeals] = useState<HomeMeal[]>([]);
    const [homeShopping, setHomeShopping] = useState<HomeShoppingItem[]>([]);
    const [homePantry, setHomePantry] = useState<HomePantryItem[]>([]);
    const [homeBirthdays, setHomeBirthdays] = useState<HomeBirthday[]>([]);
    const [loading, setLoading] = useState(true);
    const [customizing, setCustomizing] = useState(false);
    const navigate = useNavigate();

    const prefs = dashboardPrefs ?? DEFAULT_DASHBOARD_PREFS;
    const agendaView = prefs.agendaView;

    const today = new Intl.DateTimeFormat(intlLocale(), {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date());

    // Same first day as the Planning page: the member's choice, or regional.
    const firstDay = weekStartsOn();
    const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: firstDay }), [firstDay]);

    useEffect(() => { void loadAll(); }, [agendaView]);
    useWebSocketUpdates('tasks', () => { void loadAll(); });
    useWebSocketUpdates('shopping', () => { void loadAll(); });
    useWebSocketUpdates('appointments', () => { void loadAll(); });
    useWebSocketUpdates('budget', () => { void loadAll(); });
    useWebSocketUpdates('planning', () => { void loadPlanning(); });
    useWebSocketUpdates('notes', () => { void loadNotes(); });
    useWebSocketUpdates('meal-plans', () => { void loadCards(); });
    useWebSocketUpdates('pantry', () => { void loadCards(); });
    useWebSocketUpdates('family', () => { void loadCards(); });
    useWebSocketUpdates('posts', () => { void loadLatestPost(); });

    const loadLatestPost = async () => {
        try {
            const res = await api.get<{
                success: boolean;
                data: LatestFamilyPost | null;
            }>('/api/posts/latest');

            if (res.success) {
                setLatestPost(res.data);
            }
        } catch (e) {
            console.error('Latest post load error:', e);
        }
    };

    // The small cards. Each asks for its own list and keeps what it had if the
    // request fails: one section that does not answer must not empty the page.
    const loadCards = async () => {
        const todayDay = format(new Date(), 'yyyy-MM-dd');
        const list = async <T,>(url: string, keep: (rows: T[]) => void) => {
            try {
                const res = await api.get<{ success: boolean; data: T[] }>(url);
                if (res.success && Array.isArray(res.data)) keep(res.data);
            } catch (e) {
                console.error('Dashboard card load error:', url, e);
            }
        };
        await Promise.all([
            list<HomeTask>('/api/tasks', setHomeTasks),
            list<HomeShoppingItem>('/api/shopping', setHomeShopping),
            isModuleEnabled('meals') ? list<HomeMeal>(`/api/meal-plans?start_date=${todayDay}&end_date=${todayDay}`, setHomeMeals) : Promise.resolve(),
            isModuleEnabled('pantry') ? list<HomePantryItem>('/api/pantry', setHomePantry) : Promise.resolve(),
            list<HomeBirthday>(
                `/api/appointments?start_date=${todayDay}T00:00:00&end_date=${format(addDays(new Date(), BIRTHDAY_DAYS), 'yyyy-MM-dd')}T23:59:59`,
                (rows) => setHomeBirthdays(rows.filter((row) => row.kind === 'birthday')),
            ),
        ]);
    };

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
            void loadLatestPost();
            void loadPlanning();
            void loadCards();
            const [statsRes, apptRes] = await Promise.all([
                api.get<{ success: boolean; data: DashboardStats }>('/api/dashboard'),
                (() => {
                    // Naive local bounds - appointment times are stored as local
                    // "YYYY-MM-DDTHH:mm:ss" strings, so the window must not be UTC.
                    // Week view spans Monday to Sunday, day view just today.
                    // The day view also brings the two days that follow:
                    // what comes next is part of knowing where the day is going.
                    const from = agendaView === 'week' ? weekStart : new Date();
                    const to = agendaView === 'week' ? addDays(weekStart, 6) : addDays(new Date(), AGENDA_DAYS_AHEAD);
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

    const fmtTime = (iso: string) => formatTime(iso);

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

    // Appointments grouped by day: the seven days of the week view, today and
    // the two days after it for the day view. A day with nothing is left out.
    const appointmentDays = (agendaView === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
        : Array.from({ length: AGENDA_DAYS_AHEAD + 1 }, (_, i) => addDays(new Date(), i))
    ).map((date) => ({
        date,
        items: appointments.filter((a) => isSameDay(new Date(a.start_time), date)),
    })).filter((group) => group.items.length > 0);

    const renderAgenda = () => (
        <section key="agenda" className="h-full rounded-card border border-border bg-card p-5">
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
                            {(agendaView === 'week' || !isSameDay(group.date, new Date())) && (
                                <p className="text-micro uppercase tracking-[0.08em] text-muted-foreground mb-2 first-letter:uppercase">
                                    {format(group.date, 'EEEE d MMMM', { locale: dateLocale() })}
                                </p>
                            )}
                            <div className="divide-y divide-border">
                                {group.items.map((appt) => (
                                    <div key={appt.occurrence_id || appt.id} className="grid grid-cols-[72px_1fr] items-baseline gap-4 py-3">
                                        <div className="font-serif text-body text-muted-foreground tabular-nums">
                                            {/* A whole day, a birthday among them, has no hour to show. */}
                                            {appt.kind === 'birthday'
                                                ? <Cake className="h-4 w-4 text-primary" aria-hidden="true" />
                                                : appt.is_all_day ? <span className="font-sans text-micro">{t('calendar:form.allDay')}</span> : fmtTime(appt.start_time)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-body font-medium text-foreground">{appt.title}</p>
                                            {appt.description && (
                                                <p className="text-caption text-muted-foreground mt-0.5">{appt.description}</p>
                                            )}
                                            {/* Everyone taking part, not only the first: a family dinner names the whole family. */}
                                            {(appt.family_members_data ?? []).length > 0 && (
                                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                                                    {(appt.family_members_data ?? []).map((member) => (
                                                        <span key={member.id} className="inline-flex items-center gap-1.5">
                                                            <span className="h-2 w-2 flex-none rounded-full" style={{ background: member.color }} />
                                                            {member.name}
                                                        </span>
                                                    ))}
                                                </div>
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

    // As many columns as there are figures: a family that hid Budget has
    // three, and must not be left with an empty fourth box.
    const statColumns = isModuleEnabled('budget') ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
    const renderStats = () => (
        <div key="stats" className={`grid grid-cols-2 ${statColumns} overflow-hidden rounded-card border border-border bg-card`}>
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
                                'group flex min-w-0 flex-col items-start gap-3 p-4 text-left transition-colors hover:bg-surface-2 sm:p-5',
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
                            {/* An amount is twice as long as a count: smaller on a phone so
                                "229,40 €" stays on one line in a half-width tile. */}
                            <span className={`whitespace-nowrap font-serif leading-none tracking-tight ${typeof card.value === 'string' ? 'text-2xl sm:text-4xl' : 'text-4xl'} ${(card as { flag?: boolean }).flag ? 'text-primary' : 'text-foreground'}`}>
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
            dayOfWeek: isoWeekdayAtOffset(i),
        })).map((day) => ({
            ...day,
            items: planning.filter((entry) => entry.day_of_week === day.dayOfWeek),
        })).filter((day) => day.items.length > 0);

        return (
            <section key="planning">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className="font-serif text-h2">{t('dashboard:planning.title')}</h2>
                    <button
                        type="button"
                        onClick={() => navigate('/planning')}
                        className="flex items-center gap-1 whitespace-nowrap text-caption text-primary underline-offset-4 hover:underline"
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
                                                    {formatTime(entry.start_time)} - {formatTime(entry.end_time)} · {entry.family_member_name}
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

    const markLatestPostSeen = async () => {
        if (!latestPost || latestPost.is_seen) return;

        try {
            await api.post(
                `/api/posts/${latestPost.id}/seen`,
                {}
            );
            void loadLatestPost();
        } catch (e) {
            console.error(
                'Mark latest post seen error:',
                e
            );
        }
    };

    const renderNotes = () => (
        <section key="notes" className="space-y-6">
            {latestPost && (
                <div
                    className={`rounded-card border p-5 ${
                        latestPost.is_seen
                            ? 'border-border bg-card'
                            : 'border-primary/30 bg-primary-soft/10'
                    }`}
                >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <h2 className="font-serif text-h2">
                            {t('dashboard:latestPost.title')}
                        </h2>

                        <button
                            type="button"
                            onClick={() => navigate('/posts')}
                            className="whitespace-nowrap text-caption font-medium text-primary hover:underline"
                        >
                            {t('dashboard:latestPost.viewAll')}
                        </button>
                    </div>

                    <div className="flex items-start gap-3">
                        {latestPost.author_avatar ? (
                            <img
                                src={latestPost.author_avatar}
                                alt={latestPost.author_name}
                                className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                        ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-semibold text-primary">
                                {latestPost.author_name.charAt(0) || '?'}
                            </div>
                        )}

                        <div className="min-w-0 flex-1">
                            <p className="text-caption font-semibold text-foreground">
                                {latestPost.author_name}
                            </p>

                            <p className="text-micro text-muted-foreground">
                                {formatDateTime(latestPost.created_at)}
                            </p>

                            {latestPost.content && (
                                <p className="mt-3 whitespace-pre-wrap break-words text-body">
                                    {latestPost.content}
                                </p>
                            )}

                            {latestPost.image_url && (
                                <img
                                    src={latestPost.image_url}
                                    alt=""
                                    className="mt-3 max-h-64 w-full rounded-card border border-border bg-surface-2 object-contain"
                                />
                            )}

                            {latestPost.link_url && (
                                <a
                                    href={latestPost.link_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 block truncate text-caption text-primary hover:underline"
                                >
                                    {latestPost.link_url}
                                </a>
                            )}

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-micro text-muted-foreground">
                                    {latestPost.seen_by.length
                                        ? t(
                                              'dashboard:latestPost.seenBy',
                                              {
                                                  names: latestPost.seen_by
                                                      .map(
                                                          (
                                                              person
                                                          ) =>
                                                              person.name
                                                      )
                                                      .join(', '),
                                              }
                                          )
                                        : t(
                                              'dashboard:latestPost.notSeen'
                                          )}
                                </p>

                                <button
                                    type="button"
                                    disabled={
                                        latestPost.is_seen
                                    }
                                    onClick={() =>
                                        void markLatestPostSeen()
                                    }
                                    className={`rounded-input px-3 py-1.5 text-caption font-medium ${
                                        latestPost.is_seen
                                            ? 'text-success'
                                            : 'bg-primary-soft text-primary'
                                    }`}
                                >
                                    {latestPost.is_seen
                                        ? t(
                                              'dashboard:latestPost.seen'
                                          )
                                        : t(
                                              'dashboard:latestPost.markSeen'
                                          )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <h2 className="font-serif text-h2 mb-4">
                    {t('notes:title')}
                </h2>
                <FamilyNotes
                    notes={notes}
                    onChanged={() => void loadNotes()}
                />
            </div>
        </section>
    );

    // --- the small cards --------------------------------------------------------------
    const emptyLine = (text: string) => <p className="py-2 text-caption text-muted-foreground">{text}</p>;
    const dayOf = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`);

    const renderTasksCard = () => {
        const open = homeTasks
            .filter((task) => !task.is_completed)
            // What has a date comes first, the nearest first.
            .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
        return (
            <HomeCard icon={CheckSquare} title={t('dashboard:cards.tasks')} count={open.length} allLabel={t('dashboard:cards.seeAll')} onOpen={() => navigate('/tasks')}>
                {open.length === 0 ? emptyLine(t('dashboard:cards.tasksEmpty')) : (
                    <ul className="divide-y divide-border">
                        {open.slice(0, CARD_LINES).map((task) => {
                            const late = task.due_date ? differenceInCalendarDays(dayOf(task.due_date), new Date()) < 0 : false;
                            return (
                                <li key={task.id} className="flex items-center justify-between gap-3 py-2">
                                    <span className="min-w-0">
                                        <span className="block truncate text-caption font-medium text-foreground">{task.title}</span>
                                        {(task.assigned_to_members || []).length > 0 && (
                                            <span className="block truncate text-micro text-muted-foreground">
                                                {(task.assigned_to_members || []).map((member) => member.name).join(', ')}
                                            </span>
                                        )}
                                    </span>
                                    {task.due_date && (
                                        <span className={`shrink-0 text-micro ${late ? 'font-medium text-danger' : 'text-muted-foreground'}`}>
                                            {isSameDay(dayOf(task.due_date), new Date()) ? t('common:actions.today') : format(dayOf(task.due_date), 'd MMM', { locale: dateLocale() })}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </HomeCard>
        );
    };

    const renderMealsCard = () => {
        const meals = [...homeMeals].sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));
        return (
            <HomeCard icon={UtensilsCrossed} title={t('dashboard:cards.meals')} allLabel={t('dashboard:cards.seeAll')} onOpen={() => navigate('/meal-planning')}>
                {meals.length === 0 ? emptyLine(t('dashboard:cards.mealsEmpty')) : (
                    <ul className="divide-y divide-border">
                        {meals.slice(0, CARD_LINES).map((meal) => (
                            <li key={meal.id} className="flex items-baseline justify-between gap-3 py-2">
                                <span className="shrink-0 text-micro uppercase tracking-wide text-muted-foreground">
                                    {t(`meals:mealTypes.${meal.meal_type}`, { defaultValue: meal.meal_type })}
                                </span>
                                <span className="min-w-0 truncate text-right text-caption font-medium text-foreground">
                                    {meal.recipe?.name || meal.recipe_name || meal.custom_meal || ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </HomeCard>
        );
    };

    const renderShoppingCard = () => {
        const toBuy = homeShopping.filter((item) => !item.is_checked);
        return (
            <HomeCard icon={ShoppingCart} title={t('dashboard:cards.shopping')} count={toBuy.length} allLabel={t('dashboard:cards.seeAll')} onOpen={() => navigate('/shopping')}>
                {toBuy.length === 0 ? emptyLine(t('dashboard:cards.shoppingEmpty')) : (
                    <ul className="flex flex-wrap gap-1.5 pt-1">
                        {toBuy.slice(0, 12).map((item) => (
                            <li key={item.id} className="rounded-pill border border-border bg-surface-2 px-2.5 py-1 text-micro text-foreground">
                                {item.name}
                            </li>
                        ))}
                        {toBuy.length > 12 && (
                            <li className="rounded-pill px-2.5 py-1 text-micro text-muted-foreground">+{toBuy.length - 12}</li>
                        )}
                    </ul>
                )}
            </HomeCard>
        );
    };

    const renderBirthdaysCard = () => {
        const coming = [...homeBirthdays].sort((a, b) => a.start_time.localeCompare(b.start_time));
        return (
            <HomeCard icon={Cake} title={t('dashboard:cards.birthdays')} allLabel={t('dashboard:cards.seeAll')} onOpen={() => navigate('/calendar')}>
                {coming.length === 0 ? emptyLine(t('dashboard:cards.birthdaysEmpty')) : (
                    <ul className="divide-y divide-border">
                        {coming.slice(0, CARD_LINES).map((entry) => {
                            const isToday = isSameDay(dayOf(entry.start_time), new Date());
                            return (
                                <li key={entry.occurrence_id || entry.id} className="flex items-center justify-between gap-3 py-2">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color || 'rgb(var(--primary))' }} />
                                        <span className="truncate text-caption font-medium text-foreground">{entry.birthday?.name}</span>
                                        <span className="shrink-0 text-micro text-muted-foreground">
                                            {t('calendar:birthday.age', { count: entry.birthday?.age ?? 0 })}
                                        </span>
                                    </span>
                                    <span className={`shrink-0 text-micro ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                                        {isToday ? t('common:actions.today') : format(dayOf(entry.start_time), 'd MMM', { locale: dateLocale() })}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </HomeCard>
        );
    };

    const renderPantryCard = () => {
        const soon = homePantry
            .filter((item) => item.expires_on && differenceInCalendarDays(dayOf(item.expires_on), new Date()) <= EAT_SOON_DAYS)
            .sort((a, b) => String(a.expires_on).localeCompare(String(b.expires_on)));
        return (
            <HomeCard icon={Refrigerator} title={t('dashboard:cards.eatSoon')} count={soon.length} allLabel={t('dashboard:cards.seeAll')} onOpen={() => navigate('/pantry')}>
                {soon.length === 0 ? emptyLine(t('dashboard:cards.pantryEmpty')) : (
                    <ul className="divide-y divide-border">
                        {soon.slice(0, CARD_LINES).map((item) => {
                            const days = differenceInCalendarDays(dayOf(item.expires_on as string), new Date());
                            const date = format(dayOf(item.expires_on as string), 'd MMM', { locale: dateLocale() });
                            const label = days < 0 ? t('pantry:expiry.past', { date })
                                : days === 0 ? t('pantry:expiry.today')
                                : days <= 3 ? t('pantry:expiry.soon', { count: days })
                                : t('pantry:expiry.date', { date });
                            return (
                                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                                    <span className="min-w-0 truncate text-caption font-medium text-foreground">{item.name}</span>
                                    <span className={`shrink-0 text-micro ${days <= 0 ? 'font-medium text-danger' : days <= 3 ? 'font-medium text-warning' : 'text-muted-foreground'}`}>{label}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </HomeCard>
        );
    };

    // A widget shows when the member has not hidden it AND its module is enabled
    // for the family.
    const isVisible = (key: DashboardWidget) => {
        if (prefs.hidden.includes(key)) return false;
        if (key === 'notes') return isModuleEnabled('notes');
        if (key === 'planning') return isModuleEnabled('planning');
        if (key === 'meals') return isModuleEnabled('meals');
        if (key === 'pantry') return isModuleEnabled('pantry');
        return true;
    };

    const widgetLabels: Record<DashboardWidget, string> = {
        stats: t('dashboard:customize.widgets.stats'),
        agenda: t('dashboard:customize.widgets.agenda'),
        planning: t('dashboard:customize.widgets.planning'),
        quick: t('dashboard:customize.widgets.quick'),
        tasks: t('dashboard:cards.tasks'),
        meals: t('dashboard:cards.meals'),
        shopping: t('dashboard:cards.shopping'),
        birthdays: t('dashboard:cards.birthdays'),
        pantry: t('dashboard:cards.eatSoon'),
        notes: t('dashboard:customize.widgets.notes'),
    };

    const renderWidget = (key: DashboardWidget): React.ReactNode => {
        switch (key) {
            case 'stats': return renderStats();
            case 'agenda': return renderAgenda();
            case 'planning': return renderPlanning();
            case 'quick': return renderQuickAccess();
            case 'tasks': return renderTasksCard();
            case 'meals': return renderMealsCard();
            case 'shopping': return renderShoppingCard();
            case 'birthdays': return renderBirthdaysCard();
            case 'pantry': return renderPantryCard();
            case 'notes': return renderNotes();
            default: return null;
        }
    };

    // The page is a grid: one column on a phone, two on a laptop, three on a
    // wide screen. The key figures, the week's schedules and the notes take a
    // whole row, the agenda two columns, and the small cards one each, filling
    // the room next to and under them in the order the member chose.
    const WIDGET_SPAN: Record<DashboardWidget, string> = {
        stats: 'col-span-full',
        agenda: 'lg:row-span-2 2xl:col-span-2',
        planning: 'col-span-full',
        quick: '',
        tasks: '',
        meals: '',
        shopping: '',
        birthdays: '',
        pantry: '',
        notes: 'col-span-full',
    };
    const visibleOrder = prefs.order.filter(isVisible);
    const blocks = visibleOrder.map((key) => (
        <div key={key} className={`min-w-0 ${WIDGET_SPAN[key]}`}>{renderWidget(key)}</div>
    ));

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

            <div className="grid grid-cols-1 gap-6 [grid-auto-flow:row_dense] lg:grid-cols-2 2xl:grid-cols-3">
                {blocks}
            </div>

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
