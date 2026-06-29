import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2, AlertTriangle, Lightbulb, Droplets, Clock } from 'lucide-react';
import { Button, Dialog, Select } from '../ui';
import {
    GARDEN_SEASONS,
    useGenerateGardeningTips,
    type GardenSeason,
    type GardenTips,
} from '../../hooks/useGarden';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    zoneId: string;
    zoneName: string;
}

// Maps the current month to a default season (Northern hemisphere):
// Dec-Feb → Hiver, Mar-May → Printemps, Jun-Aug → Été, Sep-Nov → Automne.
const currentSeason = (): GardenSeason => {
    const m = new Date().getMonth(); // 0-11
    if (m === 11 || m <= 1) return 'Hiver';
    if (m <= 4) return 'Printemps';
    if (m <= 7) return 'Été';
    return 'Automne';
};

export const GardenTipsDialog: React.FC<Props> = ({ open, onOpenChange, zoneId, zoneName }) => {
    const { t } = useTranslation();
    const [season, setSeason] = useState<GardenSeason>(currentSeason());
    const [tips, setTips] = useState<GardenTips | null>(null);
    const [error, setError] = useState('');
    const generate = useGenerateGardeningTips();

    const seasonOptions = useMemo(
        () =>
            GARDEN_SEASONS.map((s) => ({
                value: s,
                label: t('garden.seasons.' + s, { defaultValue: s }),
            })),
        [t],
    );

    const runTips = async (forSeason: GardenSeason) => {
        setError('');
        setTips(null);
        try {
            const result = await generate.mutateAsync({ zoneId, season: forSeason });
            setTips(result.tips);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('garden.tips.failed'));
        }
    };

    // Auto-run once when the dialog opens for a zone.
    useEffect(() => {
        if (!open) return;
        const initial = currentSeason();
        setSeason(initial);
        void runTips(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, zoneId]);

    const loading = generate.isPending;

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('garden.tips.title')}
            description={t('garden.tips.description', { zone: zoneName })}
            className="sm:max-w-2xl"
        >
            <div className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.tips.season')}
                        </label>
                        <Select
                            value={season}
                            onValueChange={(v) => setSeason(v as GardenSeason)}
                            options={seasonOptions}
                        />
                    </div>
                    <Button
                        type="button"
                        onClick={() => runTips(season)}
                        disabled={loading}
                        className="sm:w-auto"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('garden.tips.generating')}
                            </>
                        ) : (
                            <>
                                <Sparkles className="mr-2 h-4 w-4" />
                                {t('garden.tips.generate')}
                            </>
                        )}
                    </Button>
                </div>

                {loading && (
                    <div className="flex flex-col items-center justify-center py-10">
                        <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" />
                        <p className="text-body text-muted-foreground">
                            {t('garden.tips.generating')}
                        </p>
                    </div>
                )}

                {error && !loading && (
                    <div className="flex items-start gap-2 rounded-input border border-warning/30 bg-warning-soft px-4 py-3 text-caption text-warning">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{t('garden.tips.softNotice')}</span>
                    </div>
                )}

                {tips && !loading && (
                    <>
                        <section className="rounded-card border border-border bg-card p-4">
                            <p className="text-caption text-foreground">{tips.summary}</p>
                        </section>

                        {tips.tips.length > 0 && (
                            <section className="rounded-card border border-border bg-card p-4">
                                <h4 className="mb-3 flex items-center gap-2 text-body font-semibold text-foreground">
                                    <Lightbulb className="h-4 w-4 text-accent" />
                                    {t('garden.tips.recommendations')}
                                </h4>
                                <ol className="space-y-3">
                                    {tips.tips.map((tip, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-label-sm font-semibold text-primary-foreground">
                                                {i + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-caption font-semibold text-foreground">
                                                    {tip.title}
                                                </p>
                                                <p className="text-label-sm text-muted-foreground">
                                                    {tip.detail}
                                                </p>
                                                {tip.timing && (
                                                    <p className="mt-1 inline-flex items-center gap-1 text-micro text-muted-foreground">
                                                        <Clock className="h-3 w-3" />
                                                        {tip.timing}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}

                        {tips.wateringSchedule && (
                            <section className="rounded-card border border-info/30 bg-info-soft/40 p-4">
                                <h4 className="mb-1.5 flex items-center gap-2 text-body font-semibold text-info">
                                    <Droplets className="h-4 w-4" />
                                    {t('garden.tips.watering')}
                                </h4>
                                <p className="text-caption text-foreground">
                                    {tips.wateringSchedule}
                                </p>
                            </section>
                        )}

                        {tips.warnings.length > 0 && (
                            <section className="rounded-card border border-warning/30 bg-warning-soft/40 p-4">
                                <h4 className="mb-2 flex items-center gap-2 text-body font-semibold text-warning">
                                    <AlertTriangle className="h-4 w-4" />
                                    {t('garden.tips.warnings')}
                                </h4>
                                <ul className="space-y-1.5">
                                    {tips.warnings.map((w, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-2 text-caption text-foreground"
                                        >
                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
                                            {w}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                )}

                <div className="flex justify-end pt-2">
                    <Button type="button" onClick={() => onOpenChange(false)}>
                        {t('garden.common.close')}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default GardenTipsDialog;
