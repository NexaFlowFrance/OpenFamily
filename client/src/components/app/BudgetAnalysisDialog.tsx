import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import {
    Sparkles,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Lightbulb,
    Info,
    PiggyBank,
    BellRing,
} from 'lucide-react';
import { Button, Dialog } from '../ui';
import { useCurrency } from '../../lib/useCurrency';

type Verdict = 'Excellent' | 'Sain' | 'À surveiller' | 'Critique';

interface SavingsOpportunity {
    category: string;
    estimatedAmount: number;
    how: string;
}

interface Recommendation {
    title: string;
    detail: string;
}

interface BudgetAnalysis {
    score: number;
    verdict: Verdict;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    savingsOpportunities: SavingsOpportunity[];
    recommendations: Recommendation[];
    alerts: string[];
}

interface AnalyzeResponseData {
    analysis: BudgetAnalysis | null;
    model: string;
    aiUnavailable?: boolean;
    code?: string;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    month: number;
    year: number;
    /** Pretty month label for the header ("Mars 2026"), supplied by the parent. */
    periodLabel: string;
}

const VERDICT_STYLE: Record<Verdict, { text: string; bg: string; ring: string; emoji: string }> = {
    Excellent: { text: 'text-success', bg: 'bg-success-soft', ring: 'ring-success', emoji: '🌿' },
    Sain: { text: 'text-info', bg: 'bg-info-soft', ring: 'ring-info', emoji: '👍' },
    'À surveiller': {
        text: 'text-warning',
        bg: 'bg-warning-soft',
        ring: 'ring-warning',
        emoji: '⚠️',
    },
    Critique: {
        text: 'text-danger',
        bg: 'bg-danger-soft',
        ring: 'ring-danger',
        emoji: '🛟',
    },
};

const verdictGradientVar = (verdict: Verdict): string => {
    switch (verdict) {
        case 'Excellent':
            return 'success';
        case 'Sain':
            return 'info';
        case 'À surveiller':
            return 'warning';
        case 'Critique':
            return 'danger';
    }
};

const ScoreGauge: React.FC<{ score: number; verdict: Verdict }> = ({ score, verdict }) => {
    const { t } = useTranslation();
    const style = VERDICT_STYLE[verdict];
    const angle = Math.round((score / 100) * 360);
    return (
        <div className="flex flex-col items-center">
            <div
                className={`relative w-28 h-28 rounded-full ${style.ring} ring-4`}
                style={{
                    background: `conic-gradient(rgb(var(--${verdictGradientVar(verdict)})) ${angle}deg, rgb(var(--surface-2-rgb)) ${angle}deg)`,
                }}
            >
                <div className="absolute inset-2 rounded-full bg-card flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold ${style.text}`}>{score}</span>
                    <span className="text-label-sm text-muted-foreground">/ 100</span>
                </div>
            </div>
            <div
                className={`mt-3 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-label-sm font-medium ${style.bg} ${style.text}`}
            >
                <span>{style.emoji}</span>
                {t('budget.analysisDialog.verdict.' + verdict, { defaultValue: verdict })}
            </div>
        </div>
    );
};

