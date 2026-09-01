import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api } from '../lib/api';
import { apiBase } from '../lib/serverConfig';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Edit2, Trash2, MapPin, Clock, CalendarPlus, Copy, Check, RefreshCw, Search, X } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Textarea, Badge, Select, DatePicker } from '../components/ui';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import { dateLocale } from '../i18n/format';
import { useNavigate } from 'react-router-dom';

interface Appointment {
    id: string;
    occurrence_id?: string;
    series_id?: string;
    occurrence_date?: string;
    is_recurring_occurrence?: boolean;
    series_start_time?: string;
    series_end_time?: string;
    recurrence_frequency?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    recurrence_interval?: number;
    recurrence_until?: string;
    title: string;
    description?: string;
    start_time: string;
    end_time?: string;
    location?: string;
    family_member_ids?: string[];
    family_members_data?: Array<{ id: string; name: string; color: string }>;
    reminder_30min: boolean;
    reminder_1hour: boolean;
    notes?: string;
    color?: string;
    is_all_day?: boolean;
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

const naiveDateTimeMs = (value?: string): number | null => {
    if (!value) return null;

    const match = value.replace(' ', 'T').match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
    );

    if (!match) return null;

    const [, year, month, day, hour, minute, second = '0'] = match;

    return Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
    );
};

const formatNaiveDateTimeMs = (value: number): string => {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, '0');

    return [
        date.getUTCFullYear(),
        '-',
        pad(date.getUTCMonth() + 1),
        '-',
        pad(date.getUTCDate()),
        'T',
        pad(date.getUTCHours()),
        ':',
        pad(date.getUTCMinutes()),
    ].join('');
};

const shiftSeriesDateTime = (
    seriesValue: string | undefined,
    occurrenceValue: string | undefined,
    editedValue: string
): string => {
    const seriesMs = naiveDateTimeMs(seriesValue);
    const occurrenceMs = naiveDateTimeMs(occurrenceValue);
    const editedMs = naiveDateTimeMs(editedValue);

    if (seriesMs === null || occurrenceMs === null || editedMs === null) {
        return editedValue;
    }

    return formatNaiveDateTimeMs(seriesMs + (editedMs - occurrenceMs));
};

const APPOINTMENT_COLORS = [
    { name: 'Red', color: '#DC2626' },
    { name: 'Orange', color: '#F97316' },
    { name: 'Yellow', color: '#EAB308' },
    { name: 'Lime', color: '#84CC16' },
    { name: 'Green', color: '#22C55E' },
    { name: 'Dark Green', color: '#166534' },
    { name: 'Aqua', color: '#2DD4BF' },
    { name: 'Cyan', color: '#06B6D4' },
    { name: 'Blue', color: '#3B82F6' },
    { name: 'Navy', color: '#1E3A8A' },
    { name: 'Purple', color: '#7C3AED' },
    { name: 'Violet', color: '#A855F7' },
    { name: 'Pink', color: '#EC4899' },
    { name: 'Magenta', color: '#C026D3' },
    { name: 'Brown', color: '#92400E' },
    { name: 'Black', color: '#111827' },
] as const;

