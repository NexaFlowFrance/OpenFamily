import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { api } from '../lib/api';
import {
    ShoppingCart,
    CheckSquare,
    Calendar,
    Wallet,
    AlertCircle,
    Activity,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Minus,
    UtensilsCrossed,
    CalendarClock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../lib/useCurrency';
import WeatherClothingCard from '../components/app/WeatherClothingCard';
import HouseAlertsCard from '../components/app/HouseAlertsCard';
import TodayTasksCard from '../components/app/TodayTasksCard';

interface KpiPayload {
    budget: {
        thisMonth: number;
        lastMonth: number;
        deltaRatio: number | null;
        topCategory: { category: string; amount: number } | null;
    };
    shopping: { total: number; checked: number; pending: number };
    mealPlanning: { plannedDays: number; totalDays: number };
    nextAppointment: { id: string; title: string; startTime: string } | null;
    overdueTasks: number;
}

interface DashboardStats {
    upcomingAppointments: number;
    pendingTasks: number;
    shoppingItems: number;
    thisMonthExpenses: number;
    budgetAlerts: number;
    kpis?: KpiPayload;
}

// =============================================================================
// QuickOverviewKpis
//
// Four concrete, time-anchored signals that replaced the original decorative
// "welcome to Nexus" banner. Each tile is its own self-contained KPI with a
// number, a one-line interpretation, and a click-through to the relevant page.
// Designed to degrade gracefully: if the backend hasn't been updated yet
// (`stats.kpis` undefined) the component falls back to a compact placeholder
// instead of crashing.
// =============================================================================
interface QuickOverviewKpisProps {
    stats: DashboardStats | null;
    formatMoney: (n: number, opts?: { maximumFractionDigits?: number }) => string;
    navigate: (path: string) => void;
}

const formatRelativeDate = (iso: string, t: TFunction, locale: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (24 * 3600 * 1000));
    if (diffDays === 0) return t('dashboard.relative_date.today');
    if (diffDays === 1) return t('dashboard.relative_date.tomorrow');
    if (diffDays > 1 && diffDays < 7)
        return t('dashboard.relative_date.in_days', { count: diffDays });
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

const QuickOverviewKpis: React.FC<QuickOverviewKpisProps> = ({ stats, formatMoney, navigate }) => {
    const { t, i18n } = useTranslation();
    const dateLocale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
    const kpis = stats?.kpis;
    if (!kpis) {
        return (
            <p className="text-caption text-muted-foreground">
                {t('dashboard.quick_overview.empty')}
            </p>
        );
    }

    // Shopping progress: percentage of the active list that's been checked off.
    const shoppingProgress =
        kpis.shopping.total > 0
            ? Math.round((kpis.shopping.checked / kpis.shopping.total) * 100)
            : 0;

    // Budget trend: pick the trend icon + tone from the delta ratio.
    const delta = kpis.budget.deltaRatio;
    const budgetTrend: {
        Icon: typeof TrendingUp;
        label: string;
        tone: 'good' | 'bad' | 'neutral';
    } = (() => {
        if (delta === null)
            return { Icon: Minus, label: t('dashboard.kpi.no_comparison'), tone: 'neutral' };
        const pct = Math.round(delta * 100);
        if (Math.abs(pct) < 5)
            return { Icon: Minus, label: t('dashboard.kpi.stable'), tone: 'neutral' };
        if (pct > 0)
            return {
                Icon: TrendingUp,
                label: t('dashboard.kpi.up', { pct }),
                tone: 'bad', // more spending = bad signal
            };
        return {
            Icon: TrendingDown,
            label: t('dashboard.kpi.down', { pct }),
            tone: 'good',
        };
    })();

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* KPI 1: Budget trend */}
            <button
                type="button"
                onClick={() => navigate('/budget')}
                className="text-left rounded-nexus border border-border/50 bg-card p-4 hover:border-primary/40 transition-colors"
            >
                <div className="flex items-center gap-2 text-label text-muted-foreground mb-2">
                    <Wallet className="h-4 w-4" />
                    {t('dashboard.kpi.month_expenses')}
                </div>
                <div className="text-h2 text-foreground">
                    {formatMoney(kpis.budget.thisMonth, { maximumFractionDigits: 0 })}
                </div>
                <div
                    className={`flex items-center gap-1 text-caption mt-2 ${
                        budgetTrend.tone === 'bad'
                            ? 'text-destructive'
                            : budgetTrend.tone === 'good'
                              ? 'text-success'
                              : 'text-muted-foreground'
                    }`}
                >
                    <budgetTrend.Icon className="h-4 w-4" />
                    <span>{budgetTrend.label}</span>
                </div>
                {kpis.budget.topCategory ? (
                    <p className="text-micro text-muted-foreground mt-1">
                        {t('dashboard.kpi.top_category')}{' '}
                        <span className="font-medium">{kpis.budget.topCategory.category}</span> (
                        {formatMoney(kpis.budget.topCategory.amount, { maximumFractionDigits: 0 })})
                    </p>
                ) : null}
            </button>

            {/* KPI 2: Shopping list progress */}
            <button
                type="button"
                onClick={() => navigate('/shopping')}
                className="text-left rounded-nexus border border-border/50 bg-card p-4 hover:border-primary/40 transition-colors"
            >
                <div className="flex items-center gap-2 text-label text-muted-foreground mb-2">
                    <ShoppingCart className="h-4 w-4" />
                    {t('dashboard.kpi.shopping_list')}
                </div>
                <div className="text-h2 text-foreground">
                    {kpis.shopping.pending}{' '}
                    <span className="text-body text-muted-foreground">
                        {t('dashboard.kpi.to_buy')}
                    </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                        className="h-full bg-success transition-all"
                        style={{ width: `${shoppingProgress}%` }}
                        aria-label={t('dashboard.kpi.checked_aria', { pct: shoppingProgress })}
                    />
                </div>
                <p className="text-micro text-muted-foreground mt-1">
                    {t('dashboard.kpi.checked_progress', {
                        checked: kpis.shopping.checked,
                        total: kpis.shopping.total,
                        pct: shoppingProgress,
                    })}
                </p>
            </button>

            {/* KPI 3: Meal planning coverage */}
            <button
                type="button"
                onClick={() => navigate('/meal-planning')}
                className="text-left rounded-nexus border border-border/50 bg-card p-4 hover:border-primary/40 transition-colors"
            >
                <div className="flex items-center gap-2 text-label text-muted-foreground mb-2">
                    <UtensilsCrossed className="h-4 w-4" />
                    {t('dashboard.kpi.planned_meals')}
                </div>
                <div className="text-h2 text-foreground">
                    {kpis.mealPlanning.plannedDays}
                    <span className="text-body text-muted-foreground">
                        {t('dashboard.kpi.days_suffix', { total: kpis.mealPlanning.totalDays })}
                    </span>
                </div>
                <div className="flex gap-1 mt-2">
                    {Array.from({ length: kpis.mealPlanning.totalDays }, (_, i) => (
                        <div
                            key={i}
                            className={`h-2 flex-1 rounded-full ${
                                i < kpis.mealPlanning.plannedDays ? 'bg-warning' : 'bg-muted'
                            }`}
                        />
                    ))}
                </div>
                <p className="text-micro text-muted-foreground mt-1">
                    {kpis.mealPlanning.plannedDays === kpis.mealPlanning.totalDays
                        ? t('dashboard.kpi.week_complete')
                        : t('dashboard.kpi.days_to_plan', {
                              count: kpis.mealPlanning.totalDays - kpis.mealPlanning.plannedDays,
                          })}
                </p>
            </button>

            {/* KPI 4: Next appointment + overdue tasks */}
            <button
                type="button"
                onClick={() => navigate('/calendar')}
                className="text-left rounded-nexus border border-border/50 bg-card p-4 hover:border-primary/40 transition-colors"
            >
                <div className="flex items-center gap-2 text-label text-muted-foreground mb-2">
                    <CalendarClock className="h-4 w-4" />
                    {t('dashboard.kpi.next_appointment')}
                </div>
                {kpis.nextAppointment ? (
                    <>
                        <div className="text-body font-semibold text-foreground truncate">
                            {kpis.nextAppointment.title}
                        </div>
                        <p className="text-caption text-primary mt-1">
                            {formatRelativeDate(kpis.nextAppointment.startTime, t, dateLocale)}
                        </p>
                    </>
                ) : (
                    <p className="text-body text-muted-foreground">
                        {t('dashboard.kpi.none_upcoming')}
                    </p>
                )}
                {kpis.overdueTasks > 0 ? (
                    <p className="text-caption text-destructive mt-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t('dashboard.kpi.overdue_tasks', { count: kpis.overdueTasks })}
                    </p>
                ) : (
                    <p className="text-micro text-muted-foreground mt-2">
                        {t('dashboard.kpi.no_overdue')}
                    </p>
                )}
            </button>
        </div>
    );
};

