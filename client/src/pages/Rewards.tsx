import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import {
    PiggyBank, Star, Flame, Check, X, Hourglass, SlidersHorizontal,
    Settings2, Coins, Target, Trophy, ListChecks,
} from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Badge } from '../components/ui';
import { format, parseISO } from 'date-fns';
import { dateLocale } from '../i18n/format';

interface RewardMember {
    id: string;
    name: string;
    color: string;
    role: string;
    linked_user_id?: string | null;
    balance: number;
    currency_value: number;
    pending_count: number;
    streak: number;
    has_activity: boolean;
}

interface RewardGoal {
    id: string;
    member_id: string;
    title: string;
    emoji?: string | null;
    target_amount: number;
    status: 'active' | 'achieved' | 'archived';
    created_at: string;
    achieved_at?: string | null;
}

interface KidTask {
    id: string;
    title: string;
    points: number;
    is_completed: boolean;
    pending_approval: boolean;
    assigned_to: string[];
}

interface PendingTask {
    id: string;
    title: string;
    points: number;
    assigned_to_members: Array<{ id: string; name: string; color: string }>;
}

interface RewardsSummary {
    points_value: number;
    currency: string;
    members: RewardMember[];
    pending_tasks: PendingTask[];
}

interface RewardTransaction {
    id: string;
    member_id: string;
    task_id?: string | null;
    points: number;
    type: 'earn' | 'adjust' | 'redeem';
    note?: string | null;
    created_at: string;
}

const txIcon = (type: RewardTransaction['type']) => {
    switch (type) {
        case 'earn':
            return <Star className="h-4 w-4 text-amber-500 fill-current" />;
        case 'redeem':
            return <PiggyBank className="h-4 w-4 text-pink-500" />;
        default:
            return <SlidersHorizontal className="h-4 w-4 text-primary" />;
    }
};

// Dependency-free CSS confetti, shown when a goal reaches 100% in the kid view.
const CONFETTI_COLORS = ['#F59E0B', '#EC4899', '#3B82F6', '#22C55E', '#A855F7', '#EF4444'];

const Confetti: React.FC = () => (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <style>{`@keyframes of-confetti-fall {
            0% { transform: translateY(-24px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(460px) rotate(720deg); opacity: 0; }
        }`}</style>
        {Array.from({ length: 24 }).map((_, i) => (
            <span
                key={i}
                style={{
                    position: 'absolute',
                    top: '-16px',
                    left: `${(i * 41 + 7) % 100}%`,
                    width: i % 3 === 0 ? 10 : 7,
                    height: i % 2 === 0 ? 12 : 8,
                    backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    borderRadius: i % 2 === 0 ? '9999px' : '2px',
                    animation: `of-confetti-fall ${2.4 + (i % 5) * 0.5}s linear ${(i % 7) * 0.35}s infinite`,
                }}
            />
        ))}
    </div>
);