export const BudgetAnalysisDialog: React.FC<Props> = ({
    open,
    onOpenChange,
    month,
    year,
    periodLabel,
}) => {
    const { t } = useTranslation();
    const { format: formatMoney } = useCurrency();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState<AnalyzeResponseData | null>(null);
    // Reset when the user navigates to another month and re-opens the dialog.
    const [analyzedFor, setAnalyzedFor] = useState<string>('');

    const runAnalysis = async () => {
        setLoading(true);
        setError('');
        setData(null);
        try {
            const response = await api.post<{
                success: boolean;
                data?: AnalyzeResponseData;
                error?: { code?: string; message?: string };
            }>('/api/ai/budget/analyze-month', { month, year });
            if (!response.success) {
                setError(response.error?.message || t('budget.analysisDialog.analysis_failed'));
                return;
            }
            setData(response.data ?? null);
            setAnalyzedFor(`${month}|${year}`);
        } catch (err) {
            console.error('Budget analysis failed:', err);
            setError(
                err instanceof Error ? err.message : t('budget.analysisDialog.analysis_impossible'),
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        const key = `${month}|${year}`;
        if (data && analyzedFor === key) return;
        void runAnalysis();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, month, year]);

    const analysis = data?.analysis ?? null;
    const isEmptyMonth = data?.code === 'EMPTY_MONTH';

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('budget.analysisDialog.title')}
            description={t('budget.analysisDialog.description', { period: periodLabel })}
            className="sm:max-w-3xl"
        >
            <div className="space-y-5">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                        <p className="text-body text-muted-foreground">
                            {t('budget.analysisDialog.analyzing')}
                        </p>
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2 rounded-input border border-danger/30 bg-danger-soft px-4 py-3 text-caption text-danger">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {isEmptyMonth && !loading && (
                    <div className="flex items-start gap-2 rounded-input border border-info/30 bg-info-soft px-4 py-3 text-caption text-info">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                            {t('budget.analysisDialog.empty_month', { period: periodLabel })}
                        </span>
                    </div>
                )}

                {data?.aiUnavailable && !loading && (
                    <div className="flex items-start gap-2 rounded-input border border-warning/30 bg-warning-soft px-4 py-3 text-caption text-warning">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                            {data.code === 'QUOTA_EXCEEDED'
                                ? t('budget.analysisDialog.quota_exceeded')
                                : data.code === 'DISABLED'
                                  ? t('budget.analysisDialog.disabled')
                                  : t('budget.analysisDialog.unusable')}
                        </span>
                    </div>
                )}

                {analysis && !loading && (
                    <>
                        <section className="flex flex-col sm:flex-row items-center sm:items-start gap-6 rounded-card border border-border bg-card p-5">
                            <ScoreGauge score={analysis.score} verdict={analysis.verdict} />
                            <div className="flex-1">
                                <h3 className="text-h2 font-semibold mb-2">
                                    {t('budget.analysisDialog.diagnostic')}
                                </h3>
                                <p className="text-caption text-foreground">{analysis.summary}</p>
                            </div>
                        </section>

                        {analysis.alerts.length > 0 && (
                            <section className="rounded-card border border-danger/30 bg-danger-soft p-4">
                                <h4 className="flex items-center gap-2 text-body font-semibold text-danger mb-2">
                                    <BellRing className="h-4 w-4" />
                                    {t('budget.analysisDialog.alerts')}
                                </h4>
                                <ul className="space-y-1.5">
                                    {analysis.alerts.map((a, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-2 text-caption text-foreground"
                                        >
                                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-danger" />
                                            {a}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {analysis.strengths.length > 0 && (
                                <div className="rounded-card border border-success/30 bg-success-soft/40 p-4">
                                    <h4 className="flex items-center gap-2 text-body font-semibold text-success mb-2">
                                        <CheckCircle2 className="h-4 w-4" />
                                        {t('budget.analysisDialog.strengths')}
                                    </h4>
                                    <ul className="space-y-1.5">
                                        {analysis.strengths.map((s, i) => (
                                            <li
                                                key={i}
                                                className="flex items-start gap-2 text-caption text-foreground"
                                            >
                                                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-success" />
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {analysis.weaknesses.length > 0 && (
                                <div className="rounded-card border border-warning/30 bg-warning-soft/40 p-4">
                                    <h4 className="flex items-center gap-2 text-body font-semibold text-warning mb-2">
                                        <XCircle className="h-4 w-4" />
                                        {t('budget.analysisDialog.weaknesses')}
                                    </h4>
                                    <ul className="space-y-1.5">
                                        {analysis.weaknesses.map((w, i) => (
                                            <li
                                                key={i}
                                                className="flex items-start gap-2 text-caption text-foreground"
                                            >
                                                <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-warning" />
                                                {w}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>

                        {analysis.savingsOpportunities.length > 0 && (
                            <section className="rounded-card border border-primary/30 bg-primary/5 p-4">
                                <h4 className="flex items-center gap-2 text-body font-semibold text-primary mb-3">
                                    <PiggyBank className="h-4 w-4" />
                                    {t('budget.analysisDialog.savings')}
                                </h4>
                                <ul className="space-y-2">
                                    {analysis.savingsOpportunities.map((s, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start justify-between gap-3 rounded-input bg-card px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-caption font-medium text-foreground">
                                                    {t('budget.categories.' + s.category, {
                                                        defaultValue: s.category,
                                                    })}
                                                </p>
                                                <p className="text-label-sm text-muted-foreground">
                                                    {s.how}
                                                </p>
                                            </div>
                                            <span className="flex-shrink-0 rounded-pill bg-success/15 text-success px-2.5 py-0.5 text-label-sm font-semibold whitespace-nowrap">
                                                ≈ {formatMoney(s.estimatedAmount)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {analysis.recommendations.length > 0 && (
                            <section className="rounded-card border border-border bg-card p-4">
                                <h4 className="flex items-center gap-2 text-body font-semibold text-foreground mb-3">
                                    <Lightbulb className="h-4 w-4 text-accent" />
                                    {t('budget.analysisDialog.recommendations')}
                                </h4>
                                <ol className="space-y-3">
                                    {analysis.recommendations.map((r, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <span className="flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-label-sm font-semibold">
                                                {i + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-caption font-semibold text-foreground">
                                                    {r.title}
                                                </p>
                                                <p className="text-label-sm text-muted-foreground">
                                                    {r.detail}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}
                    </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={runAnalysis}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {t('budget.analysisDialog.re_analyzing')}
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                {t('budget.analysisDialog.re_analyze')}
                            </>
                        )}
                    </Button>
                    <Button type="button" onClick={() => onOpenChange(false)}>
                        {t('budget.analysisDialog.close')}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default BudgetAnalysisDialog;
