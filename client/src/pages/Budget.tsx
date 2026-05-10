import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, TrendingUp, TrendingDown, DollarSign, Edit2, Trash2, AlertCircle, ChevronLeft, ChevronRight, Paperclip, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Dialog, Input, Select, Textarea, Badge, Tabs } from '../components/ui';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CHART_COLOR_PRESETS } from '../design/colorPresets';
import BudgetShareSplitter from '../components/budget/BudgetShareSplitter';
import MemberDashboard from '../components/budget/MemberDashboard';
import type {
    BudgetEntry as SharedBudgetEntry,
    BudgetEntryShare,
    BudgetLimit as SharedBudgetLimit,
} from '@openfamily/shared';

// Local minimal FamilyMember (the API returns more fields than the shared interface).
interface FamilyMember {
    id: string;
    name: string;
    color: string;
    role?: string;
}

// API-shape budget entry: amount comes as string|number, date as string.
type BudgetEntry = Omit<SharedBudgetEntry, 'amount' | 'date' | 'category'> & {
    amount: number;
    date: string;
    category: string;
    // Legacy / denormalized fields from server response
    assigned_to?: string | null;
    assigned_to_name?: string | null;
    assigned_to_color?: string | null;
};

type BudgetLimit = Omit<SharedBudgetLimit, 'category' | 'monthly_limit' | 'month' | 'year'> & {
    category: string;
    monthly_limit: number;
    month: number;
    year: number;
};

interface BudgetStats {
    totalExpenses: number;
    totalIncome: number;
    balance: number;
    byCategory: Array<{ category: string; category_total: number }>;
    byMember: Array<{ assigned_to: string; member_name: string; member_color: string; category: string; amount: number }>;
}

interface MonthlyStats {
    month: number;
    totalExpenses: number;
    totalIncome: number;
    balance: number;
}

const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const CATEGORIES = [
    { value: 'Alimentation', label: 'Alimentation' },
    { value: 'Santé', label: 'Santé' },
    { value: 'Enfants', label: 'Enfants' },
    { value: 'Maison', label: 'Maison' },
    { value: 'Loisirs', label: 'Loisirs' },
    { value: 'Autre', label: 'Autre' },
];

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

interface ShareInputState {
    family_member_id: string;
    share_amount: number;
}

interface EntryFormState {
    category: string;
    amount: string;
    description: string;
    date: string;
    is_expense: boolean;
    payer_id: string;
    shares: ShareInputState[];
    is_reimbursement: boolean;
    image_url: string | null;
}

interface LimitFormState {
    category: string;
    monthly_limit: string;
    family_member_id: string | null;
}

const buildEmptyEntryForm = (): EntryFormState => ({
    category: 'Alimentation',
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    is_expense: true,
    payer_id: '',
    shares: [],
    is_reimbursement: false,
    image_url: null,
});

