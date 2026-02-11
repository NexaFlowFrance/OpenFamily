import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Edit2, Trash2, MapPin, Clock } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea, Badge } from '../components/ui';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface Appointment {
    id: string;
    title: string;
    description?: string;
    start_time: string;
    end_time?: string;
    location?: string;
    family_member_id?: string;
    family_member_name?: string;
    family_member_color?: string;
    reminder_30min: boolean;
    reminder_1hour: boolean;
    notes?: string;
}

interface FamilyMember {
    id: string;
    name: string;
    color: string;
}

const splitDateTime = (value?: string) => {
    if (!value) {
        return { date: '', time: '' };
    }
    const normalized = value.replace(' ', 'T');
    const [datePart = '', timePart = ''] = normalized.split('T');
    return {
        date: datePart.slice(0, 10),
        time: timePart.slice(0, 5),
    };
};

const combineDateTime = (date: string, time: string) => {
    if (!date || !time) {
        return '';
    }
    return `${date}T${time}`;
};

const addMinutes = (dateTime: string, minutes: number) => {
    const base = new Date(dateTime.length === 16 ? `${dateTime}:00` : dateTime);
    if (Number.isNaN(base.getTime())) {
        return '';
    }
    base.setMinutes(base.getMinutes() + minutes);
    return format(base, "yyyy-MM-dd'T'HH:mm");
};

