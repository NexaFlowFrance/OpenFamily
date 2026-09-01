import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Briefcase,
    BookOpen,
    CalendarClock,
    CalendarDays,
    CalendarOff,
    ChevronLeft,
    ChevronRight,
    Edit2,
    GraduationCap,
    Pin,
    Plus,
    Repeat,
    RotateCcw,
    Trash2,
    Users,
} from 'lucide-react';
import { addDays, addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../i18n/format';
import { api } from '../lib/api';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, Input, Select, Textarea } from '../components/ui';

interface FamilyMember {
    id: string;
    name: string;
    role: string;
    color: string;
}

interface Participant {
    id: string;
    name: string;
    color: string;
    role: string;
}

interface PlanningEntry {
    id: string;
    /** First participant. Kept for older payloads and for the member filter. */
    family_member_id: string;
    family_member_name: string;
    family_member_color: string;
    family_member_role: string;
    /** Everyone taking part, primary first. */
    participants?: Participant[];
    participant_ids?: string[];
    /** Dates, 'YYYY-MM-DD', on which this weekly entry does not happen. */
    excluded_dates?: string[];
    schedule_type: 'work' | 'school' | 'study' | 'activity' | 'other';
    title: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    specific_date?: string | null;
    location?: string;
    notes?: string;
}

/** An appointment shown alongside the planning, read-only. */
interface WeekAppointment {
    id: string;
    occurrence_id?: string;
    title: string;
    start_time: string;
    end_time?: string | null;
    location?: string | null;
    family_member_ids?: string[];
}

interface PlanningBulkResult {
    entries: PlanningEntry[];
    created: number;
    updated: number;
    conflicts: Array<{ day_of_week: number; conflict_ids: string[] }>;
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const FULL_WEEK = [1, 2, 3, 4, 5, 6, 7];

const sortDays = (values: number[]) => [...values].sort((a, b) => a - b);

const formatTime = (raw: string) => raw.slice(0, 5);

const defaultTypeFromRole = (role?: string) => {
    const normalized = (role || '').toLowerCase();
    if (normalized === 'parent' || normalized === 'adulte') {
        return 'work';
    }
    if (normalized === 'enfant' || normalized === 'etudiant') {
        return 'school';
    }
    return 'other';
};

const Planning: React.FC = () => {
    const { t } = useTranslation(['planning', 'common']);
    const navigate = useNavigate();
    const daysLong = t('common:days', { returnObjects: true }) as string[];
    const daysShort = t('common:daysShort', { returnObjects: true }) as string[];
    const DAYS = [1, 2, 3, 4, 5, 6, 7].map((value) => ({
        value,
        label: daysLong[value - 1],
        short: daysShort[value - 1],
    }));
    const TYPE_OPTIONS = [
        { value: 'work', label: t('planning:types.work') },
        { value: 'school', label: t('planning:types.school') },
        { value: 'study', label: t('planning:types.study') },
        { value: 'activity', label: t('planning:types.activity') },
        { value: 'other', label: t('planning:types.other') },
    ];
    const getDayLabel = (day: number) => daysLong[day - 1] || t('planning:dayFallback', { n: day });
    const [entries, setEntries] = useState<PlanningEntry[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [weekAnchor, setWeekAnchor] = useState(new Date());
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedDays, setSelectedDays] = useState<number[]>([1]);
    const [replaceConflicts, setReplaceConflicts] = useState(false);
    const [thisWeekOnly, setThisWeekOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<PlanningEntry | null>(null);

    const [appointments, setAppointments] = useState<WeekAppointment[]>([]);

    const [formData, setFormData] = useState({
        // Primary first: the server mirrors position 0 into family_member_id.
        family_member_ids: [] as string[],
        schedule_type: 'work',
        title: '',
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
        location: '',
        notes: '',
    });

    const weekStart = useMemo(() => startOfWeek(weekAnchor, { weekStartsOn: 1 }), [weekAnchor]);

    useEffect(() => {
        const bootstrap = async () => {
            try {
                await Promise.all([loadMembers(), loadEntries(weekStart), loadAppointments(weekStart)]);
            } finally {
                setLoading(false);
            }
        };
        void bootstrap();
    }, []);
    useWebSocketUpdates('planning', () => { void loadEntries(weekStart); });
    // An appointment added from the calendar has to appear here too.
    useWebSocketUpdates('appointments', () => { void loadAppointments(weekStart); });

    useEffect(() => {
        if (selectedDays.length === 0) {
            return;
        }

        setFormData((prev) => ({
            ...prev,
            day_of_week: selectedDays[0],
        }));
    }, [selectedDays]);

    useEffect(() => {
        if (familyMembers.length === 0 || editingEntry || formData.family_member_ids.length > 0) {
            return;
        }
        const first = familyMembers[0];
        setFormData((prev) => ({
            ...prev,
            family_member_ids: [first.id],
            schedule_type: defaultTypeFromRole(first.role),
        }));
    }, [familyMembers, editingEntry, formData.family_member_ids]);

    useEffect(() => {
        loadEntries(weekStart);
        void loadAppointments(weekStart);
    }, [weekStart]);

    const loadMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>('/api/family');
            if (response.success) {
                setFamilyMembers(response.data);
            }
        } catch (err) {
            console.error('Failed to load members:', err);
            setError(err instanceof Error ? err.message : t('planning:errors.loadMembers'));
        }
    };

