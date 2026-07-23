import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/utils';
import { PiggyBank, Wallet, Target, Sparkles, TrendingUp, Pencil, Check, X } from 'lucide-react';

// Kakeibo view of the current month. Read-only for children; parents can edit the
// household salaries and the savings goal inline. Reuses /api/kakeibo.

type Pillar = 'survival' | 'wants' | 'culture' | 'extra';

interface MemberIncome { id: string; name: string; color: string; monthly_income: number; }
interface CategoryLine { category: string; amount: number; pillar: Pillar; }
interface KakeiboSummary {
    month: number; year: number;
    incomes: MemberIncome[];
    salaryIncome: number; extraIncome: number; totalIncome: number;
    savingsGoal: number; availableToSpend: number;
    totalExpenses: number; actualSavings: number; savingsGoalReached: boolean;
    byPillar: Record<Pillar, number>;
    byCategory: CategoryLine[];
    notes: string | null;
}

const PILLARS: Pillar[] = ['survival', 'wants', 'culture', 'extra'];
const PILLAR_META: Record<Pillar, { color: string; soft: string }> = {
    survival: { color: '#3b82f6', soft: 'bg-blue-500/10' },
    wants: { color: '#f59e0b', soft: 'bg-amber-500/10' },
    culture: { color: '#8b5cf6', soft: 'bg-violet-500/10' },
    extra: { color: '#ec4899', soft: 'bg-pink-500/10' },
};

interface Props {
    month: number;
    year: number;
    canEdit: boolean;
    currency: string;
    categoryLabel: (v: string) => string;
    reloadKey: number;
}

