import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';

// --- Types ---

interface MemberDashboardProps {
    members: Array<{ id: string; name: string; color: string }>;
    currentMonth: number;
    currentYear: number;
    onSettleDebt?: (fromMemberId: string, toMemberId: string, amount: number) => void;
}

interface BudgetMemberStatistics {
    totalSpent: number;
    totalPaid: number;
    balance: number;
    byCategory: Record<string, number>;
    monthlyTrend: Array<{ month: number; year: number; spent: number; paid: number }>;
    limit?: { amount: number; percent: number };
}

interface Debt {
    from_member_id: string;
    from_name: string;
    from_color: string;
    to_member_id: string;
    to_name: string;
    to_color: string;
    amount: number;
}

// --- Helpers ---

const fmt = (n: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// --- Component ---

const MemberDashboard: React.FC<MemberDashboardProps> = ({
    members,
    currentMonth,
    currentYear,
    onSettleDebt,
}) => {
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [stats, setStats] = useState<BudgetMemberStatistics | null>(null);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!selectedMemberId) return;

        let cancelled = false;
        setLoading(true);
        setError('');

        Promise.all([
            api.get<{ success: boolean; data: BudgetMemberStatistics }>(
                `/api/budget/statistics/member/${selectedMemberId}?month=${currentMonth}&year=${currentYear}`
            ),
            api.get<{ success: boolean; data: { debts: Debt[] } }>(
                `/api/budget/debts?month=${currentMonth}&year=${currentYear}`
            ),
        ])
            .then(([statsRes, debtsRes]) => {
                if (cancelled) return;
                setStats(statsRes.data);
                setDebts(debtsRes.data?.debts ?? []);
            })
            .catch((err: Error) => {
                if (cancelled) return;
                setError(err.message || 'Erreur lors du chargement');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedMemberId, currentMonth, currentYear]);

    const memberOptions = members.map((m) => ({ value: m.id, label: m.name }));

    const relevantDebts = debts.filter(
        (d) => d.from_member_id === selectedMemberId || d.to_member_id === selectedMemberId
    );

    const topCategories = stats
        ? Object.entries(stats.byCategory)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([cat, amount]) => ({ cat, amount }))
        : [];

    const trendData = stats?.monthlyTrend.map((t) => ({
        name: MONTH_SHORT[t.month - 1],
        Dépensé: t.spent,
        Payé: t.paid,
    })) ?? [];

    const balanceColor =
        stats && stats.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

    return (
        <div className="space-y-6">
            {/* Member selector */}
            <div className="max-w-xs">
                <Select
                    value={selectedMemberId}
                    onValueChange={setSelectedMemberId}
                    placeholder="Choisir un membre"
                    options={memberOptions}
                />
            </div>

            {!selectedMemberId && (
                <p className="text-sm text-muted-foreground">Sélectionnez un membre pour afficher son tableau de bord.</p>
            )}

            {selectedMemberId && loading && (
                <p className="text-sm text-muted-foreground">Chargement...</p>
            )}

            {selectedMemberId && error && (
                <p className="text-sm text-red-500">{error}</p>
            )}

            {selectedMemberId && !loading && stats && (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium text-muted-foreground">Dépensé</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold">{fmt(stats.totalSpent)}</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium text-muted-foreground">Payé</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold">{fmt(stats.totalPaid)}</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium text-muted-foreground">Balance</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className={`text-2xl font-bold ${balanceColor}`}>
                                    {stats.balance >= 0 ? '+' : ''}{fmt(stats.balance)}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Top categories */}
                    {topCategories.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Top catégories</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={topCategories.length * 45 + 20}>
                                    <BarChart
                                        data={topCategories}
                                        layout="vertical"
                                        margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" tickFormatter={(v) => `${v}€`} tick={{ fontSize: 12 }} />
                                        <YAxis
                                            type="category"
                                            dataKey="cat"
                                            width={90}
                                            tick={{ fontSize: 12 }}
                                        />
                                        <Tooltip formatter={(v: number) => fmt(v)} />
                                        <Bar dataKey="amount" fill="#6366f1" radius={[0, 4, 4, 0]} name="Montant" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )}

                    {/* Monthly trend */}
                    {trendData.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Évolution 12 mois</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis tickFormatter={(v) => `${v}€`} tick={{ fontSize: 12 }} />
                                        <Tooltip formatter={(v: number) => fmt(v)} />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="Dépensé"
                                            stroke="#ef4444"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="Payé"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )}

                    {/* Limit progress */}
                    {stats.limit && (
                        <Card>
                            <CardHeader>
                                <CardTitle>vs Limite mensuelle</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>{fmt(stats.totalSpent)}</span>
                                        <span className="text-muted-foreground">{fmt(stats.limit.amount)}</span>
                                    </div>
                                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                stats.limit.percent >= 100
                                                    ? 'bg-red-500'
                                                    : stats.limit.percent >= 80
                                                    ? 'bg-orange-400'
                                                    : 'bg-green-500'
                                            }`}
                                            style={{ width: `${Math.min(stats.limit.percent, 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground text-right">
                                        {stats.limit.percent.toFixed(0)}% utilisé
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Debts */}
                    {relevantDebts.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Règlements du mois</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3">
                                    {relevantDebts.map((d, i) => {
                                        const isOwing = d.from_member_id === selectedMemberId;
                                        return (
                                            <li
                                                key={i}
                                                className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3"
                                            >
                                                <span className="text-sm">
                                                    {isOwing ? (
                                                        <>
                                                            <span className="font-medium">{d.from_name}</span>
                                                            {' doit '}
                                                            <span className="font-semibold text-red-500">{fmt(d.amount)}</span>
                                                            {' à '}
                                                            <span className="font-medium">{d.to_name}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="font-medium">{d.from_name}</span>
                                                            {' vous doit '}
                                                            <span className="font-semibold text-green-600">{fmt(d.amount)}</span>
                                                        </>
                                                    )}
                                                </span>
                                                {isOwing && onSettleDebt && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => onSettleDebt(d.from_member_id, d.to_member_id, d.amount)}
                                                    >
                                                        Régler →
                                                    </Button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
};

export default MemberDashboard;
