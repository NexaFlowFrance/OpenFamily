import React from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { getDateFnsLocale } from '../../lib/dateLocale';
import {
    Edit2,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Calendar as CalendarIcon,
    Repeat,
} from 'lucide-react';
import { Badge, Button } from '../ui';
import type { GardenCare } from '../../hooks/useGarden';

interface CareCardProps {
    care: GardenCare;
    onComplete: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

const formatDate = (d: string | null | undefined): string =>
    d ? format(parseISO(d), 'dd MMM yyyy', { locale: getDateFnsLocale() }) : '—';

const daysUntil = (d: string): number => {
    const target = new Date(`${d}T12:00:00`).getTime();
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Math.round((target - today.getTime()) / (24 * 60 * 60 * 1000));
};

const CareCard: React.FC<CareCardProps> = ({ care, onComplete, onEdit, onDelete }) => {
    const { t } = useTranslation();
    const isDone = !!care.performed_date;
    const isPlanned = !!care.planned_date && !isDone;
    const planDays = isPlanned ? daysUntil(care.planned_date!) : null;
    const overdue = planDays !== null && planDays < 0;

    return (
        <li className="rounded-card border border-border bg-card p-3">
            <div className="flex items-start gap-3">
                <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        isDone
                            ? 'bg-success-soft text-success'
                            : overdue
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-primary-soft text-primary'
                    }`}
                >
                    {isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                    ) : overdue ? (
                        <AlertCircle className="h-4 w-4" />
                    ) : (
                        <CalendarIcon className="h-4 w-4" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-caption font-semibold">{care.title}</p>
                        <Badge variant="secondary">
                            {t('garden.careTypes.' + care.care_type, {
                                defaultValue: care.care_type,
                            })}
                        </Badge>
                        {care.recurrence_days != null && (
                            <span className="inline-flex items-center gap-0.5 text-micro text-muted-foreground">
                                <Repeat className="h-3 w-3" />
                                {t('garden.care.recurrenceDays', { count: care.recurrence_days })}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 text-micro text-muted-foreground">
                        {(care.zone_name || care.plant_name) && (
                            <span className="font-medium text-foreground">
                                {care.plant_name ?? care.zone_name}
                            </span>
                        )}
                        {(care.zone_name || care.plant_name) && ' — '}
                        {isDone ? (
                            t('garden.care.performedOn', { date: formatDate(care.performed_date) })
                        ) : isPlanned ? (
                            <>
                                {t('garden.care.plannedOn', {
                                    date: formatDate(care.planned_date),
                                })}
                                {planDays !== null && (
                                    <span className={overdue ? 'text-destructive' : ''}>
                                        {' '}
                                        (
                                        {overdue
                                            ? t('garden.care.overdueBy', { days: -planDays })
                                            : t('garden.care.inDays', { days: planDays })}
                                        )
                                    </span>
                                )}
                            </>
                        ) : null}
                        {care.cost != null && <> · {care.cost.toFixed(2)} €</>}
                    </p>
                    {care.notes && (
                        <p className="mt-1 text-micro italic text-muted-foreground">{care.notes}</p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {!isDone && (
                        <Button size="sm" variant="secondary" onClick={onComplete}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            {t('garden.care.done')}
                        </Button>
                    )}
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
        </li>
    );
};

export default CareCard;
