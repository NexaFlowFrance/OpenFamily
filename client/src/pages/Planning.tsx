import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Briefcase,
    BookOpen,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Edit2,
    GraduationCap,
    Plus,
    Trash2,
    Users,
} from 'lucide-react';
import { addDays, addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, Input, Select, Textarea } from '../components/ui';

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
    family_member_role: string;
    schedule_type: 'work' | 'school' | 'study' | 'activity' | 'other';
    title: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    location?: string;
    notes?: string;
}

interface PlanningBulkResult {
    entries: PlanningEntry[];
    created: number;
    updated: number;
    conflicts: Array<{ day_of_week: number; conflict_ids: string[] }>;
}

const DAYS = [
    { value: 1, label: 'Lundi', short: 'Lun' },
    { value: 2, label: 'Mardi', short: 'Mar' },
    { value: 3, label: 'Mercredi', short: 'Mer' },
    { value: 4, label: 'Jeudi', short: 'Jeu' },
    { value: 5, label: 'Vendredi', short: 'Ven' },
    { value: 6, label: 'Samedi', short: 'Sam' },
    { value: 7, label: 'Dimanche', short: 'Dim' },
];

const TYPE_OPTIONS = [
    { value: 'work', label: 'Travail' },
    { value: 'school', label: 'Ecole' },
    { value: 'study', label: 'Etudes' },
    { value: 'activity', label: 'Activite' },
    { value: 'other', label: 'Autre' },
];

const WEEKDAYS = [1, 2, 3, 4, 5];
const FULL_WEEK = [1, 2, 3, 4, 5, 6, 7];

const sortDays = (values: number[]) => [...values].sort((a, b) => a - b);

const formatTime = (raw: string) => raw.slice(0, 5);

