import React, { useEffect, useState, useCallback } from 'react';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import {
    Plus, ChevronLeft, ChevronRight, Check, RefreshCw,
    Trash2, Edit2, TrendingUp, TrendingDown, Wallet, Eye,
    X, Calendar, BarChart3, AlertTriangle, Lock
} from 'lucide-react';
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, Legend,
} from 'recharts';
import ChartCard from '../components/app/ChartCard';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecurringExpense {
    id: string;
    label: string;
    amount: number;
    category: string;
    debit_day: number;
    is_active: boolean;
    is_pointed: boolean;
    pointed_at?: string;
}

interface BudgetEntry {
    id: string;
    category: string;
    amount: number;
    description?: string;
    date: string;
    is_expense: boolean;
}

interface Forecast {
    income: number;
    oneTimeExpenses: number;
    pointedRecurring: number;
    unpointedRecurring: number;
    currentBalance: number;
    forecastBalance: number;
}

interface CategoryStat {
    category: string;
    category_total: number;
}

interface BudgetStatistics {
    totalExpenses: number;
    totalIncome: number;
    balance: number;
    byCategory: CategoryStat[];
}

interface MonthlyStat {
    month: number;
    totalExpenses: number;
    totalIncome: number;
    balance: number;
}

interface BudgetLimit {
    id: string;
    category: string;
    monthly_limit: number;
    month: number;
    year: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
    'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
    'Abonnements', 'Assurance', 'Enfants', 'Maison', 'Autre',
];

const CHART_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

const toNumber = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = parseFloat(v); return isFinite(n) ? n : 0; }
    return 0;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({
    open, onClose, title, children
}) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
                className="relative bg-background rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-2 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
};

const Field: React.FC<{
    label: string;
    type?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    required?: boolean;
    min?: string;
    step?: string;
}> = ({ label, type = 'text', value, onChange, placeholder, required, min, step }) => (
    <div>
        <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            required={required}
            min={min}
            step={step}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface-1 text-foreground text-base
                       focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
        />
    </div>
);

const CategorySelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <div>
        <label className="block text-sm font-medium text-foreground mb-1">Catégorie</label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface-1 text-foreground text-base
                       focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
        >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Budget: React.FC = () => {
    const { user } = useAuth();
    const currency = user?.currency || 'EUR';
    const canEdit = Boolean(user?.is_owner) || (user?.role ?? '').toLowerCase() !== 'enfant';

    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

    const [forecast, setForecast] = useState<Forecast | null>(null);
    const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
    const [entries, setEntries] = useState<BudgetEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const [stats, setStats] = useState<BudgetStatistics | null>(null);
    const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
    const [limits, setLimits] = useState<BudgetLimit[]>([]);
    const [showAnalytics, setShowAnalytics] = useState(false);

    const [sheetRecurring, setSheetRecurring] = useState(false);
    const [sheetEntry, setSheetEntry] = useState(false);
    const [sheetLimit, setSheetLimit] = useState(false);
    const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
    const [editingEntry, setEditingEntry] = useState<BudgetEntry | null>(null);

    const [recurringForm, setRecurringForm] = useState({ label: '', amount: '', category: 'Maison', debit_day: '1' });
    const [entryForm, setEntryForm] = useState({
        description: '', amount: '', category: 'Alimentation',
        date: format(new Date(), 'yyyy-MM-dd'), is_expense: true,
    });
    const [limitForm, setLimitForm] = useState({ category: 'Alimentation', monthly_limit: '' });
    const [formError, setFormError] = useState('');

    const startOfMonth = useCallback(() =>
        new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0],
        [currentYear, currentMonth]
    );
    const endOfMonth = useCallback(() =>
        new Date(currentYear, currentMonth, 0).toISOString().split('T')[0],
        [currentYear, currentMonth]
    );

    const loadAll = useCallback(async () => {
        try {
            const [forecastRes, recurringRes, entriesRes, statsRes, monthlyRes, limitsRes] = await Promise.all([
                api.get<{ success: boolean; data: Forecast }>(
                    `/api/budget/forecast?month=${currentMonth}&year=${currentYear}`
                ),
                api.get<{ success: boolean; data: RecurringExpense[] }>(
                    `/api/budget/recurring?month=${currentMonth}&year=${currentYear}`
                ),
                api.get<{ success: boolean; data: BudgetEntry[] }>(
                    `/api/budget/entries?start_date=${startOfMonth()}&end_date=${endOfMonth()}`
                ),
                api.get<{ success: boolean; data: BudgetStatistics }>(
                    `/api/budget/statistics?month=${currentMonth}&year=${currentYear}`
                ),
                api.get<{ success: boolean; data: MonthlyStat[] }>(
                    `/api/budget/statistics/monthly?year=${currentYear}`
                ),
                api.get<{ success: boolean; data: BudgetLimit[] }>(
                    `/api/budget/limits?month=${currentMonth}&year=${currentYear}`
                ),
            ]);
            if (forecastRes.success) setForecast(forecastRes.data);
            if (recurringRes.success) setRecurring(recurringRes.data.map((r) => ({
                ...r,
                amount: toNumber(r.amount),
                debit_day: toNumber(r.debit_day),
            })));
            if (entriesRes.success) setEntries(entriesRes.data.map((e) => ({
                ...e,
                amount: toNumber(e.amount),
            })));
            if (statsRes.success) setStats(statsRes.data);
            if (monthlyRes.success) setMonthly(monthlyRes.data);
            if (limitsRes.success) setLimits(limitsRes.data.map((l) => ({ ...l, monthly_limit: toNumber(l.monthly_limit) })));
        } catch (err) {
            console.error('Budget load error', err);
        } finally {
            setLoading(false);
        }
    }, [currentMonth, currentYear, startOfMonth, endOfMonth]);

    useEffect(() => { void loadAll(); }, [loadAll]);
    useWebSocketUpdates('budget', () => { void loadAll(); });

    const navigateMonth = (dir: -1 | 1) => {
        let m = currentMonth + dir;
        let y = currentYear;
        if (m < 1) { m = 12; y -= 1; }
        if (m > 12) { m = 1; y += 1; }
        setCurrentMonth(m);
        setCurrentYear(y);
    };

    const handleTogglePoint = async (r: RecurringExpense) => {
        const newValue = !r.is_pointed;
        setRecurring((prev) => prev.map((x) => x.id === r.id ? { ...x, is_pointed: newValue } : x));
        setForecast((prev) => {
            if (!prev) return prev;
            const delta = r.amount;
            if (newValue) {
                return {
                    ...prev,
                    pointedRecurring: prev.pointedRecurring + delta,
                    unpointedRecurring: prev.unpointedRecurring - delta,
                    currentBalance: prev.currentBalance - delta,
                };
            } else {
                return {
                    ...prev,
                    pointedRecurring: prev.pointedRecurring - delta,
                    unpointedRecurring: prev.unpointedRecurring + delta,
                    currentBalance: prev.currentBalance + delta,
                };
            }
        });
        try {
            await api.post(`/api/budget/recurring/${r.id}/point`, {
                month: currentMonth, year: currentYear, is_pointed: newValue,
            });
        } catch {
            void loadAll();
        }
    };

    const openNewRecurring = () => {
        setEditingRecurring(null);
        setRecurringForm({ label: '', amount: '', category: 'Maison', debit_day: '1' });
        setFormError('');
        setSheetRecurring(true);
    };

    const openEditRecurring = (r: RecurringExpense) => {
        setEditingRecurring(r);
        setRecurringForm({
            label: r.label,
            amount: r.amount.toString(),
            category: r.category,
            debit_day: r.debit_day.toString(),
        });
        setFormError('');
        setSheetRecurring(true);
    };

    const handleSaveRecurring = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        const amount = parseFloat(recurringForm.amount.replace(',', '.'));
        const day = parseInt(recurringForm.debit_day, 10);
        if (!isFinite(amount) || amount <= 0) { setFormError('Montant invalide.'); return; }
        if (!recurringForm.label.trim()) { setFormError('Nom requis.'); return; }
        if (day < 1 || day > 31) { setFormError('Jour de débit invalide (1-31).'); return; }
        try {
            if (editingRecurring) {
                await api.put(`/api/budget/recurring/${editingRecurring.id}`, {
                    label: recurringForm.label.trim(), amount, category: recurringForm.category, debit_day: day,
                });
            } else {
                await api.post('/api/budget/recurring', {
                    label: recurringForm.label.trim(), amount, category: recurringForm.category, debit_day: day,
                });
            }
            setSheetRecurring(false);
            void loadAll();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
        }
    };

    const handleDeleteRecurring = async (id: string) => {
        if (!confirm('Supprimer ce prélèvement récurrent ?')) return;
        try { await api.delete(`/api/budget/recurring/${id}`); void loadAll(); } catch { /* ignore */ }
    };

    const openNewEntry = (isExpense: boolean) => {
        setEditingEntry(null);
        setEntryForm({
            description: '', amount: '',
            category: isExpense ? 'Alimentation' : 'Logement',
            date: format(new Date(), 'yyyy-MM-dd'),
            is_expense: isExpense,
        });
        setFormError('');
        setSheetEntry(true);
    };

    const openEditEntry = (entry: BudgetEntry) => {
        setEditingEntry(entry);
        setEntryForm({
            description: entry.description || '', amount: entry.amount.toString(),
            category: entry.category, date: entry.date.split('T')[0], is_expense: entry.is_expense,
        });
        setFormError('');
        setSheetEntry(true);
    };

    const handleSaveEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        const amount = parseFloat(entryForm.amount.replace(',', '.'));
        if (!isFinite(amount) || amount <= 0) { setFormError('Montant invalide.'); return; }
        try {
            if (editingEntry) {
                await api.put(`/api/budget/entries/${editingEntry.id}`, {
                    category: entryForm.category, amount, description: entryForm.description,
                    date: entryForm.date, is_expense: entryForm.is_expense,
                });
            } else {
                await api.post('/api/budget/entries', {
                    category: entryForm.category, amount, description: entryForm.description,
                    date: entryForm.date, is_expense: entryForm.is_expense,
                });
            }
            setSheetEntry(false);
            void loadAll();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
        }
    };

    const handleDeleteEntry = async (id: string) => {
        if (!confirm('Supprimer cette entrée ?')) return;
        try { await api.delete(`/api/budget/entries/${id}`); void loadAll(); } catch { /* ignore */ }
    };

    const openLimitSheet = (category?: string) => {
        const existing = category ? limits.find((l) => l.category === category) : undefined;
        setLimitForm({
            category: category || 'Alimentation',
            monthly_limit: existing ? existing.monthly_limit.toString() : '',
        });
        setFormError('');
        setSheetLimit(true);
    };

    const handleSaveLimit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        const limit = parseFloat(limitForm.monthly_limit.replace(',', '.'));
        if (!isFinite(limit) || limit < 0) { setFormError('Plafond invalide.'); return; }
        try {
            await api.post('/api/budget/limits', {
                category: limitForm.category,
                monthly_limit: limit,
                month: currentMonth,
                year: currentYear,
            });
            setSheetLimit(false);
            void loadAll();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
        }
    };

    // Spending per category this month (expenses only), used for limit progress.
    const spentByCategory = React.useMemo(() => {
        const map: Record<string, number> = {};
        for (const e of entries) {
            if (e.is_expense) map[e.category] = (map[e.category] || 0) + e.amount;
        }
        return map;
    }, [entries]);

    const limitAlerts = limits
        .map((l) => ({ ...l, spent: spentByCategory[l.category] || 0 }))
        .filter((l) => l.monthly_limit > 0 && l.spent >= l.monthly_limit * 0.8);

    const expenses = entries.filter((e) => e.is_expense);
    const incomes = entries.filter((e) => !e.is_expense);
    const pointedCount = recurring.filter((r) => r.is_pointed).length;

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">Chargement du budget…</p>
                </div>
            </div>
        );
    }

    const balancePositive = (forecast?.currentBalance ?? 0) >= 0;
    const forecastPositive = (forecast?.forecastBalance ?? 0) >= 0;

    return (
        <div className="max-w-2xl mx-auto pb-24">

            {/* Navigation mois */}
            <div className="flex items-center justify-between px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
                <button
                    onClick={() => navigateMonth(-1)}
                    className="p-2 rounded-full hover:bg-surface-2 active:scale-95 transition-all"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-lg font-semibold capitalize">
                    {format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy', { locale: fr })}
                </span>
                <button
                    onClick={() => navigateMonth(1)}
                    className="p-2 rounded-full hover:bg-surface-2 active:scale-95 transition-all"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            <div className="px-4 pt-4 space-y-3">

                {/* Bannière lecture seule (enfant) */}
                {!canEdit && (
                    <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                            Mode lecture seule — seuls les parents peuvent modifier le budget.
                        </p>
                    </div>
                )}

                {/* Alertes de plafond */}
                {limitAlerts.length > 0 && (
                    <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <p className="text-sm font-medium text-red-600">Plafonds atteints</p>
                        </div>
                        {limitAlerts.map((l) => (
                            <p key={l.id} className="text-xs text-red-600/90 pl-6">
                                {l.category} : {formatCurrency(l.spent, currency)} / {formatCurrency(l.monthly_limit, currency)}
                                {l.spent >= l.monthly_limit ? ' — dépassé' : ' (≥ 80 %)'}
                            </p>
                        ))}
                    </div>
                )}


                <div className={`rounded-2xl p-5 ${balancePositive ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <Wallet className={`w-4 h-4 ${balancePositive ? 'text-emerald-600' : 'text-red-500'}`} />
                        <span className="text-sm font-medium text-muted-foreground">Solde actuel</span>
                    </div>
                    <p className={`text-4xl font-bold tracking-tight ${balancePositive ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatCurrency(forecast?.currentBalance ?? 0, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {pointedCount} prélèvement{pointedCount !== 1 ? 's' : ''} pointé{pointedCount !== 1 ? 's' : ''}
                        {' '}· {expenses.length} dépense{expenses.length !== 1 ? 's' : ''}
                    </p>
                </div>

                {/* Prévisionnel */}
                {forecast && forecast.unpointedRecurring > 0 && (
                    <div className={`rounded-2xl p-4 border-2 ${forecastPositive ? 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20' : 'border-orange-200 bg-orange-50/50 dark:bg-orange-950/20'}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <Eye className={`w-4 h-4 ${forecastPositive ? 'text-blue-500' : 'text-orange-500'}`} />
                            <span className="text-sm font-medium text-muted-foreground">Prévisionnel</span>
                        </div>
                        <p className={`text-3xl font-bold ${forecastPositive ? 'text-blue-600' : 'text-orange-500'}`}>
                            {formatCurrency(forecast.forecastBalance, currency)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Encore {formatCurrency(forecast.unpointedRecurring, currency)} de prélèvements à pointer
                        </p>
                    </div>
                )}

                {/* Analyse & plafonds */}
                <section className="pt-1">
                    <button
                        onClick={() => setShowAnalytics((v) => !v)}
                        className="w-full flex items-center justify-between rounded-2xl bg-surface-1 border border-border p-4 active:scale-[0.99] transition-transform"
                    >
                        <span className="flex items-center gap-2 font-semibold text-base">
                            <BarChart3 className="w-4 h-4 text-primary" />
                            Analyse & plafonds
                        </span>
                        <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform ${showAnalytics ? 'rotate-90' : ''}`} />
                    </button>

                    {showAnalytics && (
                        <div className="space-y-3 mt-3">
                            {/* Répartition par catégorie */}
                            <ChartCard
                                title="Dépenses par catégorie"
                                subtitle={format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy', { locale: fr })}
                            >
                                {stats && stats.byCategory.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={240}>
                                        <PieChart>
                                            <Pie
                                                data={stats.byCategory}
                                                dataKey="category_total"
                                                nameKey="category"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={80}
                                                label={(e: any) => e.category}
                                            >
                                                {stats.byCategory.map((_, i) => (
                                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-8">Aucune dépense ce mois</p>
                                )}
                            </ChartCard>

                            {/* Évolution mensuelle */}
                            <ChartCard title="Évolution sur l'année" subtitle={`${currentYear}`}>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={monthly.map((m) => ({
                                        mois: format(new Date(currentYear, m.month - 1), 'MMM', { locale: fr }),
                                        Dépenses: m.totalExpenses,
                                        Revenus: m.totalIncome,
                                    }))}>
                                        <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} width={40} />
                                        <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="Revenus" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="Dépenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Plafonds par catégorie */}
                            <ChartCard
                                title="Plafonds mensuels"
                                subtitle="Suivi des dépenses par catégorie"
                                action={canEdit ? (
                                    <button
                                        onClick={() => openLimitSheet()}
                                        className="flex items-center gap-1 text-sm font-medium text-primary active:scale-95 transition-transform"
                                    >
                                        <Plus className="w-4 h-4" /> Définir
                                    </button>
                                ) : undefined}
                            >
                                {limits.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-6">
                                        Aucun plafond défini
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {limits.map((l) => {
                                            const spent = spentByCategory[l.category] || 0;
                                            const ratio = l.monthly_limit > 0 ? Math.min(spent / l.monthly_limit, 1) : 0;
                                            const over = spent >= l.monthly_limit && l.monthly_limit > 0;
                                            const warn = ratio >= 0.8 && !over;
                                            return (
                                                <button
                                                    key={l.id}
                                                    onClick={() => canEdit && openLimitSheet(l.category)}
                                                    className="w-full text-left"
                                                    disabled={!canEdit}
                                                >
                                                    <div className="flex items-center justify-between text-sm mb-1">
                                                        <span className="font-medium">{l.category}</span>
                                                        <span className={over ? 'text-red-500 font-semibold' : warn ? 'text-amber-600' : 'text-muted-foreground'}>
                                                            {formatCurrency(spent, currency)} / {formatCurrency(l.monthly_limit, currency)}
                                                        </span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                            style={{ width: `${ratio * 100}%` }}
                                                        />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </ChartCard>
                        </div>
                    )}
                </section>

                {/* Prélèvements récurrents */}
                <section>
                    <div className="flex items-center justify-between mb-2 mt-4">
                        <div className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-muted-foreground" />
                            <h2 className="font-semibold text-base">Prélèvements</h2>
                            {recurring.length > 0 && (
                                <span className="text-xs bg-surface-2 text-muted-foreground px-2 py-0.5 rounded-full">
                                    {pointedCount}/{recurring.length}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={openNewRecurring}
                            disabled={!canEdit}
                            className="flex items-center gap-1.5 text-sm font-medium text-primary active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <Plus className="w-4 h-4" />
                            Ajouter
                        </button>
                    </div>

                    {recurring.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                            <RefreshCw className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                            <p className="text-sm text-muted-foreground">Aucun prélèvement récurrent</p>
                            {canEdit && (
                                <button onClick={openNewRecurring} className="mt-2 text-sm text-primary font-medium">
                                    + Ajouter un prélèvement
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recurring.map((r) => (
                                <div
                                    key={r.id}
                                    className={`flex items-center gap-3 rounded-2xl p-4 transition-all
                                        ${r.is_pointed ? 'bg-surface-1 opacity-60' : 'bg-surface-1 border border-border shadow-sm'}`}
                                >
                                    <button
                                        onClick={() => handleTogglePoint(r)}
                                        disabled={!canEdit}
                                        className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center
                                            transition-all active:scale-90 disabled:opacity-50
                                            ${r.is_pointed ? 'bg-emerald-500 border-emerald-500' : 'border-border hover:border-emerald-400'}`}
                                        title={r.is_pointed ? 'Dépointer' : 'Marquer comme débité'}
                                    >
                                        {r.is_pointed && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                                    </button>

                                    <div className="flex-1 min-w-0">
                                        <p className={`font-medium text-base truncate ${r.is_pointed ? 'line-through text-muted-foreground' : ''}`}>
                                            {r.label}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-muted-foreground">{r.category}</span>
                                            <span className="text-xs text-muted-foreground">·</span>
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Calendar className="w-3 h-3" />
                                                j. {r.debit_day}
                                            </span>
                                        </div>
                                    </div>

                                    <span className={`text-base font-bold flex-shrink-0 ${r.is_pointed ? 'text-muted-foreground' : 'text-red-500'}`}>
                                        -{formatCurrency(r.amount, currency)}
                                    </span>

                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {canEdit && (
                                            <>
                                                <button
                                                    onClick={() => openEditRecurring(r)}
                                                    className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteRecurring(r.id)}
                                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Dépenses ponctuelles */}
                <section>
                    <div className="flex items-center justify-between mb-2 mt-4">
                        <div className="flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-red-500" />
                            <h2 className="font-semibold text-base">Dépenses</h2>
                            {expenses.length > 0 && (
                                <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-medium">
                                    -{formatCurrency(expenses.reduce((s, e) => s + e.amount, 0), currency)}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => openNewEntry(true)}
                            disabled={!canEdit}
                            className="flex items-center gap-1.5 text-sm font-medium text-primary active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <Plus className="w-4 h-4" />
                            Ajouter
                        </button>
                    </div>

                    {expenses.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border p-5 text-center">
                            <p className="text-sm text-muted-foreground">Aucune dépense ce mois</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {expenses.map((entry) => (
                                <EntryRow
                                    key={entry.id}
                                    entry={entry}
                                    currency={currency}
                                    canEdit={canEdit}
                                    onEdit={openEditEntry}
                                    onDelete={handleDeleteEntry}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* Revenus */}
                <section>
                    <div className="flex items-center justify-between mb-2 mt-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            <h2 className="font-semibold text-base">Revenus</h2>
                            {incomes.length > 0 && (
                                <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-medium">
                                    +{formatCurrency(incomes.reduce((s, e) => s + e.amount, 0), currency)}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => openNewEntry(false)}
                            disabled={!canEdit}
                            className="flex items-center gap-1.5 text-sm font-medium text-primary active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <Plus className="w-4 h-4" />
                            Ajouter
                        </button>
                    </div>

                    {incomes.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border p-5 text-center">
                            <p className="text-sm text-muted-foreground">Aucun revenu ce mois</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {incomes.map((entry) => (
                                <EntryRow
                                    key={entry.id}
                                    entry={entry}
                                    currency={currency}
                                    canEdit={canEdit}
                                    onEdit={openEditEntry}
                                    onDelete={handleDeleteEntry}
                                />
                            ))}
                        </div>
                    )}
                </section>

            </div>

            {/* Sheet : prélèvement récurrent */}
            <Sheet
                open={sheetRecurring}
                onClose={() => setSheetRecurring(false)}
                title={editingRecurring ? 'Modifier le prélèvement' : 'Nouveau prélèvement'}
            >
                <form onSubmit={handleSaveRecurring} className="space-y-4">
                    {formError && (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                            {formError}
                        </div>
                    )}
                    <Field
                        label="Nom du prélèvement"
                        value={recurringForm.label}
                        onChange={(v) => setRecurringForm((f) => ({ ...f, label: v }))}
                        placeholder="Ex : Loyer, EDF, Netflix…"
                        required
                    />
                    <Field
                        label={`Montant (${currency})`}
                        type="number"
                        value={recurringForm.amount}
                        onChange={(v) => setRecurringForm((f) => ({ ...f, amount: v }))}
                        placeholder="0.00"
                        step="0.01"
                        min="0.01"
                        required
                    />
                    <Field
                        label="Jour de débit dans le mois (1 à 31)"
                        type="number"
                        value={recurringForm.debit_day}
                        onChange={(v) => setRecurringForm((f) => ({ ...f, debit_day: v }))}
                        placeholder="Ex : 5"
                        min="1"
                        required
                    />
                    <CategorySelect
                        value={recurringForm.category}
                        onChange={(v) => setRecurringForm((f) => ({ ...f, category: v }))}
                    />
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setSheetRecurring(false)}
                            className="flex-1 py-3 rounded-xl border border-border text-foreground font-medium active:scale-95 transition-transform"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium active:scale-95 transition-transform"
                        >
                            {editingRecurring ? 'Enregistrer' : 'Ajouter'}
                        </button>
                    </div>
                </form>
            </Sheet>

            {/* Sheet : dépense / revenu */}
            <Sheet
                open={sheetEntry}
                onClose={() => setSheetEntry(false)}
                title={editingEntry ? 'Modifier' : entryForm.is_expense ? 'Nouvelle dépense' : 'Nouveau revenu'}
            >
                <form onSubmit={handleSaveEntry} className="space-y-4">
                    {formError && (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                            {formError}
                        </div>
                    )}
                    {!editingEntry && (
                        <div className="flex rounded-xl overflow-hidden border border-border">
                            <button
                                type="button"
                                onClick={() => setEntryForm((f) => ({ ...f, is_expense: true }))}
                                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${entryForm.is_expense ? 'bg-red-500 text-white' : 'bg-surface-1 text-muted-foreground'}`}
                            >
                                Dépense
                            </button>
                            <button
                                type="button"
                                onClick={() => setEntryForm((f) => ({ ...f, is_expense: false }))}
                                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${!entryForm.is_expense ? 'bg-emerald-500 text-white' : 'bg-surface-1 text-muted-foreground'}`}
                            >
                                Revenu
                            </button>
                        </div>
                    )}
                    <Field
                        label="Description (optionnel)"
                        value={entryForm.description}
                        onChange={(v) => setEntryForm((f) => ({ ...f, description: v }))}
                        placeholder="Ex : Courses Leclerc, Salaire…"
                    />
                    <Field
                        label={`Montant (${currency})`}
                        type="number"
                        value={entryForm.amount}
                        onChange={(v) => setEntryForm((f) => ({ ...f, amount: v }))}
                        placeholder="0.00"
                        step="0.01"
                        min="0.01"
                        required
                    />
                    <Field
                        label="Date"
                        type="date"
                        value={entryForm.date}
                        onChange={(v) => setEntryForm((f) => ({ ...f, date: v }))}
                        required
                    />
                    <CategorySelect
                        value={entryForm.category}
                        onChange={(v) => setEntryForm((f) => ({ ...f, category: v }))}
                    />
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setSheetEntry(false)}
                            className="flex-1 py-3 rounded-xl border border-border text-foreground font-medium active:scale-95 transition-transform"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium active:scale-95 transition-transform"
                        >
                            {editingEntry ? 'Enregistrer' : 'Ajouter'}
                        </button>
                    </div>
                </form>
            </Sheet>

            {/* Sheet : plafond de catégorie */}
            <Sheet
                open={sheetLimit}
                onClose={() => setSheetLimit(false)}
                title="Plafond mensuel"
            >
                <form onSubmit={handleSaveLimit} className="space-y-4">
                    {formError && (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                            {formError}
                        </div>
                    )}
                    <CategorySelect
                        value={limitForm.category}
                        onChange={(v) => setLimitForm((f) => ({ ...f, category: v }))}
                    />
                    <Field
                        label={`Plafond mensuel (${currency})`}
                        type="number"
                        value={limitForm.monthly_limit}
                        onChange={(v) => setLimitForm((f) => ({ ...f, monthly_limit: v }))}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        required
                    />
                    <p className="text-xs text-muted-foreground">
                        Définir 0 pour retirer le suivi de cette catégorie.
                    </p>
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setSheetLimit(false)}
                            className="flex-1 py-3 rounded-xl border border-border text-foreground font-medium active:scale-95 transition-transform"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium active:scale-95 transition-transform"
                        >
                            Enregistrer
                        </button>
                    </div>
                </form>
            </Sheet>

        </div>
    );
};

// ─── Entry Row ────────────────────────────────────────────────────────────────

const EntryRow: React.FC<{
    entry: BudgetEntry;
    currency: string;
    canEdit?: boolean;
    onEdit: (e: BudgetEntry) => void;
    onDelete: (id: string) => void;
}> = ({ entry, currency, canEdit = true, onEdit, onDelete }) => {
    const dateStr = format(new Date(entry.date), 'dd MMM', { locale: fr });
    return (
        <div className="flex items-center gap-3 bg-surface-1 border border-border rounded-2xl p-3.5 shadow-sm">
            <div className="flex-1 min-w-0">
                <p className="font-medium text-base truncate">
                    {entry.description || entry.category}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    {entry.description && (
                        <>
                            <span className="text-xs text-muted-foreground">{entry.category}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                        </>
                    )}
                    <span className="text-xs text-muted-foreground">{dateStr}</span>
                </div>
            </div>
            <span className={`text-base font-bold flex-shrink-0 ${entry.is_expense ? 'text-red-500' : 'text-emerald-600'}`}>
                {entry.is_expense ? '-' : '+'}{formatCurrency(entry.amount, currency)}
            </span>
            {canEdit && (
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => onEdit(entry)}
                        className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                    >
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                        onClick={() => onDelete(entry.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default Budget;
