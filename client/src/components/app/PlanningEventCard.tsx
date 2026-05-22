import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    Briefcase,
    BookOpen,
    CalendarDays,
    Edit2,
    GraduationCap,
    MapPin,
    Pin,
    Repeat,
    Trash2,
} from 'lucide-react';

// Mirror of Planning.tsx's PlanningEntry. Duplicated here to keep this card
// importable from any view without circular page imports.
export interface PlanningEventEntry {
    id: string;
    family_member_id: string;
    family_member_name: string;
    family_member_color: string;
    schedule_type: 'work' | 'school' | 'study' | 'activity' | 'other';
    title: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    specific_date?: string | null;
    location?: string;
}

// When recurring collapse is on, the anchor card carries the full set of days
// AND the full set of underlying entry IDs the same event repeats across, so
// it can render a "Lun→Ven" hint and bulk-delete the whole group from one click.
export interface GroupedPlanningEntry extends PlanningEventEntry {
    repeatDays: number[];
    groupIds: string[];
}

interface PlanningEventCardProps {
    entry: GroupedPlanningEntry;
    density: 'compact' | 'detailed';
    onEdit: (entry: PlanningEventEntry) => void;
    // Receives all ids in the recurring group (just one id when not grouped),
    // so the parent can confirm + bulk-delete in a single mutation flow.
    onDelete: (ids: string[]) => void;
    // List/Member views display events outside a per-day column, so the day
    // label needs to be rendered inside the card itself.
    showDayLabel?: boolean;
}

// Icon + tint are presentation metadata keyed by the persisted schedule_type
// value. The display label is resolved at render time via t('planning.types.*').
const TYPE_META: Record<
    PlanningEventEntry['schedule_type'],
    { icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
    work: { icon: Briefcase, tint: 'text-primary' },
    school: { icon: GraduationCap, tint: 'text-success' },
    study: { icon: BookOpen, tint: 'text-warning' },
    activity: { icon: CalendarDays, tint: 'text-secondary-foreground' },
    other: { icon: CalendarDays, tint: 'text-muted-foreground' },
};

const formatTime = (raw: string) => raw.slice(0, 5);

// Two-letter initials derived from a full name — used as a compact member
// indicator so we never wrap "Adja Astou" onto two lines.
const initials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// "Lun→Ven" for consecutive runs, "Lun, Mer, Ven" otherwise, "Tous les jours"
// for the full week. Empty string when the event is a single day.
// `t` resolves the localized short day names (planning.days_short.*).
export const formatRepeatDays = (days: number[], t: TFunction): string => {
    if (days.length <= 1) return '';
    if (days.length === 7) return t('planning.all_days');
    const sorted = [...days].sort((a, b) => a - b);
    const short = (d: number) => t('planning.days_short.' + d);
    const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    if (consecutive && sorted.length >= 2) {
        return `${short(sorted[0])}→${short(sorted[sorted.length - 1])}`;
    }
    return sorted.map((d) => short(d)).join(', ');
};

const PlanningEventCard: React.FC<PlanningEventCardProps> = ({
    entry,
    density,
    onEdit,
    onDelete,
    showDayLabel,
}) => {
    const { t } = useTranslation();
    const type = TYPE_META[entry.schedule_type];
    const typeLabel = t('planning.types.' + entry.schedule_type, {
        defaultValue: entry.schedule_type,
    });
    const TypeIcon = type.icon;
    const overnight = entry.end_time < entry.start_time;
    const isRecurring = !entry.specific_date;
    const repeatHint = formatRepeatDays(entry.repeatDays, t);
    // Hide the location row when it's identical to the title — common case in
    // current data where users put the same string in both fields.
    const showLocation =
        entry.location && entry.location.trim().toLowerCase() !== entry.title.trim().toLowerCase();

    return (
        <div
            className="group relative overflow-hidden rounded-input border border-border bg-card pl-2 shadow-surface transition-all hover:border-border-strong hover:shadow-surface-hover"
            style={{ boxShadow: `inset 3px 0 0 ${entry.family_member_color}` }}
        >
            <div className="px-2 py-1.5">
                {/* Top row: time + member initials + (revealed on hover) actions */}
                <div className="flex items-center gap-2">
                    <span className="text-micro font-semibold tabular-nums text-foreground">
                        {formatTime(entry.start_time)}–{formatTime(entry.end_time)}
                        {overnight ? (
                            <span
                                className="ml-0.5 text-[10px] text-muted-foreground"
                                title={t('planning.card.overnight_title')}
                            >
                                {t('planning.card.overnight_label')}
                            </span>
                        ) : null}
                    </span>
                    <span
                        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: entry.family_member_color }}
                        title={entry.family_member_name}
                    >
                        {initials(entry.family_member_name)}
                    </span>
                    <TypeIcon className={`h-3 w-3 shrink-0 ${type.tint}`} aria-label={typeLabel} />
                    {isRecurring ? (
                        <Repeat
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                            aria-label={t('planning.card.recurring')}
                        />
                    ) : (
                        <Pin
                            className="h-3 w-3 shrink-0 text-warning"
                            aria-label={t('planning.card.one_off')}
                        />
                    )}
                    {repeatHint ? (
                        <span className="rounded-pill bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {repeatHint}
                        </span>
                    ) : null}
                    {showDayLabel ? (
                        <span className="rounded-pill bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {t('planning.days_short.' + entry.day_of_week)}
                        </span>
                    ) : null}
                    <span className="ml-auto flex items-center gap-0.5">
                        <button
                            type="button"
                            className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-surface-2 hover:text-foreground"
                            onClick={() => onEdit(entry)}
                            aria-label={t('planning.card.edit')}
                            title={t('planning.card.edit')}
                        >
                            <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => onDelete(entry.groupIds)}
                            aria-label={t('planning.card.delete')}
                            title={t('planning.card.delete')}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </span>
                </div>

                <p
                    className={`mt-1 text-caption font-medium leading-tight text-foreground ${
                        density === 'compact' ? 'line-clamp-1' : 'line-clamp-2'
                    }`}
                    title={entry.title}
                >
                    {entry.title}
                </p>

                {density === 'detailed' && showLocation ? (
                    <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {entry.location}
                    </p>
                ) : null}
            </div>
        </div>
    );
};

export default PlanningEventCard;