const KakeiboView: React.FC<Props> = ({ month, year, canEdit, currency, categoryLabel, reloadKey }) => {
    const { t } = useTranslation(['kakeibo', 'budget', 'common']);
    const [data, setData] = useState<KakeiboSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingIncome, setEditingIncome] = useState(false);
    const [incomeDraft, setIncomeDraft] = useState<Record<string, string>>({});
    const [editingGoal, setEditingGoal] = useState(false);
    const [goalDraft, setGoalDraft] = useState('');
    const [notesDraft, setNotesDraft] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);

    const load = async () => {
        try {
            const res = await api.get<{ success: boolean; data: KakeiboSummary }>(
                `/api/kakeibo?month=${month}&year=${year}`
            );
            if (res.success) {
                setData(res.data);
                setNotesDraft(res.data.notes ?? '');
            }
        } catch (err) {
            console.error('Failed to load kakeibo:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { setLoading(true); void load(); }, [month, year, reloadKey]);

    const cur = (v: number) => formatCurrency(v, currency);
    const pillarLabel = (p: Pillar) => t(`kakeibo:pillars.${p}`);

    const spentPct = useMemo(() => {
        if (!data || data.availableToSpend <= 0) return 0;
        return Math.min(100, Math.round((data.totalExpenses / data.availableToSpend) * 100));
    }, [data]);

    if (loading || !data) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="spinner-brand" />
            </div>
        );
    }

    const startIncomeEdit = () => {
        const draft: Record<string, string> = {};
        for (const m of data.incomes) draft[m.id] = m.monthly_income ? String(m.monthly_income) : '';
        setIncomeDraft(draft);
        setEditingIncome(true);
    };

    const saveIncome = async () => {
        const incomes: Record<string, number> = {};
        for (const [id, v] of Object.entries(incomeDraft)) {
            const n = parseFloat(v.replace(',', '.'));
            incomes[id] = Number.isFinite(n) && n > 0 ? n : 0;
        }
        await api.put('/api/kakeibo/income', { incomes });
        setEditingIncome(false);
        await load();
    };

    const saveGoal = async () => {
        const n = parseFloat(goalDraft.replace(',', '.'));
        await api.put('/api/kakeibo/month', { month, year, savings_goal: Number.isFinite(n) && n > 0 ? n : 0, notes: notesDraft });
        setEditingGoal(false);
        await load();
    };

    const saveNotes = async () => {
        setSavingNotes(true);
        try {
            await api.put('/api/kakeibo/month', { month, year, savings_goal: data.savingsGoal, notes: notesDraft });
            await load();
        } finally {
            setSavingNotes(false);
        }
    };

    const savingsPositive = data.actualSavings >= 0;

    return (
        <div className="space-y-3">
            {/* ── Hero: the kakeibo question ───────────────────────────────── */}
            <div className="rounded-card bg-gradient-to-br from-primary/90 to-primary p-5 text-primary-foreground shadow-card">
                <p className="text-xs uppercase tracking-wide opacity-80">{t('kakeibo:availableTitle')}</p>
                <p className="mt-1 text-4xl font-bold tracking-tight">{cur(data.availableToSpend)}</p>
                <p className="mt-1 text-sm opacity-90">
                    {t('kakeibo:availableSub', { income: cur(data.totalIncome), goal: cur(data.savingsGoal) })}
                </p>
                <div className="mt-4">
                    <div className="flex justify-between text-xs opacity-90 mb-1">
                        <span>{t('kakeibo:spentSoFar', { amount: cur(data.totalExpenses) })}</span>
                        <span>{spentPct}%</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/25">
                        <div
                            className="h-full rounded-full bg-white transition-all"
                            style={{ width: `${spentPct}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Household income ─────────────────────────────────────────── */}
            <div className="rounded-card border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Wallet className="h-4 w-4 text-primary" /> {t('kakeibo:householdIncome')}
                    </h3>
                    {canEdit && !editingIncome && (
                        <button onClick={startIncomeEdit} className="text-primary" aria-label={t('common:edit', { defaultValue: 'Edit' })}>
                            <Pencil className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div className="mt-3 space-y-2">
                    {data.incomes.map((m) => (
                        <div key={m.id} className="flex items-center gap-3">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                            <span className="flex-1 text-sm text-foreground">{m.name}</span>
                            {editingIncome ? (
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={incomeDraft[m.id] ?? ''}
                                    onChange={(e) => setIncomeDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                                    placeholder="0"
                                    className="w-28 rounded-input border border-border bg-surface-1 px-2 py-1 text-right text-sm"
                                />
                            ) : (
                                <span className="text-sm font-medium text-foreground">{cur(m.monthly_income)}</span>
                            )}
                        </div>
                    ))}
                    {data.extraIncome > 0 && !editingIncome && (
                        <div className="flex items-center gap-3 border-t border-border pt-2">
                            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="flex-1 text-sm text-muted-foreground">{t('kakeibo:extraIncome')}</span>
                            <span className="text-sm font-medium text-foreground">{cur(data.extraIncome)}</span>
                        </div>
                    )}
                </div>

                {editingIncome ? (
                    <div className="mt-3 flex gap-2">
                        <button onClick={() => void saveIncome()} className="btn-primary btn-sm inline-flex items-center gap-1">
                            <Check className="h-4 w-4" /> {t('common:save', { defaultValue: 'Save' })}
                        </button>
                        <button onClick={() => setEditingIncome(false)} className="btn-ghost btn-sm inline-flex items-center gap-1">
                            <X className="h-4 w-4" /> {t('common:cancel', { defaultValue: 'Cancel' })}
                        </button>
                    </div>
                ) : (
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                        <span className="text-sm font-semibold text-foreground">{t('kakeibo:totalIncome')}</span>
                        <span className="text-sm font-bold text-foreground">{cur(data.totalIncome)}</span>
                    </div>
                )}
            </div>

            {/* ── Savings goal ─────────────────────────────────────────────── */}
            <div className="rounded-card border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Target className="h-4 w-4 text-primary" /> {t('kakeibo:savingsGoal')}
                    </h3>
                    {canEdit && !editingGoal && (
                        <button onClick={() => { setGoalDraft(data.savingsGoal ? String(data.savingsGoal) : ''); setEditingGoal(true); }} className="text-primary">
                            <Pencil className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {editingGoal ? (
                    <div className="mt-3 flex items-center gap-2">
                        <input
                            type="number"
                            inputMode="decimal"
                            value={goalDraft}
                            onChange={(e) => setGoalDraft(e.target.value)}
                            placeholder="0"
                            className="w-32 rounded-input border border-border bg-surface-1 px-2 py-1 text-right text-sm"
                            autoFocus
                        />
                        <button onClick={() => void saveGoal()} className="btn-primary btn-sm inline-flex items-center gap-1">
                            <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditingGoal(false)} className="btn-ghost btn-sm">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <p className="mt-1 text-2xl font-bold text-foreground">{cur(data.savingsGoal)}</p>
                )}
            </div>

            {/* ── The 4 pillars ────────────────────────────────────────────── */}
            <div className="rounded-card border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <PiggyBank className="h-4 w-4 text-primary" /> {t('kakeibo:pillarsTitle')}
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {PILLARS.map((p) => {
                        const amount = data.byPillar[p] || 0;
                        const pct = data.totalExpenses > 0 ? Math.round((amount / data.totalExpenses) * 100) : 0;
                        return (
                            <div key={p} className={`rounded-card ${PILLAR_META[p].soft} p-3`}>
                                <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PILLAR_META[p].color }} />
                                    <span className="text-xs font-medium text-foreground">{pillarLabel(p)}</span>
                                </div>
                                <p className="mt-1 text-lg font-bold text-foreground">{cur(amount)}</p>
                                <p className="text-xs text-muted-foreground">{pct}% · {t(`kakeibo:pillarHint.${p}`)}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Category breakdown grouped under pillars */}
                <div className="mt-4 space-y-1.5">
                    {data.byCategory.map((line) => (
                        <div key={line.category} className="flex items-center gap-2 text-sm">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PILLAR_META[line.pillar].color }} />
                            <span className="flex-1 text-foreground">{categoryLabel(line.category)}</span>
                            <span className="text-muted-foreground">{cur(line.amount)}</span>
                        </div>
                    ))}
                    {data.byCategory.length === 0 && (
                        <p className="py-3 text-center text-sm text-muted-foreground">{t('kakeibo:noExpenses')}</p>
                    )}
                </div>
            </div>

            {/* ── End-of-month reflection ──────────────────────────────────── */}
            <div className={`rounded-card border p-4 ${data.savingsGoalReached ? 'border-success/30 bg-success/5' : 'border-border bg-card'}`}>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <TrendingUp className="h-4 w-4 text-primary" /> {t('kakeibo:reviewTitle')}
                </h3>
                <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('kakeibo:actualSavings')}</span>
                    <span className={`text-xl font-bold ${savingsPositive ? 'text-success' : 'text-danger'}`}>{cur(data.actualSavings)}</span>
                </div>
                <p className="mt-1 text-sm">
                    {data.savingsGoalReached
                        ? <span className="text-success">✓ {t('kakeibo:goalReached', { amount: cur(data.actualSavings - data.savingsGoal) })}</span>
                        : <span className="text-muted-foreground">{t('kakeibo:goalMissed', { amount: cur(data.savingsGoal - data.actualSavings) })}</span>}
                </p>

                <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('kakeibo:notesLabel')}</label>
                    <textarea
                        value={notesDraft}
                        disabled={!canEdit}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        placeholder={t('kakeibo:notesPlaceholder')}
                        rows={3}
                        className="w-full resize-none rounded-input border border-border bg-surface-1 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    {canEdit && notesDraft !== (data.notes ?? '') && (
                        <button onClick={() => void saveNotes()} disabled={savingNotes} className="btn-primary btn-sm mt-2 inline-flex items-center gap-1">
                            <Check className="h-4 w-4" /> {t('common:save', { defaultValue: 'Save' })}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default KakeiboView;
