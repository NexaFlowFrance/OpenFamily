import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import {
    Plus,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Edit2,
    Trash2,
    AlertCircle,
    Users,
    ChevronLeft,
    ChevronRight,
    ScanLine,
    Sparkles,
} from 'lucide-react';
import { ReceiptScanDialog, type ExtractedReceipt } from '../components/app/ReceiptScanDialog';
import { BudgetAnalysisDialog } from '../components/app/BudgetAnalysisDialog';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Dialog,
    Input,
    Select,
    Textarea,
    Badge,
    Tabs,
} from '../components/ui';
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { format } from 'date-fns';
import { useDateLocale } from '../lib/dateLocale';
import { CHART_COLOR_PRESETS } from '../design/colorPresets';
import { useCurrency } from '../lib/useCurrency';

interface FamilyMember {
    id: string;
    name: string;
    color: string;
}

interface BudgetEntry {
    id: string;
    category: string;
    amount: number;
    description?: string;
    date: string;
    is_expense: boolean;
    assigned_to?: string;
    assigned_to_name?: string;
    assigned_to_color?: string;
}

interface BudgetLimit {
    id: string;
    category: string;
    monthly_limit: number;
    month: number;
    year: number;
}

interface BudgetStats {
    totalExpenses: number;
    totalIncome: number;
    balance: number;
    byCategory: Array<{ category: string; category_total: number }>;
    byMember: Array<{
        assigned_to: string;
        member_name: string;
        member_color: string;
        category: string;
        amount: number;
    }>;
}

interface MonthlyStats {
    month: number;
    totalExpenses: number;
    totalIncome: number;
    balance: number;
}

// Stored DATA values — labels resolved at render time via i18n.
const CATEGORY_VALUES = ['Alimentation', 'Santé', 'Enfants', 'Maison', 'Loisirs', 'Autre'] as const;

