import React from 'react';
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
// the same event repeats across, so it can render a "Lun→Ven" hint.
export interface GroupedPlanningEntry extends PlanningEventEntry {
    repeatDays: number[];
}

interface PlanningEventCardProps {
    entry: GroupedPlanningEntry;
    density: 'compact' | 'detailed';
    onEdit: (entry: PlanningEventEntry) => void;
    onDelete: (id: string) => void;
    // List/Member views display events outside a per-day column, so the day
    // label needs to be rendered inside the card itself.
    showDayLabel?: boolean;
}

const DAY_SHORT: Record<number, string> = {
    1: 'Lun',
    2: 'Mar',
    3: 'Mer',
    4: 'Jeu',
    5: 'Ven',
    6: 'Sam',
    7: 'Dim',
};

const TYPE_META: Record<
    PlanningEventEntry['schedule_type'],
    { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
    work: { label: 'Travail', icon: Briefcase, tint: 'text-primary' },
    school: { label: 'Ecole', icon: GraduationCap, tint: 'text-success' },
    study: { label: 'Etudes', icon: BookOpen, tint: 'text-warning' },
    activity: { label: 'Activite', icon: CalendarDays, tint: 'text-secondary-foreground' },
    other: { label: 'Autre', icon: CalendarDays, tint: 'text-muted-foreground' },
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
export const formatRepeatDays = (days: number[]): string => {
    if (days.length <= 1) return '';
    if (days.length === 7) return 'Tous les jours';
    const sorted = [...days].sort((a, b) => a - b);
    const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    if (consecutive && sorted.length >= 2) {
        return `${DAY_SHORT[sorted[0]]}→${DAY_SHORT[sorted[sorted.length - 1]]}`;
    }
    return sorted.map((d) => DAY_SHORT[d]).join(', ');
};

const PlanningEventCard: React.FC<PlanningEventCardProps> = ({
    entry,
    density,
    onEdit,
    onDelete,
    showDayLabel,
}) => {
    const type = TYPE_META[entry.schedule_type];
    const TypeIcon = type.icon;
    const overnight = entry.end_time < entry.start_time;
    const isRecurring = !entry.specific_date;
    const repeatHint = formatRepeatDays(entry.repeatDays);
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
                                title="Se termine le lendemain"
                            >
                                +1j
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
                    <TypeIcon className={`h-3 w-3 shrink-0 ${type.tint}`} aria-label={type.label} />
                    {isRecurring ? (
                        <Repeat
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                            aria-label="Récurrent"
                        />
                    ) : (
                        <Pin className="h-3 w-3 shrink-0 text-warning" aria-label="Ponctuel" />
                    )}
                    {repeatHint ? (
                        <span className="rounded-pill bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {repeatHint}
                        </span>
                    ) : null}
                    {showDayLabel ? (
                        <span className="rounded-pill bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {DAY_SHORT[entry.day_of_week]}
                        </span>
                    ) : null}
                    <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                            onClick={() => onEdit(entry)}
                            aria-label="Modifier"
                        >
                            <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => onDelete(entry.id)}
                            aria-label="Supprimer"
                        >
                            <Trash2 className="h-3 w-3" />
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