const Calendar: React.FC = () => {
    const { t } = useTranslation(['calendar', 'common']);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
    const [error, setError] = useState('');
    const [endManuallySet, setEndManuallySet] = useState(false);
    const navigate = useNavigate();

    const [feedDialogOpen, setFeedDialogOpen] = useState(false);
    const [feedToken, setFeedToken] = useState<string | null>(null);
    const [feedCopied, setFeedCopied] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        start_time: '',
        end_time: '',
        location: '',
        family_member_ids: [] as string[],
        reminder_30min: false,
        reminder_1hour: false,
        notes: '',
        color: '#DC4A60',
        is_all_day: false,
        recurrence_frequency: 'none' as 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly',
        recurrence_interval: 1,
        recurrence_until: '',
    });

    const [recurrenceScopeAction, setRecurrenceScopeAction] = useState<{
        mode: 'edit' | 'delete';
        appointment: Appointment;
        payload?: any;
        returnToEditor: boolean;
    } | null>(null);

    const [dayAction, setDayAction] = useState<{
        date: Date;
        appointments: Appointment[];
        mode: 'choice' | 'display';
    } | null>(null);

    useEffect(() => {
        loadAppointments();
        loadAllAppointments();
        loadFamilyMembers();
    }, [currentDate]);

    useWebSocketUpdates('appointments', () => {
        void loadAppointments();
        void loadAllAppointments();
    });

    const loadAllAppointments = async () => {
        try {
            const response = await api.get<{ success: boolean; data: Appointment[] }>(
                '/api/appointments'
            );
            if (response.success) {
                setAllAppointments(response.data);
            }
        } catch (error) {
            console.error('Failed to load Calendar Events for search:', error);
        }
    };

    const loadAppointments = async () => {
        try {
            // Naive local strings: start_time/end_time are stored as local
            // "YYYY-MM-DDTHH:mm:ss" without timezone, so query bounds must match.
            const start = format(startOfMonth(currentDate), "yyyy-MM-dd'T'00:00:00");
            const end = format(endOfMonth(currentDate), "yyyy-MM-dd'T'23:59:59");
            const response = await api.get<{ success: boolean; data: Appointment[] }>(
                `/api/appointments?start_date=${start}&end_date=${end}`
            );
            if (response.success) {
                setAppointments(response.data);
            }
        } catch (error) {
            console.error('Failed to load appointments:', error);
            setError(error instanceof Error ? error.message : t('calendar:errors.loadAppointments'));
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
            setError(error instanceof Error ? error.message : t('calendar:errors.loadMembers'));
        }
    };

    // In same-origin production builds apiBase() is '' — fall back to the page
    // origin so the subscription URL is absolute (and webcal:// rewriting works).
    const feedBaseUrl = apiBase() || window.location.origin;
    const feedUrl = feedToken ? `${feedBaseUrl}/api/calendar/${feedToken}/openfamily.ics` : '';
    const feedWebcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');

    const openFeedDialog = async () => {
        setFeedDialogOpen(true);
        setFeedCopied(false);
        if (!feedToken) {
            try {
                const res = await api.get<{ success: boolean; data: { token: string } }>('/api/calendar/token');
                if (res.success) setFeedToken(res.data.token);
            } catch (err) {
                setError(err instanceof Error ? err.message : t('calendar:errors.icalFetch'));
            }
        }
    };

    const resetFeedToken = async () => {
        if (!confirm(t('calendar:confirmRegen'))) return;
        try {
            const res = await api.post<{ success: boolean; data: { token: string } }>('/api/calendar/token/reset', {});
            if (res.success) {
                setFeedToken(res.data.token);
                setFeedCopied(false);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('calendar:errors.icalRegen'));
        }
    };

    const copyFeedUrl = async () => {
        try {
            await navigator.clipboard.writeText(feedUrl);
            setFeedCopied(true);
            setTimeout(() => setFeedCopied(false), 2000);
        } catch {
            /* clipboard unavailable */
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!formData.start_time) {
            setError(t('calendar:errors.startRequired'));
            return;
        }

        if (
            !formData.is_all_day
            && formData.end_time
            && new Date(formData.end_time).getTime() < new Date(formData.start_time).getTime()
        ) {
            setError(t('calendar:errors.endAfterStart'));
            return;
        }

        // An all-day appointment still stores real times, spanning the day it
        // starts on, so every existing query and the agenda views keep working.
        // Its reminders are cleared: "30 minutes before" means nothing without a
        // start time the user chose.
        const day = formData.start_time.slice(0, 10);
        const payload = formData.is_all_day
            ? {
                ...formData,
                start_time: `${day}T00:00`,
                end_time: `${day}T23:59`,
                reminder_30min: false,
                reminder_1hour: false,
            }
            : formData;

        try {
            if (
                editingAppointment?.is_recurring_occurrence &&
                editingAppointment.occurrence_date
            ) {
                setRecurrenceScopeAction({
                    mode: 'edit',
                    appointment: editingAppointment,
                    payload: { ...payload },
                    returnToEditor: true,
                });
                setDialogOpen(false);
                return;
            }

            if (editingAppointment) {
                await api.put(`/api/appointments/${editingAppointment.id}`, payload);
            } else {
                await api.post('/api/appointments', payload);
            }

            setDialogOpen(false);
            resetForm();
            loadAppointments();
        } catch (error) {
            console.error('Failed to save appointment:', error);
            setError(error instanceof Error ? error.message : t('calendar:errors.save'));
        }
    };

    const handleDelete = async (
        appointment: Appointment,
        returnToEditor = false
    ) => {
        if (
            appointment.is_recurring_occurrence &&
            appointment.occurrence_date
        ) {
            setRecurrenceScopeAction({
                mode: 'delete',
                appointment,
                returnToEditor,
            });

            if (returnToEditor) {
                setDialogOpen(false);
            }

            return;
        }

        if (!confirm(t('calendar:confirmDelete'))) return;

        try {
            await api.delete(`/api/appointments/${appointment.id}`);
            setDialogOpen(false);
            resetForm();
            loadAppointments();
        } catch (error) {
            console.error('Failed to delete appointment:', error);
            setError(error instanceof Error ? error.message : t('calendar:errors.delete'));
        }
    };

    const applyRecurringScope = async (scope: 'this' | 'all') => {
        const action = recurrenceScopeAction;
        if (!action) return;

        const { appointment } = action;

        try {
            if (action.mode === 'delete') {
                if (scope === 'this') {
                    await api.delete(
                        `/api/appointments/${appointment.id}/occurrences/${appointment.occurrence_date}`
                    );
                } else {
                    await api.delete(`/api/appointments/${appointment.id}`);
                }
            } else {
                const payload = { ...(action.payload || {}) };

                if (scope === 'this') {
                    delete payload.recurrence_frequency;
                    delete payload.recurrence_interval;
                    delete payload.recurrence_until;

                    await api.put(
                        `/api/appointments/${appointment.id}/occurrences/${appointment.occurrence_date}`,
                        payload
                    );
                } else {
                    if (
                        payload.start_time &&
                        appointment.series_start_time &&
                        appointment.start_time
                    ) {
                        payload.start_time = shiftSeriesDateTime(
                            appointment.series_start_time,
                            appointment.start_time,
                            payload.start_time
                        );
                    }

                    if (
                        payload.end_time &&
                        appointment.series_end_time &&
                        appointment.end_time
                    ) {
                        payload.end_time = shiftSeriesDateTime(
                            appointment.series_end_time,
                            appointment.end_time,
                            payload.end_time
                        );
                    }

                    await api.put(
                        `/api/appointments/${appointment.id}`,
                        payload
                    );
                }
            }

            setRecurrenceScopeAction(null);
            setDialogOpen(false);
            resetForm();
            await loadAppointments();
        } catch (error) {
            console.error('Recurring appointment scope action failed:', error);
            setError(
                error instanceof Error
                    ? error.message
                    : action.mode === 'delete'
                        ? t('calendar:errors.delete')
                        : t('calendar:errors.save')
            );
        }
    };

    const handleEdit = (appointment: Appointment) => {
        setEditingAppointment(appointment);
        setEndManuallySet(Boolean(appointment.end_time));
        setFormData({
            title: appointment.title,
            description: appointment.description || '',
            start_time: appointment.start_time.slice(0, 16),
            end_time: appointment.end_time
                ? appointment.end_time.slice(0, 16)
                : '',
            location: appointment.location || '',
            family_member_ids: appointment.family_member_ids || [],
            reminder_30min: appointment.reminder_30min,
            reminder_1hour: appointment.reminder_1hour,
            notes: appointment.notes || '',
            color: appointment.color || '#DC4A60',
            is_all_day: Boolean(appointment.is_all_day),
            recurrence_frequency: appointment.recurrence_frequency || 'none',
            recurrence_interval: appointment.recurrence_interval || 1,
            recurrence_until: appointment.recurrence_until
                ? appointment.recurrence_until.slice(0, 10)
                : '',
        });
        setDialogOpen(true);
    };

    const openNewEventForDate = (date: Date) => {
        // Always start from a clean slate: a previously opened edit dialog must
        // not leak its appointment or form values into a new creation.
        resetForm();
        setFormData((prev) => ({
            ...prev,
            start_time: format(date, "yyyy-MM-dd'T'09:00"),
            end_time: format(date, "yyyy-MM-dd'T'10:00"),
        }));
        setDialogOpen(true);
    };

    const handleCalendarDayClick = (date: Date, dayAppointments: Appointment[]) => {
        if (dayAppointments.length === 0) {
            openNewEventForDate(date);
            return;
        }

        setDayAction({
            date,
            appointments: dayAppointments,
            mode: 'choice',
        });
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
            family_member_ids: [],
            reminder_30min: false,
            reminder_1hour: false,
            notes: '',
            color: '#DC4A60',
            is_all_day: false,
            recurrence_frequency: 'none',
            recurrence_interval: 1,
            recurrence_until: '',
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
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const getAppointmentsForDay = (date: Date) => {
        return appointments.filter((apt) => {
            const start = new Date(apt.start_time);
            if (!apt.end_time) return isSameDay(start, date);
            const end = new Date(apt.end_time);
            return start <= endOfDay(date) && end >= startOfDay(date);
        });
    };

    const weekDaysRaw = t('common:daysShort', { returnObjects: true }) as string[];
    const weekDays = [weekDaysRaw[6], ...weekDaysRaw.slice(0, 6)];

    const normalizedSearchQuery = searchQuery.trim().toLowerCase();

    const searchResults = normalizedSearchQuery
        ? allAppointments.filter((apt) => {
            const searchableText = [
                apt.title,
                apt.description,
                apt.location,
                apt.notes,
                ...(apt.family_members_data || []).map((member) => member.name),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return searchableText.includes(normalizedSearchQuery);
        })
        : [];

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">{t('calendar:loading')}</p>
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
                    <h1 className="text-h1 mb-1">{t('calendar:title')}</h1>
                    <p className="text-muted-foreground text-body">{t('calendar:subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={openFeedDialog}>
                        <CalendarPlus className="w-4 h-4 mr-2" />
                        {t('calendar:exportIcal')}
                    </Button>
                    <Button onClick={() => openNewEventForDate(new Date())}>
                        <Plus className="w-4 h-4 mr-2" />
                        {t('calendar:newAppointment')}
                    </Button>
                </div>
            </div>

            {/* Calendar Events Search */}
            <Card>
                <CardContent className="p-4 sm:p-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('calendar:search.placeholder')}
                            className="input-nexus w-full pl-10 pr-10"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                aria-label={t('calendar:search.clear')}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {normalizedSearchQuery && (
                        <div className="mt-4">
                            <p className="mb-3 text-body-sm text-muted-foreground">
                                {t('calendar:search.resultCount', { count: searchResults.length })}
                            </p>

                            {searchResults.length === 0 ? (
                                <p className="rounded-input bg-surface-2 p-4 text-body-sm text-muted-foreground">
                                    {t('calendar:search.noResults')}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {searchResults.map((apt) => (
                                        <button
                                            key={apt.id}
                                            type="button"
                                            onClick={() => handleEdit(apt)}
                                            className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-nexus-background"
                                        >
                                            <span
                                                className="mt-1 h-4 w-4 flex-shrink-0 rounded-full border border-border"
                                                style={{ backgroundColor: apt.color || '#DC4A60' }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="font-semibold text-body">
                                                    {apt.title}
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
                                                    <span>
                                                        {format(new Date(apt.start_time), 'dd MMM yyyy HH:mm', { locale: dateLocale() })}
                                                    </span>
                                                    {apt.location && (
                                                        <span>{apt.location}</span>
                                                    )}
                                                </div>
                                                {apt.description && (
                                                    <p className="mt-1 line-clamp-2 text-body-sm text-muted-foreground">
                                                        {apt.description}
                                                    </p>
                                                )}
                                                {(apt.family_members_data || []).length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {(apt.family_members_data || []).map((member) => (
                                                            <Badge key={member.id} variant="primary">
                                                                {member.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Calendar Header */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-h2 font-semibold capitalize">
                            {format(currentDate, 'MMMM yyyy', { locale: dateLocale() })}
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
                                {t('common:actions.today')}
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
                                    onClick={() => isCurrentMonth && handleCalendarDayClick(day, dayAppointments)}
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
                                                key={apt.occurrence_id || apt.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEdit(apt);
                                                }}
                                                className="text-[10px] p-1 rounded truncate hover:shadow-sm transition-shadow"
                                                style={{
                                                    backgroundColor: `${apt.color || '#DC4A60'}20`,
                                                    borderLeft: `3px solid ${apt.color || '#DC4A60'}`,
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
                                                {t('calendar:moreOthers', { count: dayAppointments.length - 3 })}
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
                    <h3 className="text-h2 font-semibold mb-4">{t('calendar:upcoming.title')}</h3>
                    <div className="space-y-3">
                        {appointments
                            .filter((apt) => new Date(apt.start_time) >= new Date())
                            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                            .slice(0, 5)
                            .map((apt) => (
                                <div
                                    key={apt.occurrence_id || apt.id}
                                    className="flex items-start gap-4 p-4 bg-nexus-background rounded-lg hover:shadow-sm transition-shadow"
                                >
                                    <div
                                        className="w-1 h-full rounded-full"
                                        style={{ backgroundColor: apt.color || '#DC4A60' }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-body mb-1 break-words">{apt.title}</h4>
                                        <div className="flex flex-wrap items-center gap-3 text-body-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <CalendarIcon className="w-4 h-4" />
                                                {format(new Date(apt.start_time), 'dd MMM yyyy', { locale: dateLocale() })}
                                                {apt.end_time && !isSameDay(new Date(apt.start_time), new Date(apt.end_time)) && (
                                                    <span> → {format(new Date(apt.end_time), 'dd MMM yyyy', { locale: dateLocale() })}</span>
                                                )}
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
                                        {(apt.family_members_data || []).length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {(apt.family_members_data || []).map((m) => (
                                                    <Badge key={m.id} variant="primary">
                                                        {m.name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(apt)}>
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => { void handleDelete(apt); }}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        {appointments.filter((apt) => new Date(apt.start_time) >= new Date()).length === 0 && (
                            <p className="text-center text-muted-foreground py-8">
                                {t('calendar:upcoming.empty')}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    // Closing the dialog (Cancel, X, overlay, Escape) must drop any
                    // stale editing state so the next open never reuses it.
                    if (!open) resetForm();
                }}
                title={editingAppointment ? t('calendar:dialog.editTitle') : t('calendar:dialog.createTitle')}
                description={t('calendar:dialog.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label={t('calendar:form.title')}
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        placeholder={t('calendar:form.titlePlaceholder')}
                    />
                    <Textarea
                        label={t('calendar:form.description')}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t('calendar:form.descriptionPlaceholder')}
                        rows={3}
                    />
                    <div>
                        <label className="mb-1.5 block text-label font-medium text-foreground">
                            {t('calendar:form.color')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {APPOINTMENT_COLORS.map(({ name, color }) => (
                                <button
                                    key={color}
                                    type="button"
                                    title={name}
                                    aria-label={name}
                                    onClick={() => setFormData({ ...formData, color })}
                                    className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${
                                        formData.color === color
                                            ? 'border-foreground ring-2 ring-offset-2 ring-foreground/30'
                                            : 'border-border'
                                    }`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="rounded-input border border-border bg-surface-2/40 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-caption font-medium text-foreground">{t('calendar:form.scheduling')}</p>
                            <label className="flex cursor-pointer items-center gap-2 text-caption text-foreground">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-input"
                                    checked={formData.is_all_day}
                                    onChange={(e) => setFormData({ ...formData, is_all_day: e.target.checked })}
                                />
                                {t('calendar:form.allDay')}
                            </label>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <DatePicker
                                label={t('calendar:form.startDate')}
                                value={selectedDate}
                                onChange={handleDateChange}
                            />
                            {/* An all-day appointment spans its whole day, so the times are
                                computed on submit and there is nothing to ask for here. */}
                            {!formData.is_all_day && (
                                <>
                                    <Input
                                        label={t('calendar:form.startTime')}
                                        type="time"
                                        value={selectedStartTime}
                                        onChange={(e) => handleStartTimeChange(e.target.value)}
                                        required
                                    />
                                    <DatePicker
                                        label={t('calendar:form.endDate')}
                                        value={selectedEndDate}
                                        onChange={handleEndDateChange}
                                    />
                                    <Input
                                        label={t('calendar:form.endTime')}
                                        type="time"
                                        value={selectedEndTime}
                                        onChange={(e) => handleEndTimeChange(e.target.value)}
                                    />
                                </>
                            )}
                        </div>
                        <div className={`mt-3 flex-wrap gap-2 ${formData.is_all_day ? 'hidden' : 'flex'}`}>
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

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-label font-medium text-foreground">
                                    {t('calendar:form.repeat')}
                                </label>
                                <Select
                                    value={formData.recurrence_frequency}
                                    onValueChange={(value) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            recurrence_frequency: value as 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly',
                                            recurrence_interval: 1,
                                            recurrence_until: value === 'none' ? '' : prev.recurrence_until,
                                        }))
                                    }
                                    options={[
                                        { value: 'none', label: t('calendar:form.repeatNone') },
                                        { value: 'daily', label: t('calendar:form.repeatDaily') },
                                        { value: 'weekly', label: t('calendar:form.repeatWeekly') },
                                        { value: 'monthly', label: t('calendar:form.repeatMonthly') },
                                        { value: 'yearly', label: t('calendar:form.repeatYearly') },
                                    ]}
                                />
                            </div>

                            {formData.recurrence_frequency !== 'none' && (
                                <>
                                    <div>
                                        <label className="mb-1.5 block text-label font-medium text-foreground">
                                            {t('calendar:form.repeatEvery')}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min={1}
                                                max={365}
                                                value={String(formData.recurrence_interval)}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        recurrence_interval: Math.max(
                                                            1,
                                                            Math.min(365, Number(e.target.value) || 1)
                                                        ),
                                                    }))
                                                }
                                            />
                                            <span className="whitespace-nowrap text-body-sm text-muted-foreground">
                                                {formData.recurrence_frequency === 'daily'
                                                    ? t('calendar:form.repeatDays')
                                                    : formData.recurrence_frequency === 'weekly'
                                                    ? t('calendar:form.repeatWeeks')
                                                    : formData.recurrence_frequency === 'monthly'
                                                    ? t('calendar:form.repeatMonths')
                                                    : t('calendar:form.repeatYears')}
                                            </span>
                                        </div>
                                    </div>

                                    <DatePicker
                                        label={t('calendar:form.repeatUntil')}
                                        min={selectedDate}
                                        value={formData.recurrence_until}
                                        onChange={(value) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                recurrence_until: value,
                                            }))
                                        }
                                    />
                                </>
                            )}
                        </div>
                    </div>
                    <Input
                        label={t('calendar:form.location')}
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder={t('calendar:form.locationPlaceholder')}
                    />
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('calendar:form.members')}
                        </label>
                        {familyMembers.length === 0 ? (
                            <div className="mt-2 flex items-center justify-between rounded-input border border-border bg-surface-2 px-3 py-2">
                                <span className="text-micro text-muted-foreground">
                                    {t('calendar:form.noMembersHint')}
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
                                    {t('calendar:form.goToFamily')}
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2 rounded-input border border-border bg-surface-2/40 p-3">
                                {familyMembers.map((member) => (
                                    <label key={member.id} className="flex items-center gap-2 cursor-pointer hover:bg-nexus-background rounded px-1 py-0.5">
                                        <input
                                            type="checkbox"
                                            checked={formData.family_member_ids.includes(member.id)}
                                            onChange={() => {
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    family_member_ids: prev.family_member_ids.includes(member.id)
                                                        ? prev.family_member_ids.filter((id) => id !== member.id)
                                                        : [...prev.family_member_ids, member.id],
                                                }));
                                            }}
                                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                        />
                                        <div
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: member.color }}
                                        />
                                        <span className="text-body-sm">{member.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Reminders are relative to a start time the user picked, so they
                        have nothing to count down from on an all-day appointment. */}
                    <div className={`space-y-2 ${formData.is_all_day ? 'hidden' : ''}`}>
                        <label className="block text-label font-medium text-foreground">{t('calendar:form.reminders')}</label>
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
                                <span className="text-body-sm">{t('calendar:form.reminder30')}</span>
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
                                <span className="text-body-sm">{t('calendar:form.reminder1h')}</span>
                            </label>
                        </div>
                    </div>
                    <Textarea
                        label={t('calendar:form.notes')}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder={t('calendar:form.notesPlaceholder')}
                        rows={2}
                    />
                    <div className="flex items-center justify-between gap-3 pt-4">
                        <div>
                            {editingAppointment && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => {
                                        void handleDelete(editingAppointment, true);
                                    }}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('common:actions.delete')}
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <Button type="button" variant="secondary" onClick={() => { setDialogOpen(false); resetForm(); }}>
                                {t('common:actions.cancel')}
                            </Button>
                            <Button type="submit">{editingAppointment ? t('common:actions.save') : t('common:actions.create')}</Button>
                        </div>
                    </div>
                </form>
            </Dialog>

            {/* Calendar day Display / Add choice */}
            <Dialog
                open={Boolean(dayAction)}
                onOpenChange={(open) => {
                    if (!open) setDayAction(null);
                }}
                title={
                    dayAction
                        ? format(dayAction.date, 'EEEE, MMMM d, yyyy', { locale: dateLocale() })
                        : ''
                }
                description={
                    dayAction?.mode === 'display'
                        ? t('calendar:dayAction.displayDescription')
                        : t('calendar:dayAction.choiceDescription')
                }
            >
                {dayAction?.mode === 'choice' ? (
                    <div className="space-y-3">
                        <Button
                            type="button"
                            className="w-full"
                            onClick={() =>
                                setDayAction((prev) =>
                                    prev ? { ...prev, mode: 'display' } : prev
                                )
                            }
                        >
                            {t('calendar:dayAction.display')}
                        </Button>

                        <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => {
                                const date = dayAction.date;
                                setDayAction(null);
                                openNewEventForDate(date);
                            }}
                        >
                            {t('calendar:dayAction.add')}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => setDayAction(null)}
                        >
                            {t('common:actions.cancel')}
                        </Button>
                    </div>
                ) : dayAction ? (
                    <div className="space-y-3">
                        {dayAction.appointments
                            .slice()
                            .sort(
                                (a, b) =>
                                    new Date(a.start_time).getTime() -
                                    new Date(b.start_time).getTime()
                            )
                            .map((apt) => (
                                <button
                                    key={apt.occurrence_id || apt.id}
                                    type="button"
                                    onClick={() => {
                                        setDayAction(null);
                                        handleEdit(apt);
                                    }}
                                    className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-nexus-background"
                                >
                                    <span
                                        className="mt-1 h-4 w-4 flex-shrink-0 rounded-full border border-border"
                                        style={{ backgroundColor: apt.color || '#DC4A60' }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-body">
                                            {apt.title}
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
                                            <span>
                                                {format(new Date(apt.start_time), 'HH:mm')}
                                                {apt.end_time &&
                                                    ` - ${format(new Date(apt.end_time), 'HH:mm')}`}
                                            </span>
                                            {apt.location && <span>{apt.location}</span>}
                                        </div>
                                        {apt.description && (
                                            <p className="mt-1 line-clamp-2 text-body-sm text-muted-foreground">
                                                {apt.description}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            ))}

                        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                            <Button
                                type="button"
                                className="flex-1"
                                onClick={() => {
                                    const date = dayAction.date;
                                    setDayAction(null);
                                    openNewEventForDate(date);
                                }}
                            >
                                {t('calendar:dayAction.add')}
                            </Button>

                            <Button
                                type="button"
                                variant="secondary"
                                className="flex-1"
                                onClick={() =>
                                    setDayAction((prev) =>
                                        prev ? { ...prev, mode: 'choice' } : prev
                                    )
                                }
                            >
                                {t('calendar:dayAction.back')}
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Dialog>

            {/* Recurring appointment scope choice */}
            <Dialog
                open={Boolean(recurrenceScopeAction)}
                onOpenChange={(open) => {
                    if (!open && recurrenceScopeAction) {
                        const returnToEditor = recurrenceScopeAction.returnToEditor;
                        setRecurrenceScopeAction(null);

                        if (returnToEditor) {
                            setDialogOpen(true);
                        }
                    }
                }}
                title={
                    recurrenceScopeAction?.mode === 'delete'
                        ? t('calendar:recurrenceScope.deleteTitle')
                        : t('calendar:recurrenceScope.editTitle')
                }
                description={
                    recurrenceScopeAction?.mode === 'delete'
                        ? t('calendar:recurrenceScope.deleteDescription')
                        : t('calendar:recurrenceScope.editDescription')
                }
            >
                <div className="space-y-3">
                    <Button
                        type="button"
                        className="w-full"
                        onClick={() => { void applyRecurringScope('this'); }}
                    >
                        {t('calendar:recurrenceScope.thisOccurrence')}
                    </Button>

                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={() => { void applyRecurringScope('all'); }}
                    >
                        {t('calendar:recurrenceScope.allOccurrences')}
                    </Button>

                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                            const returnToEditor =
                                recurrenceScopeAction?.returnToEditor || false;

                            setRecurrenceScopeAction(null);

                            if (returnToEditor) {
                                setDialogOpen(true);
                            }
                        }}
                    >
                        {t('common:actions.cancel')}
                    </Button>
                </div>
            </Dialog>

            {/* Dialog export iCal */}
            <Dialog
                open={feedDialogOpen}
                onOpenChange={setFeedDialogOpen}
                title={t('calendar:feed.title')}
                description={t('calendar:feed.description')}
            >
                <div className="space-y-4">
                    {!feedToken ? (
                        <p className="text-body-sm text-muted-foreground py-4 text-center">{t('calendar:feed.generating')}</p>
                    ) : (
                        <>
                            <div>
                                <label className="block text-label font-medium text-foreground mb-1">{t('calendar:feed.subscribeLink')}</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={feedUrl}
                                        onFocus={(e) => e.target.select()}
                                        className="flex-1 min-w-0 px-3 py-2 rounded-input border border-border bg-surface-1 text-caption text-foreground"
                                    />
                                    <Button variant="secondary" size="sm" onClick={copyFeedUrl}>
                                        {feedCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <a href={feedWebcalUrl}>
                                    <Button variant="secondary" size="sm">
                                        <CalendarPlus className="h-4 w-4 mr-2" />
                                        {t('calendar:feed.subscribeApple')}
                                    </Button>
                                </a>
                                <a href={feedUrl} download="openfamily.ics">
                                    <Button variant="secondary" size="sm">
                                        {t('calendar:feed.downloadIcs')}
                                    </Button>
                                </a>
                            </div>

                            <p className="text-caption text-muted-foreground">
                                {t('calendar:feed.privateNote')}
                            </p>

                            <div className="flex justify-end pt-2 border-t border-border">
                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={resetFeedToken}>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    {t('calendar:feed.regenerate')}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Dialog>
        </div>
    );
};

export default Calendar;
