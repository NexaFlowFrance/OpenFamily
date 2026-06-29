import React from 'react';
import { useTranslation } from 'react-i18next';
import { Edit2, Trash2, Sprout, Sun, MapPin, Sparkles } from 'lucide-react';
import { Badge } from '../ui';
import type { GardenZone } from '../../hooks/useGarden';

interface ZoneCardProps {
    zone: GardenZone;
    onEdit: () => void;
    onDelete: () => void;
    onTips: () => void;
}

const ZoneCard: React.FC<ZoneCardProps> = ({ zone, onEdit, onDelete, onTips }) => {
    const { t } = useTranslation();

    return (
        <div className="group rounded-card border border-border bg-card p-4 shadow-surface transition-all hover:border-primary/40 hover:shadow-surface-hover">
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-success/10 text-success">
                        <Sprout className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-caption font-semibold">{zone.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="success">
                                {t('garden.zoneTypes.' + zone.zone_type, {
                                    defaultValue: zone.zone_type,
                                })}
                            </Badge>
                            {zone.location && (
                                <span className="inline-flex items-center gap-0.5 text-micro text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {t('garden.locations.' + zone.location, {
                                        defaultValue: zone.location,
                                    })}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 gap-1">
                    <button
                        onClick={onEdit}
                        className="rounded p-1 hover:bg-surface-2"
                        aria-label={t('garden.common.edit')}
                    >
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="rounded p-1 hover:bg-destructive/10"
                        aria-label={t('garden.common.delete')}
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted-foreground">
                <span>{t('garden.zone.plantsCount', { count: zone.plants_count })}</span>
                {zone.area_m2 != null && (
                    <span>· {t('garden.zone.area', { area: zone.area_m2 })}</span>
                )}
                {zone.sun_exposure && (
                    <span className="inline-flex items-center gap-0.5">
                        · <Sun className="h-3 w-3" />
                        {t('garden.sunExposures.' + zone.sun_exposure, {
                            defaultValue: zone.sun_exposure,
                        })}
                    </span>
                )}
                {zone.soil_type && <span>· {zone.soil_type}</span>}
            </div>

            {zone.notes && (
                <p className="mt-2 border-l-2 border-border pl-2 text-micro italic text-muted-foreground line-clamp-2">
                    {zone.notes}
                </p>
            )}

            <div className="mt-3 flex justify-end">
                <button
                    type="button"
                    onClick={onTips}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-primary-soft px-3 py-1 text-micro font-medium text-primary hover:bg-primary/15"
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('garden.zone.aiTips')}
                </button>
            </div>
        </div>
    );
};

export default ZoneCard;