const Rewards: React.FC = () => {
    const { t } = useTranslation(['rewards', 'common']);
    const { user } = useAuth();
    const isParent = Boolean(user?.is_owner) || user?.role !== 'enfant';

    const [summary, setSummary] = useState<RewardsSummary | null>(null);
    const [transactions, setTransactions] = useState<RewardTransaction[]>([]);
    const [goals, setGoals] = useState<RewardGoal[]>([]);
    const [kidTasks, setKidTasks] = useState<KidTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Dialogs
    const [adjustMember, setAdjustMember] = useState<RewardMember | null>(null);
    const [adjustPoints, setAdjustPoints] = useState('');
    const [adjustNote, setAdjustNote] = useState('');
    const [redeemMember, setRedeemMember] = useState<RewardMember | null>(null);
    const [redeemPoints, setRedeemPoints] = useState('');
    const [redeemNote, setRedeemNote] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsValue, setSettingsValue] = useState('');
    const [goalMember, setGoalMember] = useState<RewardMember | null>(null);
    const [editingGoal, setEditingGoal] = useState<RewardGoal | null>(null);
    const [goalTitle, setGoalTitle] = useState('');
    const [goalEmoji, setGoalEmoji] = useState('');
    const [goalTarget, setGoalTarget] = useState('');

    const load = async () => {
        try {
            const [summaryRes, txRes, goalsRes] = await Promise.all([
                api.get<{ success: boolean; data: RewardsSummary }>('/api/rewards/summary'),
                api.get<{ success: boolean; data: RewardTransaction[] }>('/api/rewards/transactions'),
                api.get<{ success: boolean; data: RewardGoal[] }>('/api/rewards/goals'),
            ]);
            if (summaryRes.success) setSummary(summaryRes.data);
            if (txRes.success) setTransactions(txRes.data);
            if (goalsRes.success) setGoals(goalsRes.data);
            // Kid view only: the child's own task list (read-only).
            if (!isParent) {
                const tasksRes = await api.get<{ success: boolean; data: KidTask[] }>('/api/tasks');
                if (tasksRes.success) setKidTasks(tasksRes.data);
            }
        } catch (error) {
            console.error('Failed to load rewards:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.load'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);
    useWebSocketUpdates('rewards', () => void load());
    useWebSocketUpdates('tasks', () => void load());

    const currency = summary?.currency || user?.currency || 'EUR';
    const pointsValue = summary?.points_value ?? 0.1;

    // Show every member with reward activity, plus all children (the target
    // audience — they appear even before their first chore).
    const visibleMembers = useMemo(
        () => (summary?.members || []).filter(
            (m) => m.has_activity || m.pending_count > 0 || m.balance !== 0 || m.role === 'Enfant'
        ),
        [summary]
    );

    const txByMember = useMemo(() => {
        const map = new Map<string, RewardTransaction[]>();
        for (const tx of transactions) {
            if (!map.has(tx.member_id)) map.set(tx.member_id, []);
            map.get(tx.member_id)!.push(tx);
        }
        return map;
    }, [transactions]);

    // One active goal per member (enforced server-side).
    const activeGoalByMember = useMemo(() => {
        const map = new Map<string, RewardGoal>();
        for (const goal of goals) {
            if (goal.status === 'active' && !map.has(goal.member_id)) map.set(goal.member_id, goal);
        }
        return map;
    }, [goals]);

    // Progress is computed client-side: balance × point value vs target amount.
    const goalPercent = (member: RewardMember, goal: RewardGoal) =>
        goal.target_amount > 0
            ? Math.min(100, Math.round((member.currency_value / goal.target_amount) * 100))
            : 0;
    const goalReached = (member: RewardMember, goal: RewardGoal) =>
        member.currency_value >= goal.target_amount;

    const handleApprove = async (taskId: string) => {
        try {
            await api.post(`/api/tasks/${taskId}/approve`, {});
            void load();
        } catch (error) {
            console.error('Failed to approve task:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.action'));
        }
    };

    const handleReject = async (taskId: string) => {
        try {
            await api.post(`/api/tasks/${taskId}/reject`, {});
            void load();
        } catch (error) {
            console.error('Failed to reject task:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.action'));
        }
    };

    const handleAdjust = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustMember) return;
        setError('');
        try {
            await api.post('/api/rewards/adjust', {
                member_id: adjustMember.id,
                points: parseInt(adjustPoints, 10) || 0,
                note: adjustNote,
            });
            setAdjustMember(null);
            void load();
        } catch (error) {
            console.error('Failed to adjust points:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.action'));
        }
    };

    const handleRedeem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!redeemMember) return;
        setError('');
        try {
            await api.post('/api/rewards/redeem', {
                member_id: redeemMember.id,
                points: parseInt(redeemPoints, 10) || 0,
                note: redeemNote,
            });
            setRedeemMember(null);
            void load();
        } catch (error) {
            console.error('Failed to redeem points:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.action'));
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const value = parseFloat(settingsValue.replace(',', '.'));
            await api.put('/api/rewards/settings', { points_value: value });
            setSettingsOpen(false);
            void load();
        } catch (error) {
            console.error('Failed to save reward settings:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.action'));
        }
    };

    const openAdjust = (member: RewardMember) => {
        setAdjustPoints('');
        setAdjustNote('');
        setAdjustMember(member);
    };

    const openRedeem = (member: RewardMember) => {
        setRedeemPoints('');
        setRedeemNote('');
        setRedeemMember(member);
    };

    const openGoalDialog = (member: RewardMember, goal?: RewardGoal) => {
        setEditingGoal(goal ?? null);
        setGoalTitle(goal?.title ?? '');
        setGoalEmoji(goal?.emoji ?? '');
        setGoalTarget(goal ? String(goal.target_amount) : '');
        setGoalMember(member);
    };

    const handleSaveGoal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!goalMember) return;
        setError('');
        try {
            const payload = {
                title: goalTitle,
                emoji: goalEmoji,
                target_amount: parseFloat(goalTarget.replace(',', '.')) || 0,
            };
            if (editingGoal) {
                await api.put(`/api/rewards/goals/${editingGoal.id}`, payload);
            } else {
                await api.post('/api/rewards/goals', { ...payload, member_id: goalMember.id });
            }
            setGoalMember(null);
            void load();
        } catch (error) {
            console.error('Failed to save goal:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.action'));
        }
    };

    const handleDeleteGoal = async () => {
        if (!editingGoal) return;
        setError('');
        try {
            await api.delete(`/api/rewards/goals/${editingGoal.id}`);
            setGoalMember(null);
            void load();
        } catch (error) {
            console.error('Failed to delete goal:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.action'));
        }
    };

    // Parent only: marks the goal achieved and auto-redeems the equivalent points.
    const handleAchieveGoal = async (goal: RewardGoal) => {
        setError('');
        try {
            await api.post(`/api/rewards/goals/${goal.id}/achieve`, {});
            void load();
        } catch (error) {
            console.error('Failed to achieve goal:', error);
            setError(error instanceof Error ? error.message : t('rewards:errors.action'));
        }
    };

    const redeemAmount = (parseInt(redeemPoints, 10) || 0) * pointsValue;

    // Shared by the parent view and the kid view.
    const goalDialog = (
        <Dialog
            open={goalMember !== null}
            onOpenChange={(open: boolean) => { if (!open) setGoalMember(null); }}
            title={editingGoal
                ? t('rewards:goalDialog.editTitle', { name: goalMember?.name ?? '' })
                : t('rewards:goalDialog.addTitle', { name: goalMember?.name ?? '' })}
            description={t('rewards:goalDialog.description')}
        >
            <form onSubmit={handleSaveGoal} className="space-y-4">
                <div className="flex gap-3">
                    <Input
                        label={t('rewards:goalDialog.emoji')}
                        value={goalEmoji}
                        onChange={(e) => setGoalEmoji(e.target.value)}
                        placeholder="🎮"
                        maxLength={8}
                        className="w-24 text-center"
                    />
                    <div className="flex-1">
                        <Input
                            label={t('rewards:goalDialog.titleLabel')}
                            value={goalTitle}
                            onChange={(e) => setGoalTitle(e.target.value)}
                            placeholder={t('rewards:goalDialog.titlePlaceholder')}
                            maxLength={200}
                            required
                        />
                    </div>
                </div>
                <Input
                    label={t('rewards:goalDialog.target', { currency })}
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    required
                />
                <div className="flex items-center justify-between gap-3 pt-2">
                    {editingGoal ? (
                        <Button type="button" variant="ghost" className="text-danger" onClick={handleDeleteGoal}>
                            {t('rewards:goalDialog.delete')}
                        </Button>
                    ) : <span />}
                    <div className="flex gap-3">
                        <Button type="button" variant="secondary" onClick={() => setGoalMember(null)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={!goalTitle.trim() || !(parseFloat(goalTarget.replace(',', '.')) > 0)}>
                            {t('common:actions.save')}
                        </Button>
                    </div>
                </div>
            </form>
        </Dialog>
    );

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">{t('rewards:loading')}</p>
                </div>
            </div>
        );
    }

    // ── Kid view: a child account linked to a member gets a simplified page ──
    if (!isParent) {
        const kidMember = (summary?.members || []).find((m) => m.linked_user_id === user?.id) || null;

        if (!kidMember) {
            return (
                <div className="max-w-2xl mx-auto">
                    <Card>
                        <CardContent className="p-10 text-center">
                            <span className="text-6xl" aria-hidden="true">🐷</span>
                            <h1 className="mt-4 text-h1">{t('rewards:kid.notLinkedTitle')}</h1>
                            <p className="mt-2 text-body text-muted-foreground">{t('rewards:kid.notLinkedMessage')}</p>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        const kidGoal = activeGoalByMember.get(kidMember.id) || null;
        const reached = kidGoal ? goalReached(kidMember, kidGoal) : false;
        const percent = kidGoal ? goalPercent(kidMember, kidGoal) : 0;
        const missing = kidGoal ? Math.max(0, kidGoal.target_amount - kidMember.currency_value) : 0;
        const myTasks = kidTasks
            .filter((task) => (task.assigned_to || []).includes(kidMember.id) && (!task.is_completed || task.pending_approval))
            .slice(0, 6);
        const myTx = (txByMember.get(kidMember.id) || []).slice(0, 5);

        return (
            <div className="max-w-3xl mx-auto space-y-6">
                {error ? (
                    <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                        {error}
                    </div>
                ) : null}

                <div className="text-center">
                    <h1 className="font-serif text-4xl tracking-tight">{t('rewards:kid.hello', { name: kidMember.name })}</h1>
                    <p className="mt-1 text-body text-muted-foreground">{t('rewards:kid.subtitle')}</p>
                </div>

                {/* Piggy bank */}
                <Card className="overflow-hidden">
                    <div className="h-2" style={{ backgroundColor: kidMember.color }} />
                    <CardContent className="p-8 text-center">
                        <PiggyBank className="mx-auto mb-3 h-12 w-12 text-pink-500" />
                        <p key={kidMember.balance} className="animate-slide-up flex items-center justify-center gap-3 font-serif text-6xl tracking-tight">
                            <Star className="h-10 w-10 text-amber-500 fill-current" />
                            {kidMember.balance}
                        </p>
                        <p className="mt-2 text-body font-medium text-muted-foreground">
                            {t('rewards:worth', { amount: formatCurrency(kidMember.currency_value, currency) })}
                        </p>
                        {kidMember.streak >= 2 && (
                            <p className="mt-2 flex items-center justify-center gap-1 text-body font-medium text-orange-500">
                                <Flame className="h-5 w-5" />
                                {t('rewards:streak', { count: kidMember.streak })}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Savings goal — the hero element */}
                {kidGoal ? (
                    <Card className={`relative overflow-hidden ${reached ? 'border-amber-400' : ''}`}>
                        {reached && <Confetti />}
                        <CardContent className="p-6 text-center">
                            <span className="text-5xl" aria-hidden="true">{kidGoal.emoji || '🎯'}</span>
                            <h2 className="mt-2 text-h2">{kidGoal.title}</h2>
                            <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-border">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${percent}%`, backgroundColor: reached ? '#F59E0B' : kidMember.color }}
                                />
                            </div>
                            <p className="mt-2 text-body font-semibold tabular-nums">
                                {t('rewards:goals.progress', {
                                    current: formatCurrency(kidMember.currency_value, currency),
                                    target: formatCurrency(kidGoal.target_amount, currency),
                                })}
                                {' · '}{percent}%
                            </p>
                            {reached ? (
                                <>
                                    <p className="mt-2 text-body font-semibold text-amber-600">{t('rewards:kid.reached')}</p>
                                    <p className="mt-1 text-caption text-muted-foreground">{t('rewards:kid.reachedHint')}</p>
                                </>
                            ) : (
                                <p className="mt-1 text-caption text-muted-foreground">
                                    {t('rewards:kid.missing', { amount: formatCurrency(missing, currency) })}
                                </p>
                            )}
                            <Button variant="secondary" size="sm" className="mt-4" onClick={() => openGoalDialog(kidMember, kidGoal)}>
                                <Target className="mr-1 h-4 w-4" />
                                {t('rewards:kid.editGoal')}
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardContent className="p-8 text-center">
                            <span className="text-5xl" aria-hidden="true">🌟</span>
                            <p className="mt-3 text-body text-muted-foreground">{t('rewards:kid.noGoal')}</p>
                            <Button className="mt-4" onClick={() => openGoalDialog(kidMember)}>
                                <Target className="mr-2 h-4 w-4" />
                                {t('rewards:kid.addGoal')}
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* The child's tasks (read-only) */}
                <Card>
                    <CardContent className="p-5">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h2 className="flex items-center gap-2 text-body font-semibold">
                                <ListChecks className="h-5 w-5 text-primary" />
                                {t('rewards:kid.tasksTitle')}
                            </h2>
                            <Link to="/tasks" className="text-caption font-medium text-primary hover:underline">
                                {t('rewards:kid.allTasks')}
                            </Link>
                        </div>
                        {myTasks.length === 0 ? (
                            <p className="text-caption text-muted-foreground">{t('rewards:kid.tasksEmpty')}</p>
                        ) : (
                            <ul className="space-y-2">
                                {myTasks.map((task) => (
                                    <li key={task.id} className="flex items-center gap-3 rounded-input border border-border bg-card px-3 py-2.5">
                                        <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                                        {task.pending_approval && (
                                            <Badge variant="warning" className="flex items-center gap-1">
                                                <Hourglass className="h-3 w-3" />
                                                {t('rewards:kid.pendingBadge')}
                                            </Badge>
                                        )}
                                        {task.points > 0 && (
                                            <Badge variant="primary" className="flex items-center gap-1">
                                                <Star className="h-3 w-3 fill-current" />
                                                {task.points}
                                            </Badge>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                {/* Simplified history */}
                {myTx.length > 0 && (
                    <Card>
                        <CardContent className="p-5">
                            <h2 className="mb-3 text-body font-semibold">{t('rewards:kid.historyTitle')}</h2>
                            <ul className="space-y-1.5">
                                {myTx.map((tx) => (
                                    <li key={tx.id} className="flex items-center gap-2 text-caption">
                                        {txIcon(tx.type)}
                                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                            {tx.note || t(`rewards:types.${tx.type}`)}
                                        </span>
                                        <span className="shrink-0 text-micro text-muted-foreground">
                                            {format(parseISO(tx.created_at), 'dd MMM', { locale: dateLocale() })}
                                        </span>
                                        <span className={`shrink-0 font-semibold tabular-nums ${tx.points >= 0 ? 'text-success' : 'text-danger'}`}>
                                            {tx.points >= 0 ? `+${tx.points}` : tx.points}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                )}

                {goalDialog}
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {error}
                </div>
            ) : null}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 mb-1">{t('rewards:title')}</h1>
                    <p className="text-muted-foreground text-body">{t('rewards:subtitle')}</p>
                </div>
                {isParent && (
                    <Button variant="secondary" onClick={() => {
                        setSettingsValue(String(pointsValue));
                        setSettingsOpen(true);
                    }}>
                        <Settings2 className="w-4 h-4 mr-2" />
                        {t('rewards:settings.rate', { value: formatCurrency(pointsValue, currency) })}
                    </Button>
                )}
            </div>

            {/* Parent-only approvals queue */}
            {isParent && (summary?.pending_tasks || []).length > 0 && (
                <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                    <CardContent className="p-4">
                        <h2 className="mb-3 flex items-center gap-2 text-body font-semibold">
                            <Hourglass className="h-5 w-5 text-warning" />
                            {t('rewards:approvals.title', { count: summary!.pending_tasks.length })}
                        </h2>
                        <ul className="space-y-2">
                            {summary!.pending_tasks.map((task) => (
                                <li key={task.id} className="flex flex-wrap items-center gap-3 rounded-input bg-card px-3 py-2.5 border border-border">
                                    <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                                    {task.assigned_to_members.map((m) => (
                                        <Badge key={m.id} variant="primary" className="flex items-center gap-1">
                                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                                            {m.name}
                                        </Badge>
                                    ))}
                                    <Badge variant="warning" className="flex items-center gap-1">
                                        <Star className="h-3 w-3 fill-current" />
                                        {task.points}
                                    </Badge>
                                    <div className="flex items-center gap-2">
                                        <Button variant="secondary" size="sm" onClick={() => handleApprove(task.id)} className="text-success">
                                            <Check className="h-4 w-4 mr-1" />
                                            {t('rewards:approvals.approve')}
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleReject(task.id)} className="text-destructive">
                                            <X className="h-4 w-4 mr-1" />
                                            {t('rewards:approvals.reject')}
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {/* Member cards */}
            {visibleMembers.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <PiggyBank className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <p className="text-muted-foreground">{t('rewards:empty')}</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleMembers.map((member) => {
                        const memberTx = (txByMember.get(member.id) || []).slice(0, 5);
                        return (
                            <Card key={member.id} className="overflow-hidden">
                                <div className="h-1.5" style={{ backgroundColor: member.color }} />
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-11 w-11 items-center justify-center rounded-full text-white text-body font-semibold"
                                                style={{ backgroundColor: member.color }}
                                            >
                                                {member.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-body font-semibold">{member.name}</p>
                                                {member.streak >= 2 && (
                                                    <p className="flex items-center gap-1 text-caption text-orange-500">
                                                        <Flame className="h-4 w-4" />
                                                        {t('rewards:streak', { count: member.streak })}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {member.pending_count > 0 && (
                                            <Badge variant="warning" className="flex items-center gap-1">
                                                <Hourglass className="h-3 w-3" />
                                                {t('rewards:pendingCount', { count: member.pending_count })}
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="mt-4 flex items-end justify-between gap-3">
                                        <div key={member.balance} className="animate-slide-up">
                                            <p className="flex items-center gap-2 font-serif text-4xl tracking-tight">
                                                <Star className="h-7 w-7 text-amber-500 fill-current" />
                                                {member.balance}
                                            </p>
                                            <p className="mt-1 text-caption text-muted-foreground">
                                                {t('rewards:worth', { amount: formatCurrency(member.currency_value, currency) })}
                                            </p>
                                        </div>
                                        {isParent && (
                                            <div className="flex items-center gap-2">
                                                <Button variant="secondary" size="sm" onClick={() => openAdjust(member)}>
                                                    <SlidersHorizontal className="h-4 w-4 mr-1" />
                                                    {t('rewards:actions.adjust')}
                                                </Button>
                                                <Button size="sm" onClick={() => openRedeem(member)} disabled={member.balance <= 0}>
                                                    <Coins className="h-4 w-4 mr-1" />
                                                    {t('rewards:actions.redeem')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Savings goal */}
                                    {(() => {
                                        const goal = activeGoalByMember.get(member.id);
                                        if (!goal) {
                                            return isParent ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openGoalDialog(member)}
                                                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-input border border-dashed border-border px-3 py-2 text-caption text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                                >
                                                    <Target className="h-4 w-4" />
                                                    {t('rewards:goals.add')}
                                                </button>
                                            ) : null;
                                        }
                                        const reached = goalReached(member, goal);
                                        const percent = goalPercent(member, goal);
                                        return (
                                            <div className={`mt-4 rounded-input border px-3 py-3 ${reached ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20' : 'border-border bg-surface-2'}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openGoalDialog(member, goal)}
                                                        disabled={!isParent}
                                                        className="flex min-w-0 items-center gap-2 text-left"
                                                        title={isParent ? t('rewards:goals.editTitle') : undefined}
                                                    >
                                                        <span className="text-xl" aria-hidden="true">{goal.emoji || '🎯'}</span>
                                                        <span className="truncate text-caption font-semibold">{goal.title}</span>
                                                    </button>
                                                    <span className="shrink-0 text-caption font-semibold tabular-nums">{percent}%</span>
                                                </div>
                                                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-border">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${percent}%`, backgroundColor: reached ? '#F59E0B' : member.color }}
                                                    />
                                                </div>
                                                <div className="mt-1.5 flex items-center justify-between gap-2">
                                                    <span className="text-micro text-muted-foreground tabular-nums">
                                                        {t('rewards:goals.progress', {
                                                            current: formatCurrency(member.currency_value, currency),
                                                            target: formatCurrency(goal.target_amount, currency),
                                                        })}
                                                    </span>
                                                    {isParent && reached && (
                                                        <Button size="sm" onClick={() => handleAchieveGoal(goal)}>
                                                            <Trophy className="mr-1 h-4 w-4" />
                                                            {t('rewards:goals.markAchieved')}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {memberTx.length > 0 && (
                                        <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
                                            {memberTx.map((tx) => (
                                                <li key={tx.id} className="flex items-center gap-2 text-caption">
                                                    {txIcon(tx.type)}
                                                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                                        {tx.note || t(`rewards:types.${tx.type}`)}
                                                    </span>
                                                    <span className="shrink-0 text-micro text-muted-foreground">
                                                        {format(parseISO(tx.created_at), 'dd MMM', { locale: dateLocale() })}
                                                    </span>
                                                    <span className={`shrink-0 font-semibold tabular-nums ${tx.points >= 0 ? 'text-success' : 'text-danger'}`}>
                                                        {tx.points >= 0 ? `+${tx.points}` : tx.points}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Goal dialog (add / edit / delete) */}
            {goalDialog}

            {/* Adjust dialog */}
            <Dialog
                open={adjustMember !== null}
                onOpenChange={(open: boolean) => { if (!open) setAdjustMember(null); }}
                title={t('rewards:adjustDialog.title', { name: adjustMember?.name ?? '' })}
                description={t('rewards:adjustDialog.description')}
            >
                <form onSubmit={handleAdjust} className="space-y-4">
                    <Input
                        label={t('rewards:adjustDialog.points')}
                        type="number"
                        step={1}
                        value={adjustPoints}
                        onChange={(e) => setAdjustPoints(e.target.value)}
                        placeholder="+10 / -5"
                        required
                    />
                    <Input
                        label={t('rewards:fields.note')}
                        value={adjustNote}
                        onChange={(e) => setAdjustNote(e.target.value)}
                        placeholder={t('rewards:adjustDialog.notePlaceholder')}
                    />
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setAdjustMember(null)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={!parseInt(adjustPoints, 10)}>
                            {t('common:actions.save')}
                        </Button>
                    </div>
                </form>
            </Dialog>

            {/* Redeem dialog */}
            <Dialog
                open={redeemMember !== null}
                onOpenChange={(open: boolean) => { if (!open) setRedeemMember(null); }}
                title={t('rewards:redeemDialog.title', { name: redeemMember?.name ?? '' })}
                description={t('rewards:redeemDialog.description', { balance: redeemMember?.balance ?? 0 })}
            >
                <form onSubmit={handleRedeem} className="space-y-4">
                    <Input
                        label={t('rewards:redeemDialog.points')}
                        type="number"
                        min={1}
                        max={redeemMember?.balance ?? 0}
                        step={1}
                        value={redeemPoints}
                        onChange={(e) => setRedeemPoints(e.target.value)}
                        required
                    />
                    <p className="flex items-center gap-2 rounded-input bg-surface-2 px-3 py-2.5 text-body font-medium">
                        <PiggyBank className="h-5 w-5 text-pink-500" />
                        {t('rewards:redeemDialog.amount', { amount: formatCurrency(redeemAmount, currency) })}
                    </p>
                    <Input
                        label={t('rewards:fields.note')}
                        value={redeemNote}
                        onChange={(e) => setRedeemNote(e.target.value)}
                        placeholder={t('rewards:redeemDialog.notePlaceholder')}
                    />
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setRedeemMember(null)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                (parseInt(redeemPoints, 10) || 0) <= 0
                                || (parseInt(redeemPoints, 10) || 0) > (redeemMember?.balance ?? 0)
                            }
                        >
                            {t('rewards:actions.redeem')}
                        </Button>
                    </div>
                </form>
            </Dialog>

            {/* Settings dialog */}
            <Dialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                title={t('rewards:settings.title')}
                description={t('rewards:settings.description')}
            >
                <form onSubmit={handleSaveSettings} className="space-y-4">
                    <Input
                        label={t('rewards:settings.label')}
                        type="number"
                        min={0}
                        step={0.01}
                        value={settingsValue}
                        onChange={(e) => setSettingsValue(e.target.value)}
                        required
                    />
                    <p className="text-caption text-muted-foreground">
                        {t('rewards:settings.example', {
                            points: 10,
                            amount: formatCurrency((parseFloat(settingsValue.replace(',', '.')) || 0) * 10, currency),
                        })}
                    </p>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit">{t('common:actions.save')}</Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Rewards;