const Calendar: React.FC = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
    const [error, setError] = useState('');
    const [endManuallySet, setEndManuallySet] = useState(false);
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        start_time: '',
        end_time: '',
        location: '',
        family_member_id: '',
        reminder_30min: false,
        reminder_1hour: false,
        notes: '',
    });

    useEffect(() => {
        loadAppointments();
        loadFamilyMembers();
    }, [currentDate]);

    const loadAppointments = async () => {
        try {
            const start = startOfMonth(currentDate);
            const end = endOfMonth(currentDate);
            const response = await api.get<{ success: boolean; data: Appointment[] }>(
                `/api/appointments?start_date=${start.toISOString()}&end_date=${end.toISOString()}`
            );
            if (response.success) {
                setAppointments(response.data);
            }
        } catch (error) {
            console.error('Failed to load appointments:', error);
            setError(error instanceof Error ? error.message : 'Impossible de charger les rendez-vous.');
        } finally {
            setLoading(false);
        }
    };

    const loadFamilyMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>('/api/family');
            if (response.success) {
                setFamilyMembers(response.data);
            }
        } catch (error) {
            console.error('Failed to load family members:', error);
            setError(error instanceof Error ? error.message : 'Impossible de charger les membres.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!formData.start_time) {
            setError('Veuillez renseigner une date et une heure de debut.');
            return;
        }

        if (formData.end_time && new Date(formData.end_time).getTime() < new Date(formData.start_time).getTime()) {
            setError('L heure de fin doit etre apres l heure de debut.');
            return;
        }

        try {
            if (editingAppointment) {
                await api.put(`/api/appointments/${editingAppointment.id}`, formData);
            } else {
                await api.post('/api/appointments', formData);
            }
            setDialogOpen(false);
            resetForm();
            loadAppointments();
        } catch (error) {
            console.error('Failed to save appointment:', error);
            setError(error instanceof Error ? error.message : 'Impossible d’enregistrer ce rendez-vous.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce rendez-vous ?')) return;
        try {
            await api.delete(`/api/appointments/${id}`);
            loadAppointments();
        } catch (error) {
            console.error('Failed to delete appointment:', error);
            setError(error instanceof Error ? error.message : 'Impossible de supprimer ce rendez-vous.');
        }
    };

    const handleEdit = (appointment: Appointment) => {
        setEditingAppointment(appointment);
        setEndManuallySet(Boolean(appointment.end_time));
        setFormData({
            title: appointment.title,
            description: appointment.description || '',
            start_time: appointment.start_time.slice(0, 16),
            end_time: appointment.end_time ? appointment.end_time.slice(0, 16) : '',
            location: appointment.location || '',
            family_member_id: appointment.family_member_id || '',
            reminder_30min: appointment.reminder_30min,
            reminder_1hour: appointment.reminder_1hour,
            notes: appointment.notes || '',
        });
        setDialogOpen(true);
    };

    const handleDayClick = (date: Date) => {
        const dateStr = format(date, "yyyy-MM-dd'T'09:00");
        setEndManuallySet(false);
        setFormData((prev) => ({
            ...prev,
            start_time: dateStr,
            end_time: format(date, "yyyy-MM-dd'T'10:00"),
        }));
        setDialogOpen(true);
    };

    const resetForm = () => {
        setEditingAppointment(null);
        setEndManuallySet(false);
        setFormData({
            title: '',
            description: '',
            start_time: '',
            end_time: '',
            location: '',
            family_member_id: '',
            reminder_30min: false,
            reminder_1hour: false,
            notes: '',
        });
    };

    const startParts = splitDateTime(formData.start_time);
    const endParts = splitDateTime(formData.end_time);
    const selectedDate = startParts.date || format(new Date(), 'yyyy-MM-dd');
    const selectedStartTime = startParts.time || '09:00';
    const selectedEndDate = endParts.date || selectedDate;
    const selectedEndTime = endParts.time || '10:00';

    const handleDateChange = (nextDate: string) => {
        setFormData((prev) => {
            const currentStartTime = splitDateTime(prev.start_time).time || '09:00';
            const nextStart = combineDateTime(nextDate, currentStartTime);
            const currentEnd = splitDateTime(prev.end_time);
            const endDateToUse = endManuallySet && currentEnd.date ? currentEnd.date : nextDate;
            const endTimeToUse = endManuallySet && currentEnd.time ? currentEnd.time : '10:00';
            const nextEnd = endManuallySet ? combineDateTime(endDateToUse, endTimeToUse) : addMinutes(nextStart, 60);
            return {
                ...prev,
                start_time: nextStart,
                end_time: nextEnd,
            };
        });
    };

    const handleStartTimeChange = (nextTime: string) => {
        setFormData((prev) => {
            const date = splitDateTime(prev.start_time).date || format(new Date(), 'yyyy-MM-dd');
            const nextStart = combineDateTime(date, nextTime);
            const nextEnd = endManuallySet ? prev.end_time : addMinutes(nextStart, 60);
            return {
                ...prev,
                start_time: nextStart,
                end_time: nextEnd,
            };
        });
    };

    const handleEndDateChange = (nextDate: string) => {
        setEndManuallySet(true);
        setFormData((prev) => {
            const time = splitDateTime(prev.end_time).time || '10:00';
            return {
                ...prev,
                end_time: combineDateTime(nextDate, time),
            };
        });
    };

    const handleEndTimeChange = (nextTime: string) => {
        setEndManuallySet(true);
        setFormData((prev) => {
            const date = splitDateTime(prev.end_time).date || splitDateTime(prev.start_time).date || format(new Date(), 'yyyy-MM-dd');
            return {
                ...prev,
                end_time: combineDateTime(date, nextTime),
            };
        });
    };

    const applyDurationPreset = (minutes: number) => {
        setEndManuallySet(true);
        setFormData((prev) => {
            const date = splitDateTime(prev.start_time).date || format(new Date(), 'yyyy-MM-dd');
            const startTime = splitDateTime(prev.start_time).time || '09:00';
            const start = combineDateTime(date, startTime);
            return {
                ...prev,
                start_time: start,
                end_time: addMinutes(start, minutes),
            };
        });
    };

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const getAppointmentsForDay = (date: Date) => {
        return appointments.filter((apt) => isSameDay(new Date(apt.start_time), date));
    };

    const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">Chargement du calendrier...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {error}
                </div>
            ) : null}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 mb-1">Calendrier</h1>
                    <p className="text-muted-foreground text-body">Gérez vos rendez-vous familiaux</p>
                </div>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouveau rendez-vous
                </Button>
            </div>

            {/* Calendar Header */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-h2 font-semibold">
                            {format(currentDate, 'MMMM yyyy', { locale: fr })}
                        </h2>
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setCurrentDate(new Date())}
                            >
                                Aujourd'hui
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-2">
                        {/* Week day headers */}
                        {weekDays.map((day) => (
                            <div
                                key={day}
                                className="text-center text-label font-semibold text-muted-foreground py-2"
                            >
                                {day}
                            </div>
                        ))}

                        {/* Calendar days */}
                        {calendarDays.map((day, index) => {
                            const dayAppointments = getAppointmentsForDay(day);
                            const isCurrentMonth = isSameMonth(day, currentDate);
                            const isTodayDate = isToday(day);

                            return (
                                <div
                                    key={index}
                                    onClick={() => isCurrentMonth && handleDayClick(day)}
                                    className={`
                                        min-h-[100px] p-2 border rounded-lg cursor-pointer transition-all
                                        ${isCurrentMonth ? 'bg-card hover:bg-nexus-background' : 'bg-surface-2 opacity-50'}
                                        ${isTodayDate ? 'border-nexus-blue border-2' : 'border-border'}
                                        ${!isCurrentMonth && 'cursor-default'}
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span
                                            className={`text-body-sm font-medium ${isTodayDate
                                                ? 'bg-nexus-blue text-white w-6 h-6 rounded-full flex items-center justify-center'
                                                : isCurrentMonth
                                                    ? 'text-foreground'
                                                    : 'text-muted-foreground'
                                                }`}
                                        >
                                            {format(day, 'd')}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {dayAppointments.slice(0, 3).map((apt) => (
                                            <div
                                                key={apt.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEdit(apt);
                                                }}
                                                className="text-[10px] p-1 rounded truncate hover:shadow-sm transition-shadow"
                                                style={{
                                                    backgroundColor: apt.family_member_color
                                                        ? `${apt.family_member_color}20`
                                                        : 'rgb(var(--primary-soft))',
                                                    borderLeft: `3px solid ${apt.family_member_color || 'var(--primary-base)'}`,
                                                }}
                                            >
                                                <div className="font-medium truncate">{apt.title}</div>
                                                <div className="text-muted-foreground">
                                                    {format(new Date(apt.start_time), 'HH:mm')}
                                                </div>
                                            </div>
                                        ))}
                                        {dayAppointments.length > 3 && (
                                            <div className="text-[10px] text-muted-foreground text-center">
                                                +{dayAppointments.length - 3} autres
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Upcoming Appointments */}
            <Card>
                <CardContent className="p-6">
                    <h3 className="text-h2 font-semibold mb-4">Rendez-vous à venir</h3>
                    <div className="space-y-3">
                        {appointments
                            .filter((apt) => new Date(apt.start_time) >= new Date())
                            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                            .slice(0, 5)
                            .map((apt) => (
                                <div
                                    key={apt.id}
                                    className="flex items-start gap-4 p-4 bg-nexus-background rounded-lg hover:shadow-sm transition-shadow"
                                >
                                    <div
                                        className="w-1 h-full rounded-full"
                                        style={{ backgroundColor: apt.family_member_color || 'var(--primary-base)' }}
                                    />
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-body mb-1">{apt.title}</h4>
                                        <div className="flex flex-wrap items-center gap-3 text-body-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <CalendarIcon className="w-4 h-4" />
                                                {format(new Date(apt.start_time), 'dd MMM yyyy', { locale: fr })}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-4 h-4" />
                                                {format(new Date(apt.start_time), 'HH:mm')}
                                                {apt.end_time && ` - ${format(new Date(apt.end_time), 'HH:mm')}`}
                                            </div>
                                            {apt.location && (
                                                <div className="flex items-center gap-1">
                                                    <MapPin className="w-4 h-4" />
                                                    {apt.location}
                                                </div>
                                            )}
                                        </div>
                                        {apt.family_member_name && (
                                            <Badge variant="primary" className="mt-2">
                                                {apt.family_member_name}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(apt)}>
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(apt.id)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        {appointments.filter((apt) => new Date(apt.start_time) >= new Date()).length === 0 && (
                            <p className="text-center text-muted-foreground py-8">
                                Aucun rendez-vous à venir
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title={editingAppointment ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
                description="Remplissez les informations du rendez-vous"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Titre"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        placeholder="Ex: Rendez-vous médecin"
                    />
                    <Textarea
                        label="Description (optionnel)"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Détails supplémentaires..."
                        rows={3}
                    />
                    <div className="rounded-input border border-border bg-surface-2/40 p-3">
                        <p className="mb-3 text-caption font-medium text-foreground">Planification</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Input
                                label="Debut date"
                                type="date"
                                value={selectedDate}
                                onChange={(e) => handleDateChange(e.target.value)}
                                required
                            />
                            <Input
                                label="Debut heure"
                                type="time"
                                value={selectedStartTime}
                                onChange={(e) => handleStartTimeChange(e.target.value)}
                                required
                            />
                            <Input
                                label="Fin date"
                                type="date"
                                value={selectedEndDate}
                                onChange={(e) => handleEndDateChange(e.target.value)}
                            />
                            <Input
                                label="Fin heure"
                                type="time"
                                value={selectedEndTime}
                                onChange={(e) => handleEndTimeChange(e.target.value)}
                            />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => applyDurationPreset(30)}>
                                +30 min
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => applyDurationPreset(60)}>
                                +1 h
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => applyDurationPreset(120)}>
                                +2 h
                            </Button>
                        </div>
                    </div>
                    <Input
                        label="Lieu (optionnel)"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder="Ex: Cabinet médical"
                    />
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            Membre de la famille (optionnel)
                        </label>
                        <Select
                            value={formData.family_member_id}
                            onValueChange={(value) => setFormData({ ...formData, family_member_id: value })}
                            options={[
                                { value: '', label: familyMembers.length > 0 ? 'Aucun' : 'Aucun membre disponible' },
                                ...familyMembers.map((member) => ({
                                    value: member.id,
                                    label: member.name,
                                })),
                            ]}
                        />
                        {familyMembers.length === 0 ? (
                            <div className="mt-2 flex items-center justify-between rounded-input border border-border bg-surface-2 px-3 py-2">
                                <span className="text-micro text-muted-foreground">
                                    Ajoutez un membre pour l assigner rapidement.
                                </span>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        setDialogOpen(false);
                                        navigate('/family');
                                    }}
                                >
                                    Aller a Famille
                                </Button>
                            </div>
                        ) : null}
                    </div>
                    <div className="space-y-2">
                        <label className="block text-label font-medium text-foreground">Rappels</label>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.reminder_30min}
                                    onChange={(e) =>
                                        setFormData({ ...formData, reminder_30min: e.target.checked })
                                    }
                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                />
                                <span className="text-body-sm">30 minutes avant</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.reminder_1hour}
                                    onChange={(e) =>
                                        setFormData({ ...formData, reminder_1hour: e.target.checked })
                                    }
                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                />
                                <span className="text-body-sm">1 heure avant</span>
                            </label>
                        </div>
                    </div>
                    <Textarea
                        label="Notes (optionnel)"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Notes supplémentaires..."
                        rows={2}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button type="submit">{editingAppointment ? 'Enregistrer' : 'Créer'}</Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Calendar;