    const loadEntries = async (ws?: Date) => {
        try {
            const weekStartParam = ws ? format(ws, 'yyyy-MM-dd') : format(weekStart, 'yyyy-MM-dd');
            const response = await api.get<{ success: boolean; data: PlanningEntry[] }>(`/api/planning?week_start=${weekStartParam}`);
            if (response.success) {
                setEntries(response.data);
            }
        } catch (err) {
            console.error('Failed to load planning entries:', err);
            setError(err instanceof Error ? err.message : t('planning:errors.loadEntries'));
        }
    };

    /**
     * Appointments falling in the displayed week. They are shown next to the
     * planning because a week you have to read in two places is not a week you
     * can plan against. They stay read-only here; the calendar owns them.
     */
    const loadAppointments = async (ws: Date) => {
        try {
            // Full timestamps, not bare dates: the server only expands a recurring
            // appointment when it can parse both bounds as date AND time. Given a
            // bare date it returns the series unexpanded, which would show a
            // January event in every week from then on, at its January date.
            const start = format(ws, "yyyy-MM-dd'T'00:00:00");
            const end = format(addDays(ws, 6), "yyyy-MM-dd'T'23:59:59");
            const response = await api.get<{ success: boolean; data: WeekAppointment[] }>(
                `/api/appointments?start_date=${start}&end_date=${end}`
            );
            if (response.success) {
                setAppointments(response.data);
            }
        } catch (err) {
            // The planning itself still works without them, so this must not
            // take the page down with it.
            console.error('Failed to load appointments:', err);
        }
    };

    /** Skips or restores one date of a weekly entry, leaving the series intact. */
    const toggleOccurrence = async (entry: PlanningEntry, date: string, skipped: boolean) => {
        setError('');
        setNotice('');
        try {
            if (skipped) {
                await api.delete(`/api/planning/${entry.id}/exceptions/${date}`);
            } else {
                await api.post(`/api/planning/${entry.id}/exceptions`, { date });
            }
            await loadEntries(weekStart);
            setNotice(skipped ? t('planning:notice.restored') : t('planning:notice.skipped'));
        } catch (err) {
            console.error('Failed to change occurrence:', err);
            // The app updates from the store, the server it points at does not.
            // A 404 here means the endpoint does not exist yet rather than a
            // missing entry, and "entry not found" would send the owner looking
            // in the wrong place.
            const message = err instanceof Error ? err.message : '';
            setError(message.includes('404')
                ? t('planning:errors.skipUnsupported')
                : (message || t('planning:errors.skipOccurrence')));
        }
    };

    const resetForm = (dayOfWeek = 1) => {
        setEditingEntry(null);
        setSelectedDays([dayOfWeek]);
        setReplaceConflicts(false);
        setThisWeekOnly(false);
        const first = familyMembers[0];
        setFormData({
            family_member_ids: first ? [first.id] : [],
            schedule_type: defaultTypeFromRole(first?.role),
            title: '',
            day_of_week: dayOfWeek,
            start_time: '09:00',
            end_time: '17:00',
            location: '',
            notes: '',
        });
    };

