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
} from 'lucide-react';
import { Card, CardContent, Button, Dialog } from '../ui';

type Verdict = 'Excellent' | 'Bon' | 'À améliorer' | 'Déséquilibré';

interface Recommendation {
    title: string;
    detail: string;
}

interface NutritionAnalysis {
    score: number;
    verdict: Verdict;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    missingFoodGroups: string[];
    recommendations: Recommendation[];
}

interface AnalyzeResponseData {
    analysis: NutritionAnalysis | null;
    mealsAnalyzed: number;
    model: string;
    aiUnavailable?: boolean;
    code?: string;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** ISO YYYY-MM-DD */
    weekStart: string;
    /** ISO YYYY-MM-DD */
    weekEnd: string;
}

// Tailwind class triplet (text / bg / ring) keyed on verdict so the gauge
// matches the headline at a glance.
const VERDICT_STYLE: Record<Verdict, { text: string; bg: string; ring: string; emoji: string }> = {
    Excellent: { text: 'text-success', bg: 'bg-success-soft', ring: 'ring-success', emoji: '🌿' },
    Bon: { text: 'text-info', bg: 'bg-info-soft', ring: 'ring-info', emoji: '👍' },
    'À améliorer': {
        text: 'text-warning',
        bg: 'bg-warning-soft',
        ring: 'ring-warning',
        emoji: '⚠️',
    },
    Déséquilibré: {
        text: 'text-danger',
        bg: 'bg-danger-soft',
        ring: 'ring-danger',
        emoji: '🛟',
    },
};