const getDayLabel = (day: number) => DAYS.find((item) => item.value === day)?.label || `Jour ${day}`;

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
    const navigate = useNavigate();
    const [entries, setEntries] = useState<PlanningEntry[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [weekAnchor, setWeekAnchor] = useState(new Date());
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedDays, setSelectedDays] = useState<number[]>([1]);
    const [replaceConflicts, setReplaceConflicts] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<PlanningEntry | null>(null);

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
                await Promise.all([loadMembers(), loadEntries()]);
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

    const loadMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>('/api/family');
            if (response.success) {
                setFamilyMembers(response.data);
            }
        } catch (err) {
            console.error('Failed to load members:', err);
            setError(err instanceof Error ? err.message : 'Impossible de charger les membres.');
        }
    };

    const loadEntries = async () => {
        try {
            const response = await api.get<{ success: boolean; data: PlanningEntry[] }>('/api/planning');
            if (response.success) {
                setEntries(response.data);
            }
        } catch (err) {
            console.error('Failed to load planning entries:', err);
            setError(err instanceof Error ? err.message : 'Impossible de charger le planning.');
        }
    };

    const resetForm = (dayOfWeek = 1) => {
        setEditingEntry(null);
        setSelectedDays([dayOfWeek]);
        setReplaceConflicts(false);
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

    const handleDelete = async (entryId: string) => {
        if (!confirm('Supprimer cet horaire ?')) {
            return;
        }
        setError('');
        setNotice('');
        try {
            await api.delete(`/api/planning/${entryId}`);
            await loadEntries();
        } catch (err) {
            console.error('Failed to delete planning entry:', err);
            setError(err instanceof Error ? err.message : 'Impossible de supprimer cet horaire.');
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
            setError('Le membre et le titre sont obligatoires.');
            return;
        }

        if (!formData.start_time || !formData.end_time || formData.end_time <= formData.start_time) {
            setError("L'heure de fin doit etre apres l'heure de debut.");
            return;
        }

        if (selectedDays.length === 0) {
            setError('Selectionnez au moins un jour.');
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
                const payload = {
                    ...basePayload,
                    day_of_week: selectedDays[0],
                };

                if (editingEntry) {
                    await api.put(`/api/planning/${editingEntry.id}`, payload);
                } else {
                    await api.post('/api/planning', payload);
                }

                setDialogOpen(false);
                resetForm(selectedDays[0]);
                await loadEntries();
                setNotice('Horaire enregistre.');
                return;
            }

            const response = await api.post<{ success: boolean; data: PlanningBulkResult }>(
                '/api/planning/bulk',
                {
                    ...basePayload,
                    day_of_week_list: sortDays(selectedDays),
                    replace_conflicts: replaceConflicts,
                    source_entry_id: editingEntry?.id || null,
                }
            );

            setDialogOpen(false);
            resetForm(selectedDays[0]);
            await loadEntries();

            if (response.success) {
                const applied = response.data.created + response.data.updated;
                if (response.data.conflicts.length > 0) {
                    const conflictDays = response.data.conflicts
                        .map((item) => getDayLabel(item.day_of_week))
                        .join(', ');
                    setNotice(`Enregistre sur ${applied} jour(s). Conflits detectes sur: ${conflictDays}.`);
                } else {
                    setNotice(`Enregistre sur ${applied} jour(s).`);
                }
            }
        } catch (err) {
            console.error('Failed to save planning entry:', err);
            setError(err instanceof Error ? err.message : "Impossible d'enregistrer cet horaire.");
        }
    };

    const visibleEntries = useMemo(() => {
        return entries
            .filter((entry) => (selectedMemberId ? entry.family_member_id === selectedMemberId : true))
            .filter((entry) => (selectedType !== 'all' ? entry.schedule_type === selectedType : true))
            .sort((a, b) => {
                if (a.day_of_week !== b.day_of_week) {
                    return a.day_of_week - b.day_of_week;
                }
                return a.start_time.localeCompare(b.start_time);
            });
    }, [entries, selectedMemberId, selectedType]);

    const entryTypeBadge = (type: PlanningEntry['schedule_type']) => {
        if (type === 'work') {
            return { label: 'Travail', variant: 'primary' as const, icon: Briefcase };
        }
        if (type === 'school') {
            return { label: 'Ecole', variant: 'success' as const, icon: GraduationCap };
        }
        if (type === 'study') {
            return { label: 'Etudes', variant: 'warning' as const, icon: BookOpen };
        }
        if (type === 'activity') {
            return { label: 'Activite', variant: 'secondary' as const, icon: CalendarDays };
        }
        return { label: 'Autre', variant: 'default' as const, icon: CalendarDays };
    };

    if (loading) {
        return (
            <div className="flex h-full min-h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="animate-pulse font-medium text-muted-foreground">Chargement du planning...</p>
                </div>
            </div>
        );
    }

    if (familyMembers.length === 0) {
        return (
            <Card>
                <CardContent className="p-10 text-center">
                    <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
                    <h2 className="text-h2">Ajoutez d'abord vos membres</h2>
                    <p className="mt-1 text-caption text-muted-foreground">
                        Le planning hebdomadaire s'appuie sur les profils famille.
                    </p>
                    <Button className="mt-5" onClick={() => navigate('/family')}>
                        Aller a Famille
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
                    <h1 className="text-h1">Planning Hebdomadaire</h1>
                    <p className="text-caption text-muted-foreground">
                        Horaires recurents de travail et emploi du temps scolaire, semaine par semaine.
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
                    Nouvel horaire
                </Button>
            </div>

            <Card>
                <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(subWeeks(weekAnchor, 1))}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(new Date())}>
                            Cette semaine
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(addWeeks(weekAnchor, 1))}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <span className="ml-2 text-caption text-muted-foreground">
                            {format(weekStart, 'dd MMM', { locale: fr })} - {format(addDays(weekStart, 6), 'dd MMM yyyy', { locale: fr })}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Select
                            value={selectedMemberId}
                            onValueChange={setSelectedMemberId}
                            options={[
                                { value: '', label: 'Tous les membres' },
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
                                { value: 'all', label: 'Tous les types' },
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
                    return (
                        <Card key={day.value} hover={false} className="min-h-[280px]">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <CardTitle className="text-caption">{day.label}</CardTitle>
                                        <p className="text-micro text-muted-foreground">
                                            {format(dateForHeader, 'dd/MM', { locale: fr })}
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
                                {dayEntries.length === 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => handleAddForDay(day.value)}
                                        className="w-full rounded-input border border-dashed border-border px-3 py-5 text-center text-micro text-muted-foreground hover:bg-surface-2"
                                    >
                                        Ajouter
                                    </button>
                                ) : (
                                    dayEntries.map((entry) => {
                                        const typeMeta = entryTypeBadge(entry.schedule_type);
                                        const TypeIcon = typeMeta.icon;
                                        return (
                                            <div key={entry.id} className="rounded-input border border-border bg-card p-2 shadow-surface">
                                                <div className="mb-1 flex items-center justify-between gap-2">
                                                    <p className="text-micro font-semibold text-foreground">
                                                        {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                                                    </p>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                                                            onClick={() => handleEdit(entry)}
                                                        >
                                                            <Edit2 className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                            onClick={() => handleDelete(entry.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="truncate text-caption font-medium">{entry.title}</p>
                                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                                    <Badge variant={typeMeta.variant}>
                                                        <span className="inline-flex items-center gap-1">
                                                            <TypeIcon className="h-3 w-3" />
                                                            {typeMeta.label}
                                                        </span>
                                                    </Badge>
                                                    <Badge variant="default">
                                                        <span className="inline-flex items-center gap-1">
                                                            <span
                                                                className="h-2 w-2 rounded-full"
                                                                style={{ backgroundColor: entry.family_member_color }}
                                                            />
                                                            {entry.family_member_name}
                                                        </span>
                                                    </Badge>
                                                </div>
                                                {entry.location ? (
                                                    <p className="mt-1 truncate text-micro text-muted-foreground">{entry.location}</p>
                                                ) : null}
                                            </div>
                                        );
                                    })
                                )}
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
                title={editingEntry ? 'Modifier un horaire' : 'Nouvel horaire'}
                description="Definissez un horaire et appliquez-le a un ou plusieurs jours."
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-label font-medium text-foreground">Membre</label>
                            <Select
                                value={formData.family_member_id}
                                onValueChange={(value) => {
                                    const member = familyMembers.find((item) => item.id === value);
                                    setFormData((prev) => ({
                                        ...prev,
                                        family_member_id: value,
                                        schedule_type: member ? defaultTypeFromRole(member.role) : prev.schedule_type,
                                    }));
                                }}
                                options={familyMembers.map((member) => ({
                                    value: member.id,
                                    label: `${member.name} (${member.role})`,
                                }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-label font-medium text-foreground">Type</label>
                            <Select
                                value={formData.schedule_type}
                                onValueChange={(value) => setFormData((prev) => ({ ...prev, schedule_type: value }))}
                                options={TYPE_OPTIONS}
                            />
                        </div>
                    </div>

                    <Input
                        label="Intitule"
                        value={formData.title}
                        onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Ex: Bureau - Equipe Produit / Mathematiques"
                        required
                    />

                    <div>
                        <label className="mb-1.5 block text-label font-medium text-foreground">Jours concernes</label>
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
                                Lun-Ven
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDays(FULL_WEEK)}
                            >
                                Semaine complete
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDays([1])}
                            >
                                Reinitialiser
                            </Button>
                        </div>
                        <p className="mt-2 text-micro text-muted-foreground">
                            {selectedDays.length === 1
                                ? `Jour selectionne: ${getDayLabel(selectedDays[0])}`
                                : `${selectedDays.length} jours selectionnes`}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                            label="Debut"
                            type="time"
                            value={formData.start_time}
                            onChange={(e) => setFormData((prev) => ({ ...prev, start_time: e.target.value }))}
                            required
                        />
                        <Input
                            label="Fin"
                            type="time"
                            value={formData.end_time}
                            onChange={(e) => setFormData((prev) => ({ ...prev, end_time: e.target.value }))}
                            required
                        />
                    </div>

                    {selectedDays.length > 1 ? (
                        <label className="flex items-start gap-2 rounded-input border border-border bg-surface-2/50 px-3 py-2 text-caption text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={replaceConflicts}
                                onChange={(e) => setReplaceConflicts(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-border"
                            />
                            <span>
                                Remplacer les horaires en conflit sur les jours selectionnes.
                                Si des conflits existent et que cette option est desactivee, ces jours seront ignores.
                            </span>
                        </label>
                    ) : null}

                    <Input
                        label="Lieu (optionnel)"
                        value={formData.location}
                        onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                        placeholder="Ex: Bureau Lyon / College Jean Moulin"
                    />

                    <Textarea
                        label="Notes (optionnel)"
                        value={formData.notes}
                        onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Informations utiles, salle, matiere, transport..."
                        rows={2}
                    />

                    <div className="flex justify-end gap-3 pt-3">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button type="submit">
                            {selectedDays.length > 1
                                ? 'Appliquer aux jours selectionnes'
                                : editingEntry
                                    ? 'Enregistrer'
                                    : 'Ajouter'}
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Planning;