    const handleAddForDay = (dayOfWeek: number) => {
        setError('');
        setNotice('');
        resetForm(dayOfWeek);
        setDialogOpen(true);
    };

    const handleEdit = (entry: PlanningEntry) => {
        setError('');
        setNotice('');
        setReplaceConflicts(false);
        setThisWeekOnly(Boolean(entry.specific_date));
        setEditingEntry(entry);
        setSelectedDays([entry.day_of_week]);
        setFormData({
            // Entries written before participants existed only carry the primary.
            family_member_ids: entry.participant_ids?.length
                ? entry.participant_ids
                : [entry.family_member_id],
            schedule_type: entry.schedule_type,
            title: entry.title,
            day_of_week: entry.day_of_week,
            start_time: formatTime(entry.start_time),
            end_time: formatTime(entry.end_time),
            location: entry.location || '',
            notes: entry.notes || '',
        });
        setDialogOpen(true);
    };

    const handleDelete = async (entryId: string) => {
        if (!confirm(t('planning:confirmDelete'))) {
            return;
        }
        setError('');
        setNotice('');
        try {
            await api.delete(`/api/planning/${entryId}`);
            await loadEntries(weekStart);
        } catch (err) {
            console.error('Failed to delete planning entry:', err);
            setError(err instanceof Error ? err.message : t('planning:errors.deleteEntry'));
        }
    };

    /**
     * Adds or removes a participant. The list is never emptied: an activity with
     * nobody in it cannot be saved, and silently refusing the last removal is
     * clearer than letting the form reach a state the server will reject.
     */
    const toggleParticipant = (memberId: string) => {
        setFormData((prev) => {
            if (prev.family_member_ids.includes(memberId)) {
                if (prev.family_member_ids.length === 1) {
                    return prev;
                }
                return {
                    ...prev,
                    family_member_ids: prev.family_member_ids.filter((id) => id !== memberId),
                };
            }

            const next = [...prev.family_member_ids, memberId];
            const member = familyMembers.find((item) => item.id === memberId);
            return {
                ...prev,
                family_member_ids: next,
                // The first participant still sets the default type, as picking a
                // single member used to.
                schedule_type: next.length === 1 && member
                    ? defaultTypeFromRole(member.role)
                    : prev.schedule_type,
            };
        });
    };