const Budget: React.FC = () => {
    const [entries, setEntries] = useState<BudgetEntry[]>([]);
    const [limits, setLimits] = useState<BudgetLimit[]>([]);
    const [stats, setStats] = useState<BudgetStats | null>(null);
    const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [limitDialogOpen, setLimitDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<BudgetEntry | null>(null);
    const [formError, setFormError] = useState('');
    const [limitError, setLimitError] = useState('');
    const [filterMember, setFilterMember] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

    const [formData, setFormData] = useState<EntryFormState>(buildEmptyEntryForm());

    const [limitFormData, setLimitFormData] = useState<LimitFormState>({
        category: 'Alimentation',
        monthly_limit: '',
        family_member_id: null,
    });

    useEffect(() => {
        loadFamilyMembers();
    }, []);

    // Debounce search input
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

    useEffect(() => {
        loadEntries();
        loadLimits();
        loadStats();
        loadMonthlyStats(currentYear);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentMonth, currentYear, filterMember, debouncedSearch]);

    const loadEntries = async () => {
        try {
            const startDate = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
            const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
            if (filterMember && filterMember !== '__unassigned__') {
                params.append('member_id', filterMember);
            }
            if (debouncedSearch.trim() !== '') {
                params.append('search', debouncedSearch.trim());
            }
            const response = await api.get<{ success: boolean; data: BudgetEntry[] }>(
                `/api/budget/entries?${params.toString()}`
            );
            if (response.success) {
                let data = response.data.map((entry) => ({
                    ...entry,
                    amount: toNumber(entry.amount),
                    shares: Array.isArray(entry.shares)
                        ? entry.shares.map((s: BudgetEntryShare) => ({
                            ...s,
                            share_amount: toNumber(s.share_amount),
                        }))
                        : [],
                }));
                if (filterMember === '__unassigned__') {
                    data = data.filter((e) => !e.payer_id && (!e.shares || e.shares.length === 0));
                }
                setEntries(data);
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
                `/api/budget/limits?month=${currentMonth}&year=${currentYear}`
            );
            if (response.success) {
                setLimits(response.data.map((limit) => ({
                    ...limit,
                    monthly_limit: toNumber(limit.monthly_limit),
                    month: toNumber(limit.month),
                    year: toNumber(limit.year),
                })));
            }
        } catch (error) {
            console.error('Failed to load limits:', error);
        }
    };

    const loadStats = async () => {
        try {
            const response = await api.get<{ success: boolean; data: BudgetStats }>(
                `/api/budget/statistics?month=${currentMonth}&year=${currentYear}`
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
                `/api/budget/statistics/monthly?year=${year}`
            );
            if (response.success) {
                setMonthlyStats(response.data.map((item) => ({
                    ...item,
                    totalExpenses: toNumber(item.totalExpenses),
                    totalIncome: toNumber(item.totalIncome),
                    balance: toNumber(item.balance),
                })));
            }
        } catch (error) {
            console.error('Failed to load monthly stats:', error);
        }
    };

    const loadFamilyMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>('/api/family');
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
        if (newMonth < 1) { newMonth = 12; newYear -= 1; }
        if (newMonth > 12) { newMonth = 1; newYear += 1; }
        setCurrentMonth(newMonth);
        setCurrentYear(newYear);
    };

    const handleImageUpload = async (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        // api.post forces JSON content-type, so use fetch directly for multipart
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const token = api.getToken();
        try {
            const res = await fetch(`${baseURL}/api/upload`, {
                method: 'POST',
                body: fd,
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            if (!res.ok) {
                setFormError("L'upload de l'image a échoué. Vérifiez le format et la taille (max 5 Mo).");
                return;
            }
            const data = await res.json();
            const url = data?.data?.url ?? data?.url ?? null;
            if (url) {
                setFormData((prev) => ({ ...prev, image_url: url }));
            }
        } catch {
            setFormError("L'upload de l'image a échoué.");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        const parsedAmount = parsePositiveAmount(formData.amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            setFormError('Le montant doit être un nombre positif.');
            return;
        }

        try {
            const payload: Record<string, unknown> = {
                category: formData.category,
                amount: parsedAmount,
                description: formData.description,
                date: formData.date,
                is_expense: formData.is_expense,
                is_reimbursement: formData.is_reimbursement,
                payer_id: formData.payer_id || null,
                image_url: formData.image_url || null,
            };
            if (formData.shares.length > 0) {
                payload.shares = formData.shares;
            }

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
            setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer cette entrée.");
        }
    };

    const handleLimitSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLimitError('');
        const parsedLimit = parsePositiveAmount(limitFormData.monthly_limit);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
            setLimitError('La limite doit être un nombre positif.');
            return;
        }

        try {
            await api.post('/api/budget/limits', {
                category: limitFormData.category,
                monthly_limit: parsedLimit,
                month: currentMonth,
                year: currentYear,
                family_member_id: limitFormData.family_member_id || null,
            });
            setLimitDialogOpen(false);
            resetLimitForm();
            loadLimits();
        } catch (error) {
            console.error('Failed to save limit:', error);
            setLimitError(error instanceof Error ? error.message : 'Impossible de définir cette limite.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette entrée ?')) return;
        try {
            await api.delete(`/api/budget/entries/${id}`);
            loadEntries();
            loadStats();
        } catch (error) {
            console.error('Failed to delete entry:', error);
        }
    };

    const handleDeleteLimit = async (id: string) => {
        if (!confirm('Supprimer cette limite ?')) return;
        try {
            await api.delete(`/api/budget/limits/${id}`);
            loadLimits();
        } catch (error) {
            console.error('Failed to delete limit:', error);
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
            payer_id: entry.payer_id || '',
            shares: (entry.shares || [])
                .filter((s) => s.family_member_id !== null && s.family_member_id !== undefined)
                .map((s) => ({
                    family_member_id: s.family_member_id as string,
                    share_amount: toNumber(s.share_amount),
                })),
            is_reimbursement: Boolean(entry.is_reimbursement),
            image_url: entry.image_url || null,
        });
        setDialogOpen(true);
    };

    const resetForm = () => {
        setEditingEntry(null);
        setFormError('');
        setFormData(buildEmptyEntryForm());
    };

    const resetLimitForm = () => {
        setLimitError('');
        setLimitFormData({
            category: 'Alimentation',
            monthly_limit: '',
            family_member_id: null,
        });
    };

    const getCategorySpending = (category: string) => {
        return entries
            .filter((e) => e.category === category && e.is_expense)
            .reduce((sum, e) => sum + e.amount, 0);
    };

    const getCategoryLimit = (category: string) => {
        return limits.find((l) => l.category === category && !l.family_member_id)?.monthly_limit || 0;
    };

    // Filtering is mostly done server-side via member_id + search.
    const filteredEntries = entries;

    const chartData = stats?.byCategory.map((cat) => ({
        name: cat.category,
        montant: typeof cat.category_total === 'string' ? parseFloat(cat.category_total) : cat.category_total,
    })) || [];

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">Chargement du budget...</p>
                </div>
            </div>
        );
    }

    const memberById = new Map(familyMembers.map((m) => [m.id, m]));

    const tabs = [
        {
            value: 'entries',
            label: 'Entrées',
            content: (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                            {familyMembers.length > 0 && (
                                <Select
                                    value={filterMember}
                                    onValueChange={(value) => setFilterMember(value)}
                                    options={[
                                        { value: '', label: 'Tous les membres' },
                                        { value: '__unassigned__', label: 'Non assignées' },
                                        ...familyMembers.map((m) => ({ value: m.id, label: m.name })),
                                    ]}
                                />
                            )}
                            <Input
                                type="text"
                                placeholder="Rechercher..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                            <Plus className="w-4 h-4 mr-2" />
                            Nouvelle entrée
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {filteredEntries.length === 0 ? (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                                    <p className="text-muted-foreground">Aucune entrée pour ce mois</p>
                                </CardContent>
                            </Card>
                        ) : (
                            filteredEntries.map((entry) => (
                                <Card key={entry.id} className="hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <Badge variant={entry.is_expense ? 'danger' : 'success'}>
                                                        {entry.category}
                                                    </Badge>
                                                    {entry.payer_id && (
                                                        <span
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label font-medium text-white"
                                                            style={{ backgroundColor: entry.payer_color ?? '#888' }}
                                                        >
                                                            💳 {entry.payer_name ?? '(supprimé)'}
                                                        </span>
                                                    )}
                                                    {entry.is_reimbursement && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-label font-medium bg-purple-600 text-white">
                                                            Remboursement
                                                        </span>
                                                    )}
                                                    {entry.image_url && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewImage(entry.image_url ?? null)}
                                                            title="Voir pièce jointe"
                                                            className="inline-flex items-center justify-center p-1 rounded hover:bg-surface-2"
                                                        >
                                                            <Paperclip className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <span className="text-label text-muted-foreground">
                                                        {format(new Date(entry.date), 'dd MMM yyyy', { locale: fr })}
                                                    </span>
                                                </div>
                                                {entry.shares && entry.shares.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mb-1">
                                                        {entry.shares.map((s, idx) => (
                                                            <span
                                                                key={`${entry.id}-share-${idx}`}
                                                                className="inline-flex items-center px-2 py-0.5 rounded-full text-label"
                                                                style={{
                                                                    backgroundColor: `${s.color ?? '#888'}20`,
                                                                    color: s.color ?? '#666',
                                                                }}
                                                            >
                                                                {(s.name ?? '(supprimé)')}: {toNumber(s.share_amount).toFixed(2)}€
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {entry.description && (
                                                    <p className="text-body-sm text-muted-foreground mb-2">
                                                        {entry.description}
                                                    </p>
                                                )}
                                                <p
                                                    className={`text-xl font-bold ${entry.is_expense ? 'text-red-600' : 'text-emerald-600'
                                                        }`}
                                                >
                                                    {entry.is_expense ? '-' : '+'}
                                                    {entry.amount.toFixed(2)}€
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleEdit(entry)}>
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleDelete(entry.id)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
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
            label: 'Statistiques',
            content: (
                <div className="space-y-6">
                    {stats && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="border-red-100">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-label text-muted-foreground mb-1">Dépenses</p>
                                                <p className="text-2xl font-bold text-red-600">
                                                    {stats.totalExpenses.toFixed(2)}€
                                                </p>
                                            </div>
                                            <TrendingDown className="h-8 w-8 text-red-600" />
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="border-emerald-100">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-label text-muted-foreground mb-1">Revenus</p>
                                                <p className="text-2xl font-bold text-emerald-600">
                                                    {stats.totalIncome.toFixed(2)}€
                                                </p>
                                            </div>
                                            <TrendingUp className="h-8 w-8 text-emerald-600" />
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className={stats.balance >= 0 ? 'border-primary/30' : 'border-danger/30'}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-label text-muted-foreground mb-1">Solde</p>
                                                <p
                                                    className={`text-2xl font-bold ${stats.balance >= 0 ? 'text-nexus-blue' : 'text-red-600'
                                                        }`}
                                                >
                                                    {stats.balance.toFixed(2)}€
                                                </p>
                                            </div>
                                            <DollarSign className="h-8 w-8 text-nexus-blue" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {chartData.length > 0 && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Dépenses par catégorie</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={chartData}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Bar dataKey="montant" fill="rgb(var(--primary))" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Répartition</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <PieChart>
                                                    <Pie
                                                        data={chartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        labelLine={false}
                                                        label={(entry: { name: string }) => entry.name}
                                                        outerRadius={80}
                                                        fill="rgb(var(--primary-soft))"
                                                        dataKey="montant"
                                                    >
                                                        {chartData.map((_entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={CHART_COLOR_PRESETS[index % CHART_COLOR_PRESETS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {stats.byMember && stats.byMember.length > 0 && (() => {
                                const memberMap = new Map<string, Record<string, string | number>>();
                                stats.byMember.forEach((row) => {
                                    if (!memberMap.has(row.assigned_to)) {
                                        memberMap.set(row.assigned_to, { name: row.member_name });
                                    }
                                    const entry = memberMap.get(row.assigned_to)!;
                                    entry[row.category] = (entry[row.category] as number || 0) + row.amount;
                                });
                                const memberChartData = Array.from(memberMap.values());
                                const memberCategories = [...new Set(stats.byMember.map((r) => r.category))];
                                return (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Dépenses par membre et catégorie</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={memberChartData}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" />
                                                    <YAxis />
                                                    <Tooltip formatter={(value: number) => `${value.toFixed(2)}€`} />
                                                    <Legend />
                                                    {memberCategories.map((cat, i) => (
                                                        <Bar key={cat} dataKey={cat} stackId="a" fill={CHART_COLOR_PRESETS[i % CHART_COLOR_PRESETS.length]} />
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
                                        <CardTitle>Évolution mensuelle {currentYear}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={monthlyStats.map((m) => ({
                                                name: MONTH_SHORT[m.month - 1],
                                                Dépenses: m.totalExpenses,
                                                Revenus: m.totalIncome,
                                            }))}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" />
                                                <YAxis />
                                                <Tooltip formatter={(value: number) => `${value.toFixed(2)}€`} />
                                                <Legend />
                                                <Bar dataKey="Dépenses" fill="#ef4444" />
                                                <Bar dataKey="Revenus" fill="#10b981" />
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
            value: 'members',
            label: 'Par membre',
            content: (
                <MemberDashboard
                    members={familyMembers}
                    currentMonth={currentMonth}
                    currentYear={currentYear}
                    onSettleDebt={(fromId, toId, amount) => {
                        setEditingEntry(null);
                        setFormError('');
                        setFormData({
                            ...buildEmptyEntryForm(),
                            is_expense: false,
                            is_reimbursement: true,
                            payer_id: fromId,
                            shares: [{ family_member_id: toId, share_amount: amount }],
                            amount: String(amount),
                            date: new Date().toISOString().slice(0, 10),
                            description: 'Remboursement',
                        });
                        setDialogOpen(true);
                    }}
                />
            ),
        },
        {
            value: 'limits',
            label: 'Limites',
            content: (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-h2 font-semibold">Limites mensuelles</h3>
                        <Button onClick={() => { resetLimitForm(); setLimitDialogOpen(true); }}>
                            <Plus className="w-4 h-4 mr-2" />
                            Définir une limite
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {CATEGORIES.map((cat) => {
                            const spending = getCategorySpending(cat.value);
                            const limit = getCategoryLimit(cat.value);
                            const percentage = limit > 0 ? (spending / limit) * 100 : 0;
                            const isOverLimit = percentage > 100;

                            return (
                                <Card key={cat.value} className={isOverLimit ? 'border-red-200' : ''}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-semibold text-body">{cat.label}</h4>
                                            {isOverLimit && <AlertCircle className="h-5 w-5 text-red-500" />}
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-body-sm">
                                                <span className="text-muted-foreground">Dépensé:</span>
                                                <span className={`font-medium ${isOverLimit ? 'text-red-600' : ''}`}>
                                                    {spending.toFixed(2)}€
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-body-sm">
                                                <span className="text-muted-foreground">Limite:</span>
                                                <span className="font-medium">
                                                    {limit > 0 ? `${limit.toFixed(2)}€` : 'Non définie'}
                                                </span>
                                            </div>
                                            {limit > 0 && (
                                                <div className="mt-2">
                                                    <div className="w-full bg-surface-2 rounded-full h-2">
                                                        <div
                                                            className={`h-2 rounded-full ${isOverLimit ? 'bg-red-500' : 'bg-nexus-blue'
                                                                }`}
                                                            style={{ width: `${Math.min(percentage, 100)}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-label text-muted-foreground mt-1">
                                                        {percentage.toFixed(0)}% utilisé
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {limits.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Toutes les limites définies</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2">
                                    {limits.map((l) => {
                                        const memberLabel = l.family_member_id
                                            ? (memberById.get(l.family_member_id)?.name ?? '(supprimé)')
                                            : 'Global';
                                        return (
                                            <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded bg-surface-2">
                                                <span className="text-body-sm">
                                                    <span className="font-medium">{l.category}</span>
                                                    <span className="text-muted-foreground"> · {memberLabel} · </span>
                                                    <span className="font-medium">{l.monthly_limit.toFixed(2)}€</span>
                                                </span>
                                                <Button variant="ghost" size="sm" onClick={() => handleDeleteLimit(l.id)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 mb-1">Budget</h1>
                    <p className="text-muted-foreground text-body">Suivez vos dépenses et revenus</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => navigateMonth(-1)} className="p-1 rounded hover:bg-surface-2 transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-h2 font-semibold min-w-[160px] text-center">
                        {format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy', { locale: fr })}
                    </span>
                    <button onClick={() => navigateMonth(1)} className="p-1 rounded hover:bg-surface-2 transition-colors">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <Tabs tabs={tabs} />

            {/* Entry Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetForm();
                }}
                title={editingEntry ? 'Modifier l\'entrée' : 'Nouvelle entrée'}
                description="Remplissez les informations de l'entrée budgétaire"
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
                                onChange={() => setFormData({ ...formData, is_expense: true, is_reimbursement: false })}
                                className="w-4 h-4"
                            />
                            <span className="text-body-sm">Dépense</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={!formData.is_expense}
                                onChange={() => setFormData({ ...formData, is_expense: false })}
                                className="w-4 h-4"
                            />
                            <span className="text-body-sm">Revenu</span>
                        </label>
                    </div>
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">Catégorie</label>
                        <Select
                            value={formData.category}
                            onValueChange={(value) => setFormData({ ...formData, category: value })}
                            options={CATEGORIES}
                        />
                    </div>
                    <Input
                        label="Montant (€)"
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        required
                        placeholder="0.00"
                    />
                    <Input
                        label="Date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                    />
                    <Textarea
                        label="Description (optionnel)"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Détails..."
                        rows={2}
                    />
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            Pièce justificative (optionnel)
                        </label>
                        {formData.image_url && (
                            <div className="mb-2 flex items-center gap-2">
                                <img
                                    src={formData.image_url.startsWith('http') ? formData.image_url : `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${formData.image_url}`}
                                    alt="preview"
                                    style={{ height: 60, objectFit: 'cover', borderRadius: 4 }}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFormData({ ...formData, image_url: null })}
                                >
                                    Retirer
                                </Button>
                            </div>
                        )}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                await handleImageUpload(file);
                            }}
                            className="text-body-sm"
                        />
                    </div>
                    {familyMembers.length > 0 && (
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                Payé par
                            </label>
                            <Select
                                value={formData.payer_id}
                                onValueChange={(value) => setFormData({ ...formData, payer_id: value })}
                                options={[
                                    { value: '', label: '-- Non assigné --' },
                                    ...familyMembers.map((m) => ({ value: m.id, label: m.name })),
                                ]}
                            />
                        </div>
                    )}
                    {familyMembers.length > 0 && (
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                Bénéficiaires
                            </label>
                            <BudgetShareSplitter
                                members={familyMembers.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
                                totalAmount={parsePositiveAmount(formData.amount) || 0}
                                value={formData.shares}
                                onChange={(shares) => setFormData({ ...formData, shares })}
                            />
                        </div>
                    )}
                    {!formData.is_expense && (
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.is_reimbursement}
                                onChange={(e) => setFormData({ ...formData, is_reimbursement: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <span className="text-body-sm">Remboursement</span>
                        </label>
                    )}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => { setDialogOpen(false); resetForm(); }}>
                            Annuler
                        </Button>
                        <Button type="submit">{editingEntry ? 'Enregistrer' : 'Créer'}</Button>
                    </div>
                </form>
            </Dialog>

            {/* Limit Dialog */}
            <Dialog
                open={limitDialogOpen}
                onOpenChange={setLimitDialogOpen}
                title="Définir une limite"
                description="Définissez une limite mensuelle pour une catégorie"
            >
                <form onSubmit={handleLimitSubmit} className="space-y-4">
                    {limitError ? (
                        <div className="rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-caption text-danger">
                            {limitError}
                        </div>
                    ) : null}
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">Catégorie</label>
                        <Select
                            value={limitFormData.category}
                            onValueChange={(value) => setLimitFormData({ ...limitFormData, category: value })}
                            options={CATEGORIES}
                        />
                    </div>
                    {familyMembers.length > 0 && (
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                Membre (optionnel)
                            </label>
                            <Select
                                value={limitFormData.family_member_id || ''}
                                onValueChange={(value) => setLimitFormData({ ...limitFormData, family_member_id: value || null })}
                                options={[
                                    { value: '', label: '-- Global (toutes les catégories) --' },
                                    ...familyMembers.map((m) => ({ value: m.id, label: m.name })),
                                ]}
                            />
                        </div>
                    )}
                    <Input
                        label="Limite mensuelle (€)"
                        type="number"
                        step="0.01"
                        value={limitFormData.monthly_limit}
                        onChange={(e) => setLimitFormData({ ...limitFormData, monthly_limit: e.target.value })}
                        required
                        placeholder="0.00"
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setLimitDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button type="submit">Définir</Button>
                    </div>
                </form>
            </Dialog>

            {/* Image preview modal */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-w-3xl max-h-[90vh] p-4" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute -top-2 -right-2 z-10 rounded-full bg-white p-1 shadow"
                            title="Fermer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <img
                            src={previewImage.startsWith('http') ? previewImage : `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${previewImage}`}
                            alt="Pièce jointe"
                            className="max-w-full max-h-[80vh] rounded shadow-lg object-contain"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Budget;
