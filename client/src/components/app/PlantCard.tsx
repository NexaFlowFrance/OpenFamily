import React from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { getDateFnsLocale } from '../../lib/dateLocale';
import { Edit2, Trash2, Leaf, Droplets } from 'lucide-react';
import { Badge } from '../ui';
import type { GardenHealthStatus, GardenPlant } from '../../hooks/useGarden';

interface PlantCardProps {
    plant: GardenPlant;
    onEdit: () => void;
    onDelete: () => void;
}

// Presentation tint keyed by the persisted (French) health status; label is
// resolved at render with t('garden.healthStatuses.*').
const HEALTH_VARIANT: Record<GardenHealthStatus, 'success' | 'warning' | 'danger' | 'secondary'> = {
    'En bonne santé': 'success',
    'À surveiller': 'warning',
    Malade: 'danger',
    Mort: 'secondary',
};

const PlantCard: React.FC<PlantCardProps> = ({ plant, onEdit, onDelete }) => {
    const { t } = useTranslation();

    return (
        <div className="group rounded-card border border-border bg-card p-4 shadow-surface transition-all hover:border-primary/40 hover:shadow-surface-hover">
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-success/10 text-success">
                        <Leaf className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-caption font-semibold">
                            {plant.name}
                            {plant.variety && (
                                <span className="ml-1 text-micro font-normal text-muted-foreground">
                                    · {plant.variety}
                                </span>
                            )}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="primary">
                                {t('garden.plantTypes.' + plant.plant_type, {
                                    defaultValue: plant.plant_type,
                                })}
                            </Badge>
                            <Badge variant={HEALTH_VARIANT[plant.health_status]}>
                                {t('garden.healthStatuses.' + plant.health_status, {
                                    defaultValue: plant.health_status,
                                })}
                            </Badge>
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
                {plant.zone_name && (
                    <span className="font-medium text-foreground">{plant.zone_name}</span>
                )}
                {plant.planted_date && (
                    <span>
                        {t('garden.plant.plantedOn', {
                            date: format(parseISO(plant.planted_date), 'dd MMM yyyy', {
                                locale: getDateFnsLocale(),
                            }),
                        })}
                    </span>
                )}
                {plant.watering_frequency_days != null && (
                    <span className="inline-flex items-center gap-0.5">
                        <Droplets className="h-3 w-3" />
                        {t('garden.plant.wateringEvery', {
                            count: plant.watering_frequency_days,
                        })}
                    </span>
                )}
            </div>

            {plant.notes && (
                <p className="mt-2 border-l-2 border-border pl-2 text-micro italic text-muted-foreground line-clamp-2">
                    {plant.notes}
                </p>
            )}
        </div>
    );
};

export default PlantCard;