    const toggleDaySelection = (day: number) => {
        setSelectedDays((prev) => {
            if (prev.includes(day)) {
                if (prev.length === 1) {
                    return prev;
                }
                return prev.filter((value) => value !== day);
            }
            return sortDays([...prev, day]);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setNotice('');

        if (formData.family_member_ids.length === 0 || !formData.title.trim()) {
            setError(t('planning:errors.memberTitleRequired'));
            return;
        }

        if (!formData.start_time || !formData.end_time || formData.end_time === formData.start_time) {
            setError(t('planning:errors.timesSame'));
            return;
        }

        if (selectedDays.length === 0) {
            setError(t('planning:errors.selectDay'));
            return;
        }

        const basePayload = {
            family_member_ids: formData.family_member_ids,
            // Also sent on its own because the Android app updates from the store
            // while the server it points at updates on its owner's schedule. A
            // server that predates participants reads only this field and records
            // the primary one; a current server prefers the list above.
            family_member_id: formData.family_member_ids[0],
            schedule_type: formData.schedule_type,
            title: formData.title.trim(),
            start_time: formData.start_time,
            end_time: formData.end_time,
            location: formData.location || null,
            notes: formData.notes || null,
        };

        try {
            if (selectedDays.length === 1) {
                const specificDate = thisWeekOnly
                    ? format(addDays(weekStart, selectedDays[0] - 1), 'yyyy-MM-dd')
                    : null;
                const payload = {
                    ...basePayload,
                    day_of_week: selectedDays[0],
                    specific_date: specificDate,
                };

                if (editingEntry) {
                    await api.put(`/api/planning/${editingEntry.id}`, payload);
                } else {
                    await api.post('/api/planning', payload);
                }

                setDialogOpen(false);
                resetForm(selectedDays[0]);
                await loadEntries(weekStart);
                setNotice(t('planning:notice.saved'));
                return;
            }

            const response = await api.post<{ success: boolean; data: PlanningBulkResult }>(
                '/api/planning/bulk',
                {
                    ...basePayload,
                    day_of_week_list: sortDays(selectedDays),
                    replace_conflicts: replaceConflicts,
                    source_entry_id: editingEntry?.id || null,
                    week_start: thisWeekOnly ? format(weekStart, 'yyyy-MM-dd') : null,
                }
            );

            setDialogOpen(false);
            resetForm(selectedDays[0]);
            await loadEntries(weekStart);

            if (response.success) {
                const applied = response.data.created + response.data.updated;
                if (response.data.conflicts.length > 0) {
                    const conflictDays = response.data.conflicts
                        .map((item) => getDayLabel(item.day_of_week))
                        .join(', ');
                    setNotice(t('planning:notice.savedDaysConflicts', { count: applied, days: conflictDays }));
                } else {
                    setNotice(t('planning:notice.savedDays', { count: applied }));
                }
            }
        } catch (err) {
            console.error('Failed to save planning entry:', err);
            setError(err instanceof Error ? err.message : t('planning:errors.save'));
        }
    };

    const participantIdsOf = (entry: PlanningEntry) =>
        entry.participant_ids?.length ? entry.participant_ids : [entry.family_member_id];

    const visibleEntries = useMemo(() => {
        return entries
            // Filtering on a member shows the shared activities they take part
            // in, not only the ones created under their name.
            .filter((entry) => (selectedMemberId ? participantIdsOf(entry).includes(selectedMemberId) : true))
            .filter((entry) => (selectedType !== 'all' ? entry.schedule_type === selectedType : true))
            .sort((a, b) => {
                if (a.day_of_week !== b.day_of_week) {
                    return a.day_of_week - b.day_of_week;
                }
                return a.start_time.localeCompare(b.start_time);
            });
    }, [entries, selectedMemberId, selectedType]);

    /** Appointments of the week, grouped by weekday (1 = Monday). */
    const appointmentsByDay = useMemo(() => {
        const groups = new Map<number, WeekAppointment[]>();

        for (const appointment of appointments) {
            const start = new Date(appointment.start_time);
            if (Number.isNaN(start.getTime())) continue;

            // An appointment with nobody assigned concerns the whole family, so
            // it stays visible whichever member is being filtered on. Only the
            // ones explicitly assigned to other people are hidden.
            const assigned = appointment.family_member_ids || [];
            if (selectedMemberId && assigned.length > 0 && !assigned.includes(selectedMemberId)) {
                continue;
            }

            // getDay is 0 on Sunday; the planning counts Monday as 1.
            const day = start.getDay() || 7;
            groups.set(day, [...(groups.get(day) || []), appointment]);
        }

        for (const list of groups.values()) {
            list.sort((a, b) => a.start_time.localeCompare(b.start_time));
        }

        return groups;
    }, [appointments, selectedMemberId]);

    const entryTypeBadge = (type: PlanningEntry['schedule_type']) => {
        if (type === 'work') {
            return { label: t('planning:types.work'), variant: 'primary' as const, icon: Briefcase };
        }
        if (type === 'school') {
            return { label: t('planning:types.school'), variant: 'success' as const, icon: GraduationCap };
        }
        if (type === 'study') {
            return { label: t('planning:types.study'), variant: 'warning' as const, icon: BookOpen };
        }
        if (type === 'activity') {
            return { label: t('planning:types.activity'), variant: 'secondary' as const, icon: CalendarDays };
        }
        return { label: t('planning:types.other'), variant: 'default' as const, icon: CalendarDays };
    };

    if (loading) {
        return (
            <div className="flex h-full min-h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="animate-pulse font-medium text-muted-foreground">{t('planning:loading')}</p>
                </div>
            </div>
        );
    }

    if (familyMembers.length === 0) {
        return (
            <Card>
                <CardContent className="p-10 text-center">
                    <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
                    <h2 className="text-h2">{t('planning:noMembers.title')}</h2>
                    <p className="mt-1 text-caption text-muted-foreground">
                        {t('planning:noMembers.subtitle')}
                    </p>
                    <Button className="mt-5" onClick={() => navigate('/family')}>
                        {t('planning:noMembers.cta')}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {error}
                </div>
            ) : null}
            {notice ? (
                <div className="rounded-input border border-primary/30 bg-primary-soft px-4 py-3 text-caption text-primary">
                    {notice}
                </div>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-h1">{t('planning:title')}</h1>
                    <p className="text-caption text-muted-foreground">
                        {t('planning:subtitle')}
                    </p>
                </div>
                <Button
                    onClick={() => {
                        setError('');
                        setNotice('');
                        resetForm(1);
                        setDialogOpen(true);
                    }}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('planning:newEntry')}
                </Button>
            </div>

            <Card>
                <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(subWeeks(weekAnchor, 1))}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(new Date())}>
                            {t('planning:thisWeek')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(addWeeks(weekAnchor, 1))}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <span className="ml-2 text-caption text-muted-foreground">
                            {format(weekStart, 'dd MMM', { locale: dateLocale() })} - {format(addDays(weekStart, 6), 'dd MMM yyyy', { locale: dateLocale() })}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Select
                            value={selectedMemberId}
                            onValueChange={setSelectedMemberId}
                            options={[
                                { value: '', label: t('planning:allMembers') },
                                ...familyMembers.map((member) => ({
                                    value: member.id,
                                    label: member.name,
                                })),
                            ]}
                        />
                        <Select
                            value={selectedType}
                            onValueChange={setSelectedType}
                            options={[
                                { value: 'all', label: t('planning:allTypes') },
                                ...TYPE_OPTIONS,
                            ]}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
                {DAYS.map((day, index) => {
                    const dateForHeader = addDays(weekStart, index);
                    const dayEntries = visibleEntries.filter((entry) => entry.day_of_week === day.value);
                    // The concrete date this column stands for, used to tell a
                    // skipped occurrence from the series it belongs to.
                    const dayIso = format(dateForHeader, 'yyyy-MM-dd');
                    const dayAppointments = appointmentsByDay.get(day.value) || [];
                    return (
                        <Card key={day.value} hover={false} className="min-h-[280px]">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <CardTitle className="text-caption">{day.label}</CardTitle>
                                        <p className="text-micro text-muted-foreground">
                                            {format(dateForHeader, 'dd/MM', { locale: dateLocale() })}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleAddForDay(day.value)}
                                        className="h-8 px-2"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-2 pt-0">
                                {dayEntries.length === 0 && dayAppointments.length === 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => handleAddForDay(day.value)}
                                        className="w-full rounded-input border border-dashed border-border px-3 py-5 text-center text-micro text-muted-foreground hover:bg-surface-2"
                                    >
                                        {t('planning:add')}
                                    </button>
                                ) : (
                                    dayEntries.map((entry) => {
                                        const typeMeta = entryTypeBadge(entry.schedule_type);
                                        const TypeIcon = typeMeta.icon;
                                        // A weekly entry can be called off for this date alone. A one-off
                                        // has nothing to subtract from, so it is deleted instead.
                                        const isSeries = !entry.specific_date;
                                        const skipped = (entry.excluded_dates || []).includes(dayIso);
                                        const people = entry.participants?.length
                                            ? entry.participants
                                            : [{
                                                id: entry.family_member_id,
                                                name: entry.family_member_name,
                                                color: entry.family_member_color,
                                                role: entry.family_member_role,
                                            }];
                                        return (
                                            <div
                                                key={entry.id}
                                                className={`overflow-hidden rounded-input border border-border bg-card shadow-surface ${skipped ? 'opacity-45' : ''}`}
                                                style={{ borderLeftColor: entry.family_member_color, borderLeftWidth: 3 }}
                                            >
                                                <div className="p-1.5">
                                                    {/* Time + actions row */}
                                                    <div className="flex items-center justify-between gap-1">
                                                        <p className={`text-[10px] font-semibold leading-tight text-foreground ${skipped ? 'line-through' : ''}`}>
                                                            {formatTime(entry.start_time)}
                                                            <span className="text-muted-foreground">–</span>
                                                            {formatTime(entry.end_time)}
                                                            {entry.end_time < entry.start_time && (
                                                                <span className="ml-0.5 text-[9px] text-muted-foreground">{t('planning:nextDayShort')}</span>
                                                            )}
                                                        </p>
                                                        <div className="flex flex-shrink-0 items-center">
                                                            {entry.specific_date
                                                                ? <Pin className="mr-0.5 h-2.5 w-2.5 text-amber-500" />
                                                                : <Repeat className="mr-0.5 h-2.5 w-2.5 text-muted-foreground/50" />
                                                            }
                                                            {isSeries && (
                                                                <button
                                                                    type="button"
                                                                    title={skipped ? t('planning:occurrence.restore') : t('planning:occurrence.skip')}
                                                                    aria-label={skipped ? t('planning:occurrence.restore') : t('planning:occurrence.skip')}
                                                                    className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                                                                    onClick={() => toggleOccurrence(entry, dayIso, skipped)}
                                                                >
                                                                    {skipped
                                                                        ? <RotateCcw className="h-3 w-3" />
                                                                        : <CalendarOff className="h-3 w-3" />}
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                                                                onClick={() => handleEdit(entry)}
                                                            >
                                                                <Edit2 className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                                onClick={() => handleDelete(entry.id)}
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {/* Title */}
                                                    <p className={`mt-0.5 truncate text-[11px] font-medium leading-tight text-foreground ${skipped ? 'line-through' : ''}`}>
                                                        {entry.title}
                                                    </p>
                                                    {/* Type + participants row */}
                                                    <div className="mt-1 flex items-center gap-1">
                                                        <TypeIcon className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground" />
                                                        <span className="flex flex-shrink-0 items-center -space-x-0.5">
                                                            {people.map((person) => (
                                                                <span
                                                                    key={person.id}
                                                                    title={person.name}
                                                                    className="h-1.5 w-1.5 rounded-full ring-1 ring-card"
                                                                    style={{ backgroundColor: person.color }}
                                                                />
                                                            ))}
                                                        </span>
                                                        <span className="truncate text-[10px] text-muted-foreground">
                                                            {people.length === 1
                                                                ? people[0].name
                                                                : `${people[0].name} +${people.length - 1}`}
                                                        </span>
                                                    </div>
                                                    {entry.location ? (
                                                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{entry.location}</p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}

                                {/* Appointments of that day, read-only. Editing them
                                    belongs to the calendar, which owns reminders and
                                    guests; tapping one goes there. */}
                                {dayAppointments.map((appointment) => (
                                    <button
                                        key={appointment.occurrence_id || appointment.id}
                                        type="button"
                                        onClick={() => navigate('/calendar')}
                                        title={t('planning:appointments.openCalendar')}
                                        className="w-full overflow-hidden rounded-input border border-dashed border-border bg-surface-2/40 p-1.5 text-left hover:border-primary"
                                    >
                                        <div className="flex items-center gap-1">
                                            <CalendarClock className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground" />
                                            <p className="text-[10px] font-semibold leading-tight text-foreground">
                                                {format(new Date(appointment.start_time), 'HH:mm')}
                                            </p>
                                            <span className="ml-auto text-[9px] uppercase tracking-wide text-muted-foreground">
                                                {t('planning:appointments.badge')}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 truncate text-[11px] font-medium leading-tight text-foreground">
                                            {appointment.title}
                                        </p>
                                        {appointment.location ? (
                                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{appointment.location}</p>
                                        ) : null}
                                    </button>
                                ))}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) {
                        resetForm(selectedDays[0] || 1);
                    }
                }}
                title={editingEntry ? t('planning:dialog.editTitle') : t('planning:dialog.createTitle')}
                description={t('planning:dialog.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className="mb-1.5 block text-label font-medium text-foreground">{t('planning:form.participants')}</label>
                            <div className="flex flex-wrap gap-1.5">
                                {familyMembers.map((member) => {
                                    const selected = formData.family_member_ids.includes(member.id);
                                    return (
                                        <button
                                            key={member.id}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => toggleParticipant(member.id)}
                                            className={`flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-caption transition-colors ${
                                                selected
                                                    ? 'border-primary bg-primary-soft text-primary'
                                                    : 'border-border bg-card text-muted-foreground hover:border-border-strong'
                                            }`}
                                        >
                                            <span
                                                className="h-2 w-2 flex-shrink-0 rounded-full"
                                                style={{ backgroundColor: member.color }}
                                            />
                                            {member.name}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-1.5 text-micro text-muted-foreground">
                                {t('planning:form.participantsHint')}
                            </p>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-label font-medium text-foreground">{t('planning:form.type')}</label>
                            <Select
                                value={formData.schedule_type}
                                onValueChange={(value) => setFormData((prev) => ({ ...prev, schedule_type: value }))}
                                options={TYPE_OPTIONS}
                            />
                        </div>
                    </div>

                    <Input
                        label={t('planning:form.title')}
                        value={formData.title}
                        onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder={t('planning:form.titlePlaceholder')}
                        required
                    />

                    <div>
                        <label className="mb-1.5 block text-label font-medium text-foreground">{t('planning:form.days')}</label>
                        <div className="flex flex-wrap gap-2">
                            {DAYS.map((day) => {
                                const active = selectedDays.includes(day.value);
                                return (
                                    <button
                                        key={day.value}
                                        type="button"
                                        onClick={() => toggleDaySelection(day.value)}
                                        className={`rounded-pill border px-3 py-1.5 text-caption transition-colors ${
                                            active
                                                ? 'border-primary/40 bg-primary-soft text-primary'
                                                : 'border-border bg-card text-muted-foreground hover:bg-surface-2'
                                        }`}
                                    >
                                        {day.short}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDays(WEEKDAYS)}
                            >
                                {t('planning:form.weekdays')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDays(FULL_WEEK)}
                            >
                                {t('planning:form.fullWeek')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDays([1])}
                            >
                                {t('common:actions.reset')}
                            </Button>
                        </div>
                        <p className="mt-2 text-micro text-muted-foreground">
                            {selectedDays.length === 1
                                ? t('planning:form.selectedDay', { day: getDayLabel(selectedDays[0]) })
                                : t('planning:form.selectedDays', { count: selectedDays.length })}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                            label={t('planning:form.start')}
                            type="time"
                            value={formData.start_time}
                            onChange={(e) => setFormData((prev) => ({ ...prev, start_time: e.target.value }))}
                            required
                        />
                        <div>
                            <Input
                                label={t('planning:form.end')}
                                type="time"
                                value={formData.end_time}
                                onChange={(e) => setFormData((prev) => ({ ...prev, end_time: e.target.value }))}
                                required
                            />
                            {formData.end_time && formData.start_time && formData.end_time < formData.start_time && (
                                <p className="mt-1 text-micro text-muted-foreground">
                                    {t('planning:form.nextDayHint')}
                                </p>
                            )}
                        </div>
                    </div>

                    <label className="flex items-start gap-2 rounded-input border border-border bg-surface-2/50 px-3 py-2 text-caption text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={thisWeekOnly}
                            onChange={(e) => setThisWeekOnly(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-border"
                        />
                        <span>
                            <strong>{t('planning:form.thisWeekOnlyStrong')}</strong>{t('planning:form.thisWeekOnlyRest', { date: format(weekStart, 'dd MMM yyyy', { locale: dateLocale() }) })}
                        </span>
                    </label>

                    {selectedDays.length > 1 ? (
                        <label className="flex items-start gap-2 rounded-input border border-border bg-surface-2/50 px-3 py-2 text-caption text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={replaceConflicts}
                                onChange={(e) => setReplaceConflicts(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-border"
                            />
                            <span>
                                {t('planning:form.replaceConflicts')}
                            </span>
                        </label>
                    ) : null}

                    <Input
                        label={t('planning:form.location')}
                        value={formData.location}
                        onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                        placeholder={t('planning:form.locationPlaceholder')}
                    />

                    <Textarea
                        label={t('planning:form.notes')}
                        value={formData.notes}
                        onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder={t('planning:form.notesPlaceholder')}
                        rows={2}
                    />

                    <div className="flex justify-end gap-3 pt-3">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit">
                            {selectedDays.length > 1
                                ? t('planning:submit.applyToDays')
                                : editingEntry
                                    ? t('common:actions.save')
                                    : t('common:actions.add')}
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Planning;
