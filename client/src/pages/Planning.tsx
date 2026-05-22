import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
    List,
    Plus,
    Users,
} from 'lucide-react';
import { addDays, addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
import { useDateLocale } from '../lib/dateLocale';
import { api } from '../lib/api';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Dialog,
    Input,
    Select,
    Textarea,
} from '../components/ui';
import PlanningEventCard, { type GroupedPlanningEntry } from '../components/app/PlanningEventCard';

interface FamilyMember {
    id: string;
    name: string;
    role: string;
    color: string;
}

interface PlanningEntry {
    id: string;
    family_member_id: string;
    family_member_name: string;
    family_member_color: string;
    family_member_role?: string;
    schedule_type: 'work' | 'school' | 'study' | 'activity' | 'other';
    title: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    specific_date?: string | null;
    location?: string;
    notes?: string;
}

interface PlanningBulkResult {
    entries: PlanningEntry[];
    created: number;
    updated: number;
    conflicts: Array<{ day_of_week: number; conflict_ids: string[] }>;
}

// Day numbers (1=Mon … 7=Sun) and schedule_type values are persisted data.
// Display labels are resolved at render via t('planning.days.*') etc.
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7];
const TYPE_VALUES = ['work', 'school', 'study', 'activity', 'other'] as const;

const WEEKDAYS = [1, 2, 3, 4, 5];
const FULL_WEEK = [1, 2, 3, 4, 5, 6, 7];

const sortDays = (values: number[]) => [...values].sort((a, b) => a - b);

const formatTime = (raw: string) => raw.slice(0, 5);