const ScoreGauge: React.FC<{ score: number; verdict: Verdict }> = ({ score, verdict }) => {
    const { t } = useTranslation();
    const style = VERDICT_STYLE[verdict];
    // Conic gradient angle (0–360) mapped from score 0–100.
    const angle = Math.round((score / 100) * 360);
    return (
        <div className="flex flex-col items-center">
            <div
                className={`relative w-28 h-28 rounded-full ${style.ring} ring-4`}
                style={{
                    background: `conic-gradient(rgb(var(--${
                        verdict === 'Excellent'
                            ? 'success'
                            : verdict === 'Bon'
                              ? 'info'
                              : verdict === 'À améliorer'
                                ? 'warning'
                                : 'danger'
                    })) ${angle}deg, rgb(var(--surface-2-rgb)) ${angle}deg)`,
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
                {t('recipes.nutritionDialog.verdict.' + verdict, { defaultValue: verdict })}
            </div>
        </div>
    );
};

export const NutritionAnalysisDialog: React.FC<Props> = ({
    open,
    onOpenChange,
    weekStart,
    weekEnd,
}) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState<AnalyzeResponseData | null>(null);
    // Reset when the user navigates to another week and re-opens the dialog.
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
            }>('/api/ai/meals/analyze-week', {
                startDate: weekStart,
                endDate: weekEnd,
            });
            if (!response.success) {
                setError(response.error?.message || t('recipes.nutritionDialog.analysis_failed'));
                return;
            }
            setData(response.data ?? null);
            setAnalyzedFor(`${weekStart}|${weekEnd}`);
        } catch (err) {
            console.error('Nutrition analysis failed:', err);
            setError(
                err instanceof Error
                    ? err.message
                    : t('recipes.nutritionDialog.analysis_impossible'),
            );
        } finally {
            setLoading(false);
        }
    };

    // Auto-trigger when dialog opens for a new week the user hasn't analyzed yet.
    useEffect(() => {
        if (!open) return;
        const key = `${weekStart}|${weekEnd}`;
        if (data && analyzedFor === key) return;
        void runAnalysis();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, weekStart, weekEnd]);

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('recipes.nutritionDialog.title')}
            description={t('recipes.nutritionDialog.description')}
            className="sm:max-w-3xl"
        >
            <div className="space-y-5">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                        <p className="text-body text-muted-foreground">
                            {t('recipes.nutritionDialog.analyzing')}
                        </p>
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2 rounded-input border border-danger/30 bg-danger-soft px-4 py-3 text-caption text-danger">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {data?.aiUnavailable && (
                    <div className="flex items-start gap-2 rounded-input border border-warning/30 bg-warning-soft px-4 py-3 text-caption text-warning">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                            {data.code === 'QUOTA_EXCEEDED'
                                ? t('recipes.nutritionDialog.quota_exceeded')
                                : data.code === 'DISABLED'
                                  ? t('recipes.nutritionDialog.disabled')
                                  : t('recipes.nutritionDialog.unavailable')}
                        </span>
                    </div>
                )}

                {data?.analysis && !loading && (
                    <>
                        {/* Score + verdict + summary */}
                        <Card>
                            <CardContent className="p-5 flex flex-col sm:flex-row gap-5 items-start">
                                <ScoreGauge
                                    score={data.analysis.score}
                                    verdict={data.analysis.verdict}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-body text-foreground leading-relaxed">
                                        {data.analysis.summary}
                                    </p>
                                    <p className="text-label-sm text-muted-foreground mt-3">
                                        {t('recipes.nutritionDialog.meals_analyzed', {
                                            count: data.mealsAnalyzed,
                                        })}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Strengths + weaknesses side-by-side on desktop */}
                        {(data.analysis.strengths.length > 0 ||
                            data.analysis.weaknesses.length > 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {data.analysis.strengths.length > 0 && (
                                    <Card>
                                        <CardContent className="p-4">
                                            <h4 className="text-body font-semibold flex items-center gap-2 mb-2">
                                                <CheckCircle2 className="h-4 w-4 text-success" />
                                                {t('recipes.nutritionDialog.strengths')}
                                            </h4>
                                            <ul className="space-y-1.5 text-caption text-muted-foreground">
                                                {data.analysis.strengths.map((s, i) => (
                                                    <li key={i} className="flex gap-2">
                                                        <span className="text-success mt-0.5">
                                                            ✓
                                                        </span>
                                                        <span>{s}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </CardContent>
                                    </Card>
                                )}
                                {data.analysis.weaknesses.length > 0 && (
                                    <Card>
                                        <CardContent className="p-4">
                                            <h4 className="text-body font-semibold flex items-center gap-2 mb-2">
                                                <XCircle className="h-4 w-4 text-danger" />
                                                {t('recipes.nutritionDialog.weaknesses')}
                                            </h4>
                                            <ul className="space-y-1.5 text-caption text-muted-foreground">
                                                {data.analysis.weaknesses.map((w, i) => (
                                                    <li key={i} className="flex gap-2">
                                                        <span className="text-danger mt-0.5">
                                                            !
                                                        </span>
                                                        <span>{w}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        )}

                        {/* Missing food groups */}
                        {data.analysis.missingFoodGroups.length > 0 && (
                            <Card>
                                <CardContent className="p-4">
                                    <h4 className="text-body font-semibold flex items-center gap-2 mb-2">
                                        <Info className="h-4 w-4 text-info" />
                                        {t('recipes.nutritionDialog.missing_groups')}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {data.analysis.missingFoodGroups.map((g, i) => (
                                            <span
                                                key={i}
                                                className="rounded-pill bg-info-soft text-info px-3 py-1 text-label-sm"
                                            >
                                                {g}
                                            </span>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Recommendations */}
                        {data.analysis.recommendations.length > 0 && (
                            <Card>
                                <CardContent className="p-4">
                                    <h4 className="text-body font-semibold flex items-center gap-2 mb-3">
                                        <Lightbulb className="h-4 w-4 text-accent" />
                                        {t('recipes.nutritionDialog.recommendations')}
                                    </h4>
                                    <ol className="space-y-3">
                                        {data.analysis.recommendations.map((r, i) => (
                                            <li
                                                key={i}
                                                className="rounded-input border border-border bg-surface p-3"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-label-sm font-semibold">
                                                        {i + 1}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-body font-medium text-foreground">
                                                            {r.title}
                                                        </p>
                                                        <p className="text-caption text-muted-foreground mt-0.5">
                                                            {r.detail}
                                                        </p>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                </CardContent>
                            </Card>
                        )}
                    </>
                )}

                {/* Empty week */}
                {data && !data.analysis && !data.aiUnavailable && !loading && (
                    <div className="text-center py-8">
                        <p className="text-body text-muted-foreground">
                            {t('recipes.nutritionDialog.empty_week')}
                        </p>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        {t('recipes.nutritionDialog.close')}
                    </Button>
                    {data && !loading && (
                        <Button type="button" onClick={runAnalysis}>
                            <Sparkles className="w-4 h-4 mr-2" />
                            {t('recipes.nutritionDialog.re_analyze')}
                        </Button>
                    )}
                </div>
            </div>
        </Dialog>
    );
};