const parsePositiveAmount = (value: string): number => Number(value.replace(',', '.'));
const toNumber = (value: unknown): number => {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const Budget: React.FC = () => {
    const { t } = useTranslation();
    const locale = useDateLocale();
    const categoryOptions = CATEGORY_VALUES.map((value) => ({
        value,
        label: t('budget.categories.' + value, { defaultValue: value }),
    }));
    const { format: formatMoney, symbol: currencySymbol } = useCurrency();
    const [entries, setEntries] = useState<BudgetEntry[]>([]);
    const [limits, setLimits] = useState<BudgetLimit[]>([]);
    const [stats, setStats] = useState<BudgetStats | null>(null);
    const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [scanDialogOpen, setScanDialogOpen] = useState(false);
    const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
    const [limitDialogOpen, setLimitDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<BudgetEntry | null>(null);
    const [formError, setFormError] = useState('');
    const [limitError, setLimitError] = useState('');
    const [filterMember, setFilterMember] = useState<string>('');
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

    const [formData, setFormData] = useState({
        category: 'Alimentation',
        amount: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        is_expense: true,
        assigned_to: '',
    });

    const [limitFormData, setLimitFormData] = useState({
        category: 'Alimentation',
        monthly_limit: '',
    });

    useEffect(() => {
        loadFamilyMembers();
    }, []);

    useEffect(() => {
        loadEntries();
        loadLimits();
        loadStats();
        loadMonthlyStats(currentYear);
    }, [currentMonth, currentYear]);

    const loadEntries = async () => {
        try {
            const startDate = new Date(currentYear, currentMonth - 1, 1)
                .toISOString()
                .split('T')[0];
            const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
            const response = await api.get<{ success: boolean; data: BudgetEntry[] }>(
                `/api/budget/entries?start_date=${startDate}&end_date=${endDate}`,
            );
            if (response.success) {
                setEntries(
                    response.data.map((entry) => ({
                        ...entry,
                        amount: toNumber(entry.amount),
                    })),
                );
            }
        } catch (error) {
            console.error('Failed to load entries:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadLimits = async () => {
        try {
            const response = await api.get<{ success: boolean; data: BudgetLimit[] }>(
                `/api/budget/limits?month=${currentMonth}&year=${currentYear}`,
            );
            if (response.success) {
                setLimits(
                    response.data.map((limit) => ({
                        ...limit,
                        monthly_limit: toNumber(limit.monthly_limit),
                        month: toNumber(limit.month),
                        year: toNumber(limit.year),
                    })),
                );
            }
        } catch (error) {
            console.error('Failed to load limits:', error);
        }
    };

    const loadStats = async () => {
        try {
            const response = await api.get<{ success: boolean; data: BudgetStats }>(
                `/api/budget/statistics?month=${currentMonth}&year=${currentYear}`,
            );
            if (response.success) {
                setStats({
                    ...response.data,
                    totalExpenses: toNumber(response.data.totalExpenses),
                    totalIncome: toNumber(response.data.totalIncome),
                    balance: toNumber(response.data.balance),
                    byCategory: (response.data.byCategory || []).map((item) => ({
                        category: item.category,
                        category_total: toNumber(item.category_total),
                    })),
                    byMember: (response.data.byMember || []).map((item) => ({
                        ...item,
                        amount: toNumber(item.amount),
                    })),
                });
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    };

    const loadMonthlyStats = async (year = currentYear) => {
        try {
            const response = await api.get<{ success: boolean; data: MonthlyStats[] }>(
                `/api/budget/statistics/monthly?year=${year}`,
            );
            if (response.success) {
                setMonthlyStats(
                    response.data.map((item) => ({
                        ...item,
                        totalExpenses: toNumber(item.totalExpenses),
                        totalIncome: toNumber(item.totalIncome),
                        balance: toNumber(item.balance),
                    })),
                );
            }
        } catch (error) {
            console.error('Failed to load monthly stats:', error);
        }
    };

    const loadFamilyMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>(
                '/api/family',
            );
            if (response.success) {
                setFamilyMembers(response.data);
            }
        } catch (error) {
            console.error('Failed to load family members:', error);
        }
    };

    const navigateMonth = (direction: -1 | 1) => {
        let newMonth = currentMonth + direction;
        let newYear = currentYear;
        if (newMonth < 1) {
            newMonth = 12;
            newYear -= 1;
        }
        if (newMonth > 12) {
            newMonth = 1;
            newYear += 1;
        }
        setCurrentMonth(newMonth);
        setCurrentYear(newYear);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        const parsedAmount = parsePositiveAmount(formData.amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            setFormError(t('budget.errors.amount_positive'));
            return;
        }

        try {
            const payload = {
                ...formData,
                amount: parsedAmount,
            };

            if (editingEntry) {
                await api.put(`/api/budget/entries/${editingEntry.id}`, payload);
            } else {
                await api.post('/api/budget/entries', payload);
            }
            setDialogOpen(false);
            resetForm();
            loadEntries();
            loadStats();
        } catch (error) {
            console.error('Failed to save entry:', error);
            setFormError(error instanceof Error ? error.message : t('budget.errors.save_entry'));
        }
    };

    const handleLimitSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLimitError('');
        const parsedLimit = parsePositiveAmount(limitFormData.monthly_limit);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
            setLimitError(t('budget.errors.limit_positive'));
            return;
        }

        try {
            await api.post('/api/budget/limits', {
                ...limitFormData,
                monthly_limit: parsedLimit,
                month: currentMonth,
                year: currentYear,
            });
            setLimitDialogOpen(false);
            resetLimitForm();
            loadLimits();
        } catch (error) {
            console.error('Failed to save limit:', error);
            setLimitError(error instanceof Error ? error.message : t('budget.errors.save_limit'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('budget.confirm_delete'))) return;
        try {
            await api.delete(`/api/budget/entries/${id}`);
            loadEntries();
            loadStats();
        } catch (error) {
            console.error('Failed to delete entry:', error);
        }
    };

    const handleEdit = (entry: BudgetEntry) => {
        setEditingEntry(entry);
        setFormData({
            category: entry.category,
            amount: entry.amount.toString(),
            description: entry.description || '',
            date: entry.date.split('T')[0],
            is_expense: entry.is_expense,
            assigned_to: entry.assigned_to || '',
        });
        setDialogOpen(true);
    };

    const resetForm = () => {
        setEditingEntry(null);
        setFormError('');
        setFormData({
            category: 'Alimentation',
            amount: '',
            description: '',
            date: format(new Date(), 'yyyy-MM-dd'),
            is_expense: true,
            assigned_to: '',
        });
    };

    // Pre-fills the entry form from a receipt extraction and opens the existing
    // "Nouvelle entrée" dialog so the user can review/adjust before saving.
    // We never auto-save: financial amounts always go through a human confirm.
    const applyExtractedReceipt = (e: ExtractedReceipt) => {
        const descriptionParts: string[] = [];
        if (e.merchant) descriptionParts.push(e.merchant);
        if (e.description) descriptionParts.push(e.description);
        setEditingEntry(null);
        setFormError('');
        setFormData({
            category: e.category || 'Autre',
            amount: e.amount !== null ? e.amount.toFixed(2) : '',
            description: descriptionParts.join(' — '),
            date: e.date ?? format(new Date(), 'yyyy-MM-dd'),
            is_expense: true,
            assigned_to: '',
        });
        setScanDialogOpen(false);
        setDialogOpen(true);
    };

    const resetLimitForm = () => {
        setLimitError('');
        setLimitFormData({
            category: 'Alimentation',
            monthly_limit: '',
        });
    };

    const getCategorySpending = (category: string) => {
        return entries
            .filter((e) => e.category === category && e.is_expense)
            .reduce((sum, e) => sum + e.amount, 0);
    };

    const getCategoryLimit = (category: string) => {
        return limits.find((l) => l.category === category)?.monthly_limit || 0;
    };

    const filteredEntries = entries.filter((entry) => {
        if (filterMember === '__unassigned__' && entry.assigned_to) return false;
        if (filterMember && filterMember !== '__unassigned__' && entry.assigned_to !== filterMember)
            return false;
        return true;
    });

    const chartData =
        stats?.byCategory.map((cat) => ({
            name: t('budget.categories.' + cat.category, { defaultValue: cat.category }),
            montant:
                typeof cat.category_total === 'string'
                    ? parseFloat(cat.category_total)
                    : cat.category_total,
        })) || [];

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">
                        {t('budget.loading')}
                    </p>
                </div>
            </div>
        );
    }

    const tabs = [
        {
            value: 'entries',
            label: t('budget.tabs.entries'),
            content: (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            {familyMembers.length > 0 && (
                                <Select
                                    value={filterMember}
                                    onValueChange={(value) => setFilterMember(value)}
                                    options={[
                                        { value: '', label: t('budget.filter.all_members') },
                                        {
                                            value: '__unassigned__',
                                            label: t('budget.filter.unassigned'),
                                        },
                                        ...familyMembers.map((m) => ({
                                            value: m.id,
                                            label: m.name,
                                        })),
                                    ]}
                                />
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setScanDialogOpen(true)}>
                                <ScanLine className="w-4 h-4 mr-2" />
                                {t('budget.scan_receipt')}
                            </Button>
                            <Button
                                onClick={() => {
                                    resetForm();
                                    setDialogOpen(true);
                                }}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {t('budget.new_entry')}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {filteredEntries.length === 0 ? (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                                    <p className="text-muted-foreground">
                                        {t('budget.empty_month')}
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            filteredEntries.map((entry) => (
                                <Card key={entry.id} className="hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-1 flex-wrap">
                                                    <Badge
                                                        variant={
                                                            entry.is_expense ? 'danger' : 'success'
                                                        }
                                                    >
                                                        {t('budget.categories.' + entry.category, {
                                                            defaultValue: entry.category,
                                                        })}
                                                    </Badge>
                                                    {entry.assigned_to_name && (
                                                        <span
                                                            className="inline-flex items-center gap-1.5 text-label font-medium px-2 py-0.5 rounded-full"
                                                            style={{
                                                                backgroundColor: `${entry.assigned_to_color}20`,
                                                                color: entry.assigned_to_color,
                                                            }}
                                                        >
                                                            <Users className="w-3 h-3" />
                                                            {entry.assigned_to_name}
                                                        </span>
                                                    )}
                                                    <span className="text-label text-muted-foreground">
                                                        {format(
                                                            new Date(entry.date),
                                                            'dd MMM yyyy',
                                                            { locale },
                                                        )}
                                                    </span>
                                                </div>
                                                {entry.description && (
                                                    <p className="text-body-sm text-muted-foreground mb-2">
                                                        {entry.description}
                                                    </p>
                                                )}
                                                <p
                                                    className={`text-xl font-bold ${
                                                        entry.is_expense
                                                            ? 'text-destructive'
                                                            : 'text-success'
                                                    }`}
                                                >
                                                    {entry.is_expense ? '-' : '+'}
                                                    {formatMoney(entry.amount)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(entry)}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(entry.id)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </div>
            ),
        },
        {
            value: 'statistics',
            label: t('budget.tabs.statistics'),
            content: (
                <div className="space-y-6">
                    <div className="flex items-center justify-between gap-3 rounded-card border border-dashed border-primary/40 bg-primary/5 px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-caption font-semibold text-foreground">
                                {t('budget.stats.ai_card_title')}
                            </p>
                            <p className="text-label-sm text-muted-foreground">
                                {t('budget.stats.ai_card_desc')}
                            </p>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setAnalysisDialogOpen(true)}
                            disabled={
                                !stats || (stats.totalExpenses === 0 && stats.totalIncome === 0)
                            }
                        >
                            <Sparkles className="w-4 h-4 mr-2" />
                            {t('budget.stats.analyze')}
                        </Button>
                    </div>
                    {stats && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="border-destructive/20">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-label text-muted-foreground mb-1">
                                                    {t('budget.stats.expenses')}
                                                </p>
                                                <p className="text-2xl font-bold text-destructive">
                                                    {formatMoney(stats.totalExpenses)}
                                                </p>
                                            </div>
                                            <TrendingDown className="h-8 w-8 text-destructive" />
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="border-success/20">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-label text-muted-foreground mb-1">
                                                    {t('budget.stats.income')}
                                                </p>
                                                <p className="text-2xl font-bold text-success">
                                                    {formatMoney(stats.totalIncome)}
                                                </p>
                                            </div>
                                            <TrendingUp className="h-8 w-8 text-success" />
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card
                                    className={
                                        stats.balance >= 0
                                            ? 'border-primary/30'
                                            : 'border-danger/30'
                                    }
                                >
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-label text-muted-foreground mb-1">
                                                    {t('budget.stats.balance')}
                                                </p>
                                                <p
                                                    className={`text-2xl font-bold ${
                                                        stats.balance >= 0
                                                            ? 'text-primary'
                                                            : 'text-destructive'
                                                    }`}
                                                >
                                                    {formatMoney(stats.balance)}
                                                </p>
                                            </div>
                                            <DollarSign className="h-8 w-8 text-primary" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {chartData.length > 0 && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>{t('budget.stats.by_category')}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={chartData}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" />
                                                    <YAxis
                                                        tickFormatter={(value: number) =>
                                                            formatMoney(value, {
                                                                maximumFractionDigits: 0,
                                                            })
                                                        }
                                                    />
                                                    <Tooltip
                                                        formatter={(value: number) =>
                                                            formatMoney(value)
                                                        }
                                                    />
                                                    <Bar
                                                        dataKey="montant"
                                                        fill="rgb(var(--primary))"
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>{t('budget.stats.distribution')}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <PieChart>
                                                    <Pie
                                                        data={chartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        labelLine={false}
                                                        label={(entry: { name: string }) =>
                                                            entry.name
                                                        }
                                                        outerRadius={80}
                                                        fill="rgb(var(--primary-soft))"
                                                        dataKey="montant"
                                                    >
                                                        {chartData.map((_entry, index) => (
                                                            <Cell
                                                                key={`cell-${index}`}
                                                                fill={
                                                                    CHART_COLOR_PRESETS[
                                                                        index %
                                                                            CHART_COLOR_PRESETS.length
                                                                    ]
                                                                }
                                                            />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {stats.byMember &&
                                stats.byMember.length > 0 &&
                                (() => {
                                    const memberMap = new Map<
                                        string,
                                        Record<string, string | number>
                                    >();
                                    stats.byMember.forEach((row) => {
                                        if (!memberMap.has(row.assigned_to)) {
                                            memberMap.set(row.assigned_to, {
                                                name: row.member_name,
                                            });
                                        }
                                        const entry = memberMap.get(row.assigned_to)!;
                                        entry[row.category] =
                                            ((entry[row.category] as number) || 0) + row.amount;
                                    });
                                    const memberChartData = Array.from(memberMap.values());
                                    const memberCategories = [
                                        ...new Set(stats.byMember.map((r) => r.category)),
                                    ];
                                    return (
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>
                                                    {t('budget.stats.by_member_category')}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <ResponsiveContainer width="100%" height={300}>
                                                    <BarChart data={memberChartData}>
                                                        <CartesianGrid strokeDasharray="3 3" />
                                                        <XAxis dataKey="name" />
                                                        <YAxis
                                                            tickFormatter={(value: number) =>
                                                                formatMoney(value, {
                                                                    maximumFractionDigits: 0,
                                                                })
                                                            }
                                                        />
                                                        <Tooltip
                                                            formatter={(value: number) =>
                                                                formatMoney(value)
                                                            }
                                                        />
                                                        <Legend
                                                            formatter={(value: string) =>
                                                                t('budget.categories.' + value, {
                                                                    defaultValue: value,
                                                                })
                                                            }
                                                        />
                                                        {memberCategories.map((cat, i) => (
                                                            <Bar
                                                                key={cat}
                                                                dataKey={cat}
                                                                stackId="a"
                                                                fill={
                                                                    CHART_COLOR_PRESETS[
                                                                        i %
                                                                            CHART_COLOR_PRESETS.length
                                                                    ]
                                                                }
                                                            />
                                                        ))}
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </CardContent>
                                        </Card>
                                    );
                                })()}

                            {monthlyStats.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>
                                            {t('budget.stats.monthly_evolution', {
                                                year: currentYear,
                                            })}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart
                                                data={monthlyStats.map((m) => ({
                                                    name: format(
                                                        new Date(currentYear, m.month - 1, 1),
                                                        'MMM',
                                                        { locale },
                                                    ),
                                                    [t('budget.chart.expenses')]: m.totalExpenses,
                                                    [t('budget.chart.income')]: m.totalIncome,
                                                }))}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" />
                                                <YAxis
                                                    tickFormatter={(value: number) =>
                                                        formatMoney(value, {
                                                            maximumFractionDigits: 0,
                                                        })
                                                    }
                                                />
                                                <Tooltip
                                                    formatter={(value: number) =>
                                                        formatMoney(value)
                                                    }
                                                />
                                                <Legend />
                                                <Bar
                                                    dataKey={t('budget.chart.expenses')}
                                                    fill="#ef4444"
                                                />
                                                <Bar
                                                    dataKey={t('budget.chart.income')}
                                                    fill="#10b981"
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                </div>
            ),
        },
        {
            value: 'limits',
            label: t('budget.tabs.limits'),
            content: (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-h2 font-semibold">{t('budget.limitsTab.title')}</h3>
                        <Button
                            onClick={() => {
                                resetLimitForm();
                                setLimitDialogOpen(true);
                            }}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            {t('budget.limitsTab.define')}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {categoryOptions.map((cat) => {
                            const spending = getCategorySpending(cat.value);
                            const limit = getCategoryLimit(cat.value);
                            const percentage = limit > 0 ? (spending / limit) * 100 : 0;
                            const isOverLimit = percentage > 100;

                            return (
                                <Card
                                    key={cat.value}
                                    className={isOverLimit ? 'border-destructive/40' : ''}
                                >
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-semibold text-body">{cat.label}</h4>
                                            {isOverLimit && (
                                                <AlertCircle className="h-5 w-5 text-destructive" />
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-body-sm">
                                                <span className="text-muted-foreground">
                                                    {t('budget.limitsTab.spent')}
                                                </span>
                                                <span
                                                    className={`font-medium ${isOverLimit ? 'text-destructive' : ''}`}
                                                >
                                                    {formatMoney(spending)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-body-sm">
                                                <span className="text-muted-foreground">
                                                    {t('budget.limitsTab.limit')}
                                                </span>
                                                <span className="font-medium">
                                                    {limit > 0
                                                        ? formatMoney(limit)
                                                        : t('budget.limitsTab.not_defined')}
                                                </span>
                                            </div>
                                            {limit > 0 && (
                                                <div className="mt-2">
                                                    <div className="w-full bg-surface-2 rounded-full h-2">
                                                        <div
                                                            className={`h-2 rounded-full ${
                                                                isOverLimit
                                                                    ? 'bg-destructive'
                                                                    : 'bg-primary'
                                                            }`}
                                                            style={{
                                                                width: `${Math.min(percentage, 100)}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <p className="text-label text-muted-foreground mt-1">
                                                        {t('budget.limitsTab.used', {
                                                            percentage: percentage.toFixed(0),
                                                        })}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            ),
        },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 mb-1">{t('budget.title')}</h1>
                    <p className="text-muted-foreground text-body">{t('budget.subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigateMonth(-1)}
                        className="p-1 rounded hover:bg-surface-2 transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-h2 font-semibold min-w-[160px] text-center">
                        {format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy', {
                            locale,
                        })}
                    </span>
                    <button
                        onClick={() => navigateMonth(1)}
                        className="p-1 rounded hover:bg-surface-2 transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <Tabs tabs={tabs} />

            {/* Entry Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title={editingEntry ? t('budget.form.edit_title') : t('budget.form.new_title')}
                description={t('budget.form.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {formError ? (
                        <div className="rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-caption text-danger">
                            {formError}
                        </div>
                    ) : null}
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={formData.is_expense}
                                onChange={() => setFormData({ ...formData, is_expense: true })}
                                className="w-4 h-4"
                            />
                            <span className="text-body-sm">{t('budget.form.expense')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={!formData.is_expense}
                                onChange={() => setFormData({ ...formData, is_expense: false })}
                                className="w-4 h-4"
                            />
                            <span className="text-body-sm">{t('budget.form.income')}</span>
                        </label>
                    </div>
                    <div>
                        <Input
                            label={t('budget.form.category')}
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            placeholder={t('budget.form.category_placeholder')}
                            list="budget-category-suggestions"
                            maxLength={50}
                            required
                        />
                        <datalist id="budget-category-suggestions">
                            {categoryOptions.map((c) => (
                                <option key={c.value} value={c.value} />
                            ))}
                        </datalist>
                        <p className="mt-1.5 text-micro text-muted-foreground">
                            {t('budget.form.category_hint')}
                        </p>
                    </div>
                    <Input
                        label={t('budget.form.amount', { symbol: currencySymbol })}
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        required
                        placeholder="0.00"
                    />
                    <Input
                        label={t('budget.form.date')}
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                    />
                    <Textarea
                        label={t('budget.form.description_label')}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t('budget.form.description_placeholder')}
                        rows={2}
                    />
                    {familyMembers.length > 0 && (
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('budget.form.assign_to')}
                            </label>
                            <Select
                                value={formData.assigned_to}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, assigned_to: value })
                                }
                                options={[
                                    { value: '', label: t('budget.form.unassigned') },
                                    ...familyMembers.map((m) => ({ value: m.id, label: m.name })),
                                ]}
                            />
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setDialogOpen(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">
                            {editingEntry ? t('common.save') : t('budget.form.create')}
                        </Button>
                    </div>
                </form>
            </Dialog>

            {/* Limit Dialog */}
            <Dialog
                open={limitDialogOpen}
                onOpenChange={setLimitDialogOpen}
                title={t('budget.limitForm.title')}
                description={t('budget.limitForm.description')}
            >
                <form onSubmit={handleLimitSubmit} className="space-y-4">
                    {limitError ? (
                        <div className="rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-caption text-danger">
                            {limitError}
                        </div>
                    ) : null}
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('budget.limitForm.category')}
                        </label>
                        <Select
                            value={limitFormData.category}
                            onValueChange={(value) =>
                                setLimitFormData({ ...limitFormData, category: value })
                            }
                            options={categoryOptions}
                        />
                    </div>
                    <Input
                        label={t('budget.limitForm.monthly_limit', { symbol: currencySymbol })}
                        type="number"
                        step="0.01"
                        value={limitFormData.monthly_limit}
                        onChange={(e) =>
                            setLimitFormData({ ...limitFormData, monthly_limit: e.target.value })
                        }
                        required
                        placeholder="0.00"
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setLimitDialogOpen(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">{t('budget.limitForm.define')}</Button>
                    </div>
                </form>
            </Dialog>

            <ReceiptScanDialog
                open={scanDialogOpen}
                onOpenChange={setScanDialogOpen}
                onExtracted={applyExtractedReceipt}
            />

            <BudgetAnalysisDialog
                open={analysisDialogOpen}
                onOpenChange={setAnalysisDialogOpen}
                month={currentMonth}
                year={currentYear}
                periodLabel={format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy', {
                    locale,
                })}
            />
        </div>
    );
};

export default Budget;