const getDayLabel = (day: number, t: TFunction) =>
    t('planning.days.' + day, { defaultValue: t('planning.day_fallback', { day }) });

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
    const { t } = useTranslation();
    const locale = useDateLocale();
    const navigate = useNavigate();

    // Localized option lists derived from the persisted value sets.
    const DAYS = DAY_VALUES.map((value) => ({
        value,
        label: t('planning.days.' + value),
        short: t('planning.days_short.' + value),
    }));
    const TYPE_OPTIONS = TYPE_VALUES.map((value) => ({
        value,
        label: t('planning.types.' + value),
    }));

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

    // View controls. Persisted only for the session (no localStorage yet); the
    // defaults match the legacy layout so returning users see a familiar view.
    const [viewMode, setViewMode] = useState<'week' | 'list' | 'member'>('week');
    const [density, setDensity] = useState<'compact' | 'detailed'>('compact');
    const [collapseRecurring, setCollapseRecurring] = useState(true);

    const [formData, setFormData] = useState({
        family_member_id: '',
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
                await Promise.all([loadMembers(), loadEntries(weekStart)]);
            } finally {
                setLoading(false);
            }
        };
        void bootstrap();
    }, []);

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
        if (familyMembers.length === 0 || editingEntry || formData.family_member_id) {
            return;
        }
        const first = familyMembers[0];
        setFormData((prev) => ({
            ...prev,
            family_member_id: first.id,
            schedule_type: defaultTypeFromRole(first.role),
        }));
    }, [familyMembers, editingEntry, formData.family_member_id]);

    useEffect(() => {
        loadEntries(weekStart);
    }, [weekStart]);

    const loadMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>(
                '/api/family',
            );
            if (response.success) {
                setFamilyMembers(response.data);
            }
        } catch (err) {
            console.error('Failed to load members:', err);
            setError(err instanceof Error ? err.message : t('planning.errors.load_members'));
        }
    };

    const loadEntries = async (ws?: Date) => {
        try {
            const weekStartParam = ws ? format(ws, 'yyyy-MM-dd') : format(weekStart, 'yyyy-MM-dd');
            const response = await api.get<{ success: boolean; data: PlanningEntry[] }>(
                `/api/planning?week_start=${weekStartParam}`,
            );
            if (response.success) {
                setEntries(response.data);
            }
        } catch (err) {
            console.error('Failed to load planning entries:', err);
            setError(err instanceof Error ? err.message : t('planning.errors.load'));
        }
    };

    const resetForm = (dayOfWeek = 1) => {
        setEditingEntry(null);
        setSelectedDays([dayOfWeek]);
        setReplaceConflicts(false);
        setThisWeekOnly(false);
        const first = familyMembers[0];
        setFormData({
            family_member_id: first?.id || '',
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
            family_member_id: entry.family_member_id,
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

    const handleDelete = async (entryIds: string[]) => {
        const ids = Array.isArray(entryIds) ? entryIds : [entryIds];
        if (ids.length === 0) return;
        const message =
            ids.length === 1
                ? t('planning.confirm_delete_one')
                : t('planning.confirm_delete_recurring', { count: ids.length });
        if (!confirm(message)) {
            return;
        }
        setError('');
        setNotice('');
        try {
            // Fire deletes in parallel — server is per-id, no bulk endpoint
            // currently, but Promise.all keeps the UX snappy.
            await Promise.all(ids.map((id) => api.delete(`/api/planning/${id}`)));
            await loadEntries(weekStart);
        } catch (err) {
            console.error('Failed to delete planning entry:', err);
            setError(err instanceof Error ? err.message : t('planning.errors.delete'));
        }
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

        if (!formData.family_member_id || !formData.title.trim()) {
            setError(t('planning.errors.member_title_required'));
            return;
        }

        if (
            !formData.start_time ||
            !formData.end_time ||
            formData.end_time === formData.start_time
        ) {
            setError(t('planning.errors.times_identical'));
            return;
        }

        if (selectedDays.length === 0) {
            setError(t('planning.errors.select_day'));
            return;
        }

        const basePayload = {
            family_member_id: formData.family_member_id,
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
                setNotice(t('planning.notice.saved'));
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
                },
            );

            setDialogOpen(false);
            resetForm(selectedDays[0]);
            await loadEntries(weekStart);

            if (response.success) {
                const applied = response.data.created + response.data.updated;
                if (response.data.conflicts.length > 0) {
                    const conflictDays = response.data.conflicts
                        .map((item) => getDayLabel(item.day_of_week, t))
                        .join(', ');
                    setNotice(
                        t('planning.notice.saved_days_conflicts', {
                            count: applied,
                            days: conflictDays,
                        }),
                    );
                } else {
                    setNotice(t('planning.notice.saved_days', { count: applied }));
                }
            }
        } catch (err) {
            console.error('Failed to save planning entry:', err);
            setError(err instanceof Error ? err.message : t('planning.errors.save'));
        }
    };

    const visibleEntries = useMemo(() => {
        return entries
            .filter((entry) =>
                selectedMemberId ? entry.family_member_id === selectedMemberId : true,
            )
            .filter((entry) =>
                selectedType !== 'all' ? entry.schedule_type === selectedType : true,
            )
            .sort((a, b) => {
                if (a.day_of_week !== b.day_of_week) {
                    return a.day_of_week - b.day_of_week;
                }
                return a.start_time.localeCompare(b.start_time);
            });
    }, [entries, selectedMemberId, selectedType]);

    // Collapse "same event on multiple days" into a single anchor card carrying
    // the full set of repeat days. The anchor is the earliest day in the run.
    // Two entries are considered the same recurring occurrence when member,
    // type, title, times, location AND specific_date all match — a one-off
    // event with a specific_date never merges with anything.
    const groupedEntries = useMemo<GroupedPlanningEntry[]>(() => {
        if (!collapseRecurring) {
            return visibleEntries.map((entry) => ({
                ...entry,
                repeatDays: [entry.day_of_week],
                groupIds: [entry.id],
            }));
        }
        const keyFor = (e: PlanningEntry) =>
            [
                e.family_member_id,
                e.schedule_type,
                e.title.trim().toLowerCase(),
                e.start_time,
                e.end_time,
                (e.location ?? '').trim().toLowerCase(),
                e.specific_date ?? '',
            ].join('|');
        const groups = new Map<string, PlanningEntry[]>();
        for (const entry of visibleEntries) {
            const k = keyFor(entry);
            const bucket = groups.get(k) ?? [];
            bucket.push(entry);
            groups.set(k, bucket);
        }
        const result: GroupedPlanningEntry[] = [];
        for (const bucket of groups.values()) {
            const sorted = [...bucket].sort((a, b) => a.day_of_week - b.day_of_week);
            const anchor = sorted[0];
            result.push({
                ...anchor,
                repeatDays: sorted.map((s) => s.day_of_week),
                groupIds: sorted.map((s) => s.id),
            });
        }
        return result.sort((a, b) => {
            if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
            return a.start_time.localeCompare(b.start_time);
        });
    }, [visibleEntries, collapseRecurring]);

    if (loading) {
        return (
            <div className="flex h-full min-h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="animate-pulse font-medium text-muted-foreground">
                        {t('planning.loading')}
                    </p>
                </div>
            </div>
        );
    }

    if (familyMembers.length === 0) {
        return (
            <Card>
                <CardContent className="p-10 text-center">
                    <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
                    <h2 className="text-h2">{t('planning.no_members.title')}</h2>
                    <p className="mt-1 text-caption text-muted-foreground">
                        {t('planning.no_members.subtitle')}
                    </p>
                    <Button className="mt-5" onClick={() => navigate('/family')}>
                        {t('planning.no_members.go_to_family')}
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
                    <h1 className="text-h1">{t('planning.title')}</h1>
                    <p className="text-caption text-muted-foreground">{t('planning.subtitle')}</p>
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
                    {t('planning.new_schedule')}
                </Button>
            </div>

            <Card>
                <CardContent className="space-y-3 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setWeekAnchor(subWeeks(weekAnchor, 1))}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setWeekAnchor(new Date())}
                            >
                                {t('planning.toolbar.this_week')}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setWeekAnchor(addWeeks(weekAnchor, 1))}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <span className="ml-2 text-caption text-muted-foreground">
                                {format(weekStart, 'dd MMM', { locale })} -{' '}
                                {format(addDays(weekStart, 6), 'dd MMM yyyy', { locale })}
                            </span>
                        </div>

                        {/* Segmented view switcher */}
                        <div className="inline-flex rounded-pill border border-border bg-surface-2 p-0.5">
                            {[
                                {
                                    v: 'week' as const,
                                    label: t('planning.toolbar.view_week'),
                                    icon: LayoutGrid,
                                },
                                {
                                    v: 'list' as const,
                                    label: t('planning.toolbar.view_list'),
                                    icon: List,
                                },
                                {
                                    v: 'member' as const,
                                    label: t('planning.toolbar.view_member'),
                                    icon: Users,
                                },
                            ].map(({ v, label, icon: Icon }) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setViewMode(v)}
                                    className={`inline-flex items-center gap-1 rounded-pill px-3 py-1 text-micro font-medium transition-colors ${
                                        viewMode === v
                                            ? 'bg-card text-primary shadow-surface'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:flex-1 md:gap-3">
                            <Select
                                value={selectedMemberId}
                                onValueChange={setSelectedMemberId}
                                options={[
                                    { value: '', label: t('planning.toolbar.all_members') },
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
                                    { value: 'all', label: t('planning.toolbar.all_types') },
                                    ...TYPE_OPTIONS,
                                ]}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-micro text-muted-foreground">
                            <label className="inline-flex cursor-pointer items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={collapseRecurring}
                                    onChange={(e) => setCollapseRecurring(e.target.checked)}
                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                />
                                {t('planning.toolbar.collapse_recurring')}
                            </label>
                            <div className="inline-flex rounded-pill border border-border bg-surface-2 p-0.5">
                                {(['compact', 'detailed'] as const).map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setDensity(d)}
                                        className={`rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                            density === d
                                                ? 'bg-card text-primary shadow-surface'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {d === 'compact'
                                            ? t('planning.toolbar.compact')
                                            : t('planning.toolbar.detailed')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {viewMode === 'week' ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
                    {DAYS.map((day, index) => {
                        const dateForHeader = addDays(weekStart, index);
                        // When collapsed, an entry "lives" on the smallest day
                        // of its repeat group, so we don't re-show it Tue–Fri.
                        const dayEntries = groupedEntries.filter(
                            (entry) => entry.day_of_week === day.value,
                        );
                        return (
                            <Card key={day.value} hover={false} className="min-h-[200px]">
                                <CardHeader className="pb-1.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <CardTitle className="text-caption">
                                                {day.label}
                                            </CardTitle>
                                            <p className="text-micro text-muted-foreground">
                                                {format(dateForHeader, 'dd/MM', { locale })}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleAddForDay(day.value)}
                                            className="h-7 px-1.5"
                                            aria-label={t('planning.add_for_day_aria', {
                                                day: day.label,
                                            })}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-1.5 pt-0">
                                    {dayEntries.length === 0 ? (
                                        <button
                                            type="button"
                                            onClick={() => handleAddForDay(day.value)}
                                            className="w-full rounded-input border border-dashed border-border px-3 py-4 text-center text-micro text-muted-foreground hover:bg-surface-2"
                                        >
                                            + {t('planning.add')}
                                        </button>
                                    ) : (
                                        dayEntries.map((entry) => (
                                            <PlanningEventCard
                                                key={entry.id}
                                                entry={entry}
                                                density={density}
                                                onEdit={handleEdit}
                                                onDelete={handleDelete}
                                            />
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : null}

            {viewMode === 'list' ? (
                <div className="space-y-4">
                    {DAYS.map((day, index) => {
                        const dateForHeader = addDays(weekStart, index);
                        const dayEntries = groupedEntries.filter(
                            (entry) => entry.day_of_week === day.value,
                        );
                        if (dayEntries.length === 0) return null;
                        return (
                            <div key={day.value} className="space-y-2">
                                <div className="flex items-center justify-between border-b border-border pb-1">
                                    <div className="flex items-baseline gap-2">
                                        <h2 className="text-h2 font-semibold text-foreground">
                                            {day.label}
                                        </h2>
                                        <span className="text-caption text-muted-foreground">
                                            {format(dateForHeader, 'dd MMMM', { locale })}
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleAddForDay(day.value)}
                                    >
                                        <Plus className="mr-1 h-3.5 w-3.5" />
                                        {t('planning.add')}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                    {dayEntries.map((entry) => (
                                        <PlanningEventCard
                                            key={entry.id}
                                            entry={entry}
                                            density={density}
                                            onEdit={handleEdit}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {groupedEntries.length === 0 ? (
                        <div className="rounded-card border border-dashed border-border bg-card py-12 text-center">
                            <CalendarDays className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
                            <p className="text-caption text-muted-foreground">
                                {t('planning.empty_week')}
                            </p>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {viewMode === 'member' ? (
                <div className="space-y-4">
                    {familyMembers
                        .filter((m) => !selectedMemberId || m.id === selectedMemberId)
                        .map((member) => {
                            const memberEntries = groupedEntries.filter(
                                (entry) => entry.family_member_id === member.id,
                            );
                            return (
                                <Card key={member.id} hover={false}>
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                                                style={{ backgroundColor: member.color }}
                                            >
                                                {member.name.slice(0, 2).toUpperCase()}
                                            </span>
                                            <CardTitle className="text-body">
                                                {member.name}
                                            </CardTitle>
                                            <span className="ml-auto text-micro text-muted-foreground">
                                                {t('planning.member.schedules', {
                                                    count: memberEntries.length,
                                                })}
                                            </span>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        {memberEntries.length === 0 ? (
                                            <p className="text-caption text-muted-foreground">
                                                {t('planning.member.none')}
                                            </p>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                                                {memberEntries.map((entry) => (
                                                    <PlanningEventCard
                                                        key={entry.id}
                                                        entry={entry}
                                                        density={density}
                                                        onEdit={handleEdit}
                                                        onDelete={handleDelete}
                                                        showDayLabel
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                </div>
            ) : null}

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) {
                        resetForm(selectedDays[0] || 1);
                    }
                }}
                title={
                    editingEntry ? t('planning.dialog.edit_title') : t('planning.dialog.new_title')
                }
                description={t('planning.dialog.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-label font-medium text-foreground">
                                {t('planning.dialog.member_label')}
                            </label>
                            <Select
                                value={formData.family_member_id}
                                onValueChange={(value) => {
                                    const member = familyMembers.find((item) => item.id === value);
                                    setFormData((prev) => ({
                                        ...prev,
                                        family_member_id: value,
                                        schedule_type: member
                                            ? defaultTypeFromRole(member.role)
                                            : prev.schedule_type,
                                    }));
                                }}
                                options={familyMembers.map((member) => ({
                                    value: member.id,
                                    label: `${member.name} (${member.role})`,
                                }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-label font-medium text-foreground">
                                {t('planning.dialog.type_label')}
                            </label>
                            <Select
                                value={formData.schedule_type}
                                onValueChange={(value) =>
                                    setFormData((prev) => ({ ...prev, schedule_type: value }))
                                }
                                options={TYPE_OPTIONS}
                            />
                        </div>
                    </div>

                    <Input
                        label={t('planning.dialog.title_label')}
                        value={formData.title}
                        onChange={(e) =>
                            setFormData((prev) => ({ ...prev, title: e.target.value }))
                        }
                        placeholder={t('planning.dialog.title_placeholder')}
                        required
                    />

                    <div>
                        <label className="mb-1.5 block text-label font-medium text-foreground">
                            {t('planning.dialog.days_label')}
                        </label>
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
                                {t('planning.dialog.weekdays')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDays(FULL_WEEK)}
                            >
                                {t('planning.dialog.full_week')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDays([1])}
                            >
                                {t('planning.dialog.reset')}
                            </Button>
                        </div>
                        <p className="mt-2 text-micro text-muted-foreground">
                            {selectedDays.length === 1
                                ? t('planning.dialog.day_selected', {
                                      day: getDayLabel(selectedDays[0], t),
                                  })
                                : t('planning.dialog.days_selected', {
                                      count: selectedDays.length,
                                  })}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                            label={t('planning.dialog.start_label')}
                            type="time"
                            value={formData.start_time}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, start_time: e.target.value }))
                            }
                            required
                        />
                        <div>
                            <Input
                                label={t('planning.dialog.end_label')}
                                type="time"
                                value={formData.end_time}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, end_time: e.target.value }))
                                }
                                required
                            />
                            {formData.end_time &&
                                formData.start_time &&
                                formData.end_time < formData.start_time && (
                                    <p className="mt-1 text-micro text-muted-foreground">
                                        {t('planning.dialog.ends_next_day')}
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
                            <strong>{t('planning.dialog.this_week_only')}</strong>
                            {t('planning.dialog.this_week_only_desc', {
                                date: format(weekStart, 'dd MMM yyyy', { locale }),
                            })}
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
                            <span>{t('planning.dialog.replace_conflicts')}</span>
                        </label>
                    ) : null}

                    <Input
                        label={t('planning.dialog.location_label')}
                        value={formData.location}
                        onChange={(e) =>
                            setFormData((prev) => ({ ...prev, location: e.target.value }))
                        }
                        placeholder={t('planning.dialog.location_placeholder')}
                    />

                    <Textarea
                        label={t('planning.dialog.notes_label')}
                        value={formData.notes}
                        onChange={(e) =>
                            setFormData((prev) => ({ ...prev, notes: e.target.value }))
                        }
                        placeholder={t('planning.dialog.notes_placeholder')}
                        rows={2}
                    />

                    <div className="flex justify-end gap-3 pt-3">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setDialogOpen(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">
                            {selectedDays.length > 1
                                ? t('planning.dialog.apply_to_days')
                                : editingEntry
                                  ? t('common.save')
                                  : t('planning.dialog.add')}
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Planning;