const Dashboard: React.FC = () => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { format: formatMoney } = useCurrency();

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const response = await api.get<{ success: boolean; data: DashboardStats }>(
                '/api/dashboard',
            );
            if (response.success) {
                setStats(response.data);
            }
        } catch (error) {
            console.error('Failed to load dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">
                        {t('dashboard.loading')}
                    </p>
                </div>
            </div>
        );
    }

    const statCards = [
        {
            key: 'upcoming_appointments',
            title: t('dashboard.stat_cards.upcoming_appointments'),
            value: stats?.upcomingAppointments || 0,
            icon: Calendar,
            color: 'text-info',
            bgColor: 'bg-info-soft',
            borderColor: 'border-info/20',
            href: '/calendar',
        },
        {
            key: 'pending_tasks',
            title: t('dashboard.stat_cards.pending_tasks'),
            value: stats?.pendingTasks || 0,
            icon: CheckSquare,
            color: 'text-success',
            bgColor: 'bg-success-soft',
            borderColor: 'border-success/20',
            href: '/tasks',
        },
        {
            key: 'shopping_items',
            title: t('dashboard.stat_cards.shopping_items'),
            value: stats?.shoppingItems || 0,
            icon: ShoppingCart,
            color: 'text-primary',
            bgColor: 'bg-primary-soft',
            borderColor: 'border-primary/20',
            href: '/shopping',
        },
        {
            key: 'month_expenses',
            title: t('dashboard.stat_cards.month_expenses'),
            value: formatMoney(Number(stats?.thisMonthExpenses || 0), { maximumFractionDigits: 0 }),
            icon: Wallet,
            color: 'text-warning',
            bgColor: 'bg-warning-soft',
            borderColor: 'border-warning/20',
            href: '/budget',
        },
    ];

    return (
        <div className="space-y-8 animate-accordion-down">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 text-foreground mb-1">{t('dashboard.greeting')}</h1>
                    <p className="text-muted-foreground text-body">{t('dashboard.subtitle')}</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" size="sm" onClick={() => navigate('/calendar')}>
                        <Activity className="w-4 h-4 mr-2" />
                        {t('dashboard.see_activity')}
                    </Button>
                </div>
            </div>

            {stats && stats.budgetAlerts > 0 && (
                <div className="bg-warning-soft border border-warning/30 rounded-nexus p-4 flex items-start gap-4 shadow-nexus-sm animate-pulse">
                    <div className="p-2 bg-warning/20 rounded-full shrink-0">
                        <AlertCircle className="h-5 w-5 text-warning" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-foreground text-body-sm">
                            {t('dashboard.budget_alert.title')}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t('dashboard.budget_alert.description', {
                                count: stats.budgetAlerts,
                            })}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => navigate('/budget')}
                        className="bg-warning hover:bg-warning/90 text-foreground shrink-0 shadow-none border-0"
                    >
                        {t('dashboard.budget_alert.see_detail')}
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Card
                            key={card.key}
                            className={`border ${card.borderColor} bg-card group cursor-pointer`}
                            onClick={() => navigate(card.href)}
                        >
                            <CardContent className="p-6 flex items-start justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground font-medium mb-1">
                                        {card.title}
                                    </p>
                                    <h3 className="text-3xl font-bold text-foreground tracking-tight group-hover:scale-105 transition-transform origin-left">
                                        {card.value}
                                    </h3>
                                </div>
                                <div
                                    className={`p-3 rounded-nexus ${card.bgColor} group-hover:rotate-6 transition-transform`}
                                >
                                    <Icon className={`h-6 w-6 ${card.color}`} />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <TodayTasksCard />

            <WeatherClothingCard />

            <HouseAlertsCard />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 shadow-nexus border-none">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xl">
                            {t('dashboard.quick_overview.title')}
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/calendar')}
                            className="text-primary hover:text-primary/80 hover:bg-primary-soft"
                        >
                            {t('dashboard.quick_overview.see_all')}{' '}
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <QuickOverviewKpis
                            stats={stats}
                            formatMoney={formatMoney}
                            navigate={navigate}
                        />
                    </CardContent>
                </Card>

                <Card className="shadow-nexus border-none h-full">
                    <CardHeader>
                        <CardTitle className="text-xl">
                            {t('dashboard.quick_start.title')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <button
                            type="button"
                            onClick={() => navigate('/family')}
                            className="w-full p-4 text-left bg-surface rounded-nexus hover:bg-primary-soft transition-colors cursor-pointer group border border-transparent hover:border-primary/20"
                        >
                            <h3 className="font-semibold text-body-sm mb-1 group-hover:text-primary transition-colors flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px]">
                                    1
                                </span>
                                {t('dashboard.quick_start.add_family_title')}
                            </h3>
                            <p className="text-label text-muted-foreground pl-7">
                                {t('dashboard.quick_start.add_family_desc')}
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/meal-planning')}
                            className="w-full p-4 text-left bg-surface rounded-nexus hover:bg-primary-soft transition-colors cursor-pointer group border border-transparent hover:border-primary/20"
                        >
                            <h3 className="font-semibold text-body-sm mb-1 group-hover:text-primary transition-colors flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px]">
                                    2
                                </span>
                                {t('dashboard.quick_start.plan_meals_title')}
                            </h3>
                            <p className="text-label text-muted-foreground pl-7">
                                {t('dashboard.quick_start.plan_meals_desc')}
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/budget')}
                            className="w-full p-4 text-left bg-surface rounded-nexus hover:bg-primary-soft transition-colors cursor-pointer group border border-transparent hover:border-primary/20"
                        >
                            <h3 className="font-semibold text-body-sm mb-1 group-hover:text-primary transition-colors flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px]">
                                    3
                                </span>
                                {t('dashboard.quick_start.track_budget_title')}
                            </h3>
                            <p className="text-label text-muted-foreground pl-7">
                                {t('dashboard.quick_start.track_budget_desc')}
                            </p>
                        </button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
