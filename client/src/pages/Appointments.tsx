import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAddButton } from '@/contexts/AddButtonContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { logger } from '../lib/logger';
import { Trash2, Plus, MapPin, Clock, Briefcase, Plane, CalendarDays } from 'lucide-react';
import { fr } from 'date-fns/locale';
import { scheduleAppointmentNotification } from '@/lib/webPush';
import { getDayOfWeek, getDayOfMonth } from '@/lib/recurrence';
import { WorkSchedule } from '@/types';
import { nanoid } from 'nanoid';
import WeeklyCalendar from '@/components/WeeklyCalendar';

const getTypeLabels = (t: any) => [
  { value: 'doctor' as const, label: t.appointments.types.doctor, color: '#d97b7b' },
  { value: 'school' as const, label: t.appointments.types.school, color: '#6b8e7f' },
  { value: 'work' as const, label: t.appointments.types.work, color: '#c8dfe8' },
  { value: 'personal' as const, label: t.appointments.types.personal, color: '#f0d4a8' },
  { value: 'other' as const, label: t.appointments.types.other, color: '#e8e6e3' },
];

const getDaysOfWeek = (t: any) => [
  { value: 1, label: t.appointments.daysOfWeek.monday, short: t.appointments.daysShort.mon },
  { value: 2, label: t.appointments.daysOfWeek.tuesday, short: t.appointments.daysShort.tue },
  { value: 3, label: t.appointments.daysOfWeek.wednesday, short: t.appointments.daysShort.wed },
  { value: 4, label: t.appointments.daysOfWeek.thursday, short: t.appointments.daysShort.thu },
  { value: 5, label: t.appointments.daysOfWeek.friday, short: t.appointments.daysShort.fri },
  { value: 6, label: t.appointments.daysOfWeek.saturday, short: t.appointments.daysShort.sat },
  { value: 0, label: t.appointments.daysOfWeek.sunday, short: t.appointments.daysShort.sun },
];

export default function Appointments() {
  const { t } = useLanguage();
  const { appointments, tasks, familyMembers, addAppointment, updateAppointment, deleteAppointment, updateFamilyMember } = useApp();
  const { setAddAction } = useAddButton();
  const { settings: notificationSettings, getEnabledAppointmentTimings } = useNotificationSettings();
  
  const TYPES = getTypeLabels(t);
  const DAYS_OF_WEEK = getDaysOfWeek(t);
  
  const [showForm, setShowForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [showWorkScheduleForm, setShowWorkScheduleForm] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [activeTab, setActiveTab] = useState<'appointments' | 'workSchedule'>('appointments');
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    duration: 60,
    location: '',
    type: 'doctor' as const,
    reminder: 'none' as const,
    recurring: false,
    frequency: 'weekly' as const,
  });

  const [workScheduleData, setWorkScheduleData] = useState<WorkSchedule>({
    workDays: [1, 2, 3, 4, 5], // Lundi à Vendredi par défaut
    defaultStartTime: '08:00',
    defaultEndTime: '16:00',
    vacations: [],
    offDays: [],
  });

  const [vacationForm, setVacationForm] = useState({
    startDate: '',
    endDate: '',
    description: '',
  });

  useEffect(() => {
    setAddAction(() => setShowForm(true));
    return () => setAddAction(null);
  }, [setAddAction]);

  const handleAddAppointment = () => {
    if (formData.title.trim()) {
      const recurringConfig = formData.recurring ? {
        frequency: formData.frequency,
        dayOfWeek: formData.frequency === 'weekly' ? getDayOfWeek(formData.date) : undefined,
        dayOfMonth: formData.frequency === 'monthly' ? getDayOfMonth(formData.date) : undefined,
      } : undefined;

      const appointmentData = {
        title: formData.title,
        description: formData.description,
        date: formData.date,
        time: formData.time,
        duration: formData.duration,
        location: formData.location,
        type: formData.type,
        reminder: formData.reminder,
        recurring: recurringConfig,
      };

      if (editingAppointment) {
        // Modifier un rendez-vous existant
        updateAppointment(editingAppointment.id, appointmentData);
      } else {
        // Créer un nouveau rendez-vous
        const newId = nanoid();
        const newAppointment = { ...appointmentData, id: newId, createdAt: new Date().toISOString() };
        addAppointment(appointmentData);
        
        // Planifier notifications Web Push si activées
        logger.log('🔔 Vérification notifications...', {
          enabled: notificationSettings.appointmentReminders.enabled,
          timings: notificationSettings.appointmentReminders.timings
        });
        
        if (notificationSettings.appointmentReminders.enabled) {
          const enabledTimings = getEnabledAppointmentTimings();
          logger.log('🔔 Délais activés:', enabledTimings);
          
          if (enabledTimings.length > 0) {
            logger.log('🔔 Programmation notifications pour RDV:', {
              id: newId,
              date: formData.date,
              time: formData.time,
              title: formData.title,
              timings: enabledTimings
            });
            
            scheduleAppointmentNotification(
              newId,
              formData.date,
              formData.time,
              formData.title,
              enabledTimings.map(t => ({ minutes: t.minutes, label: t.label }))
            ).then(() => {
              logger.log('✅ Notifications programmées avec succès');
            }).catch(err => {
              logger.error('❌ Erreur programmation notification:', err);
            });
          } else {
            logger.warn('⚠️ Aucun délai de notification activé');
          }
        } else {
          logger.warn('⚠️ Notifications désactivées dans les paramètres');
        }
      }
      
      setFormData({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        time: '10:00',
        duration: 60,
        location: '',
        type: 'doctor',
        reminder: 'none',
        recurring: false,
        frequency: 'weekly',
      });
      setEditingAppointment(null);
      setShowForm(false);
    }
  };

  const sortedAppointments = [...appointments].sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA.getTime() - dateB.getTime();
  });

  const getTypeColor = (type: string) => {
    return TYPES.find(t => t.value === type)?.color || '#e8e6e3';
  };

  const getTypeLabel = (type: string) => {
    return TYPES.find(t => t.value === type)?.label || type;
  };

  const isUpcoming = (date: string, time: string) => {
    return new Date(`${date}T${time}`) > new Date();
  };

  const formatDateTime = (date: string, time: string) => {
    const dt = new Date(`${date}T${time}`);
    return {
      date: dt.toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: time,
    };
  };

  // Générer les dates des tâches récurrentes pour le mois en cours
  const generateRecurringTaskDates = (task: any) => {
    if (!task.recurring) return [new Date(task.dueDate)];
    
    const dates: Date[] = [];
    const startDate = new Date(task.dueDate);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    let currentDate = new Date(startDate);
    
    while (currentDate <= monthEnd) {
      if (currentDate >= monthStart && currentDate >= startDate) {
        dates.push(new Date(currentDate));
      }
      
      switch (task.recurring.frequency) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + 1);
          break;
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
        case 'yearly':
          currentDate.setFullYear(currentDate.getFullYear() + 1);
          break;
      }
      
      // Éviter les boucles infinies
      if (dates.length > 100) break;
    }
    
    return dates;
  };

  // Obtenir toutes les dates avec rendez-vous (seulement pour la vue mensuelle)
  const appointmentDates = viewMode === 'monthly' ? appointments.map(apt => {
    // Créer la date en spécifiant explicitement le fuseau local
    const [year, month, day] = apt.date.split('-').map(Number);
    return new Date(year, month - 1, day); // month - 1 car les mois JS sont 0-indexés
  }) : [];
  
  // Obtenir les événements pour une date spécifique (seulement les rendez-vous)
  const getEventsForDate = (date: Date) => {
    // Utiliser le même formatage que pour les dates créées localement
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const dayAppointments = appointments.filter(apt => apt.date === dateStr);
    
    return { appointments: dayAppointments };
  };
  
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : { appointments: [] };

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground mb-4">{t.appointments.title}</h1>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-3">
          <Button
            variant={activeTab === 'appointments' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('appointments')}
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            {t.appointments.appointments}
          </Button>
          <Button
            variant={activeTab === 'workSchedule' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('workSchedule')}
          >
            <Briefcase className="w-4 h-4 mr-2" />
            {t.appointments.workSchedule}
          </Button>
        </div>

        {activeTab === 'appointments' && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'weekly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('weekly')}
              >
                <CalendarDays className="w-4 h-4 mr-1" />
                {t.appointments.week}
              </Button>
              <Button
                variant={viewMode === 'monthly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('monthly')}
              >
                <CalendarDays className="w-4 h-4 mr-1" />
                {t.appointments.month}
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              {t.appointments.add}
            </Button>
          </div>
        )}
      </div>

      {activeTab === 'appointments' && (
        <div key={`appointments-${viewMode}`}>
          {/* Vue hebdomadaire */}
          {viewMode === 'weekly' && (
            <div key="weekly-view" className="p-4">
              <WeeklyCalendar 
                appointments={appointments} 
                onAppointmentClick={(appointment) => {
                  // Ouvrir le formulaire de modification avec les données du rendez-vous
                  setFormData({
                    title: appointment.title,
                    description: appointment.description || '',
                    date: appointment.date,
                    time: appointment.time,
                    duration: appointment.duration || 60,
                    location: appointment.location || '',
                    type: appointment.type,
                    reminder: appointment.reminder || 'none',
                    recurring: !!appointment.recurring,
                    frequency: appointment.recurring?.frequency || 'weekly',
                  });
                  setEditingAppointment(appointment);
                  setShowForm(true);
                }}
                onAppointmentDelete={(appointmentId) => {
                  deleteAppointment(appointmentId);
                }}
              />
            </div>
          )}

          {/* Vue mensuelle - Calendrier du mois en cours */}
          {viewMode === 'monthly' && (
            <div key="monthly-view" className="p-4">
              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-3">{t.appointments.calendarTitle}</h2>
                <div className="flex justify-center overflow-x-auto">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    locale={fr}
                    modifiers={{
                      hasAppointment: appointmentDates,
                    }}
                    modifiersClassNames={{
                      hasAppointment: "bg-primary/30 font-bold text-primary-foreground border-primary/50 border-2",
                    }}
                    className="rounded-md border max-w-full [--cell-size:2.5rem] sm:[--cell-size:3rem] text-sm sm:text-base"
                    style={{ display: viewMode === 'monthly' ? 'block' : 'none' }}
                  />
                </div>
                
                {/* Légende */}
                <div className="flex gap-4 justify-center mt-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-primary/20 border border-primary/40"></div>
                    <span>{t.appointments.legend}</span>
                  </div>
                </div>
                
                {/* Liste des rendez-vous du mois */}
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-3">{t.appointments.monthAppointments}</h3>
                  {appointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t.appointments.noAppointments}</p>
                  ) : (
                    <div className="space-y-2">
                      {appointments
                        .sort((a, b) => {
                          const dateCompare = a.date.localeCompare(b.date);
                          if (dateCompare !== 0) return dateCompare;
                          return a.time.localeCompare(b.time);
                        })
                        .map((apt) => {
                          const aptDate = new Date(`${apt.date}T${apt.time}`);
                          const isUpcoming = aptDate > new Date();
                          const isToday = apt.date === new Date().toISOString().split('T')[0];
                          
                          return (
                            <div
                              key={apt.id}
                              className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                isToday ? 'border-primary bg-primary/10' : 
                                !isUpcoming ? 'opacity-90 bg-muted/30' : 'bg-background hover:bg-muted/50'
                              }`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: getTypeColor(apt.type) }}
                                  />
                                  <div>
                                    <div className="font-medium">{apt.title}</div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                                      <span>
                                        {new Date(apt.date).toLocaleDateString('fr-FR', { 
                                          weekday: 'short', 
                                          day: 'numeric', 
                                          month: 'short' 
                                        })} à {apt.time}
                                      </span>
                                      {apt.duration && <span>• {apt.duration}min</span>}
                                      {apt.location && (
                                        <span className="flex items-center gap-1">
                                          <MapPin className="w-3 h-3" />
                                          {apt.location}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setFormData({
                                      title: apt.title,
                                      description: apt.description || '',
                                      date: apt.date,
                                      time: apt.time,
                                      duration: apt.duration || 60,
                                      location: apt.location || '',
                                      type: apt.type,
                                      reminder: apt.reminder || 'none',
                                      recurring: !!apt.recurring,
                                      frequency: apt.recurring?.frequency || 'weekly',
                                    });
                                    setEditingAppointment(apt);
                                    setShowForm(true);
                                  }}
                                  className="text-sm text-primary hover:text-primary/80 font-medium"
                                >
                                  {t.appointments.edit}
                                </button>
                                <button
                                  onClick={() => deleteAppointment(apt.id)}
                                  className="text-sm text-destructive hover:text-destructive/80 font-medium"
                                >
                                  {t.appointments.delete}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">{t.appointments.addAppointment}</h2>

            <div>
              <label className="text-sm font-medium text-foreground">{t.appointments.form.title}</label>
              <Input
                placeholder={t.appointments.form.titlePlaceholder}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.appointments.form.description}</label>
              <Input
                placeholder={t.appointments.form.descriptionPlaceholder}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.appointments.form.date}</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">{t.appointments.form.time}</label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.appointments.form.duration}</label>
                <Input
                  type="number"
                  min="15"
                  step="15"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 60 })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">{t.appointments.form.type}</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  {TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.appointments.form.location}</label>
              <Input
                placeholder={t.appointments.form.locationPlaceholder}
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.appointments.form.reminder}</label>
              <select
                value={formData.reminder}
                onChange={(e) => setFormData({ ...formData, reminder: e.target.value as any })}
                className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="none">{t.appointments.reminders.none}</option>
                <option value="15min">{t.appointments.reminders["15min"]}</option>
                <option value="30min">{t.appointments.reminders["30min"]}</option>
                <option value="1hour">{t.appointments.reminders["1hour"]}</option>
                <option value="1day">{t.appointments.reminders["1day"]}</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="recurring"
                checked={formData.recurring}
                onChange={(e) => setFormData({ ...formData, recurring: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="recurring" className="text-sm font-medium text-foreground">
                {t.appointments.form.recurring}
              </label>
            </div>

            {formData.recurring && (
              <div>
                <label className="text-sm font-medium text-foreground">{t.appointments.form.frequency}</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="daily">{t.appointments.frequencies.daily}</option>
                  <option value="weekly">{t.appointments.frequencies.weekly}</option>
                  <option value="monthly">{t.appointments.frequencies.monthly}</option>
                  <option value="yearly">{t.appointments.frequencies.yearly}</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.frequency === 'weekly' && 
                    `${t.appointments.recurringHints.weekly} ${new Date(formData.date).toLocaleDateString('fr-FR', { weekday: 'long' })}`}
                  {formData.frequency === 'monthly' && 
                    t.appointments.recurringHints.monthly.replace('{day}', new Date(formData.date).getDate().toString())}
                  {formData.frequency === 'yearly' && 
                    `${t.appointments.recurringHints.yearly} ${new Date(formData.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
                  {formData.frequency === 'daily' && 
                    t.appointments.recurringHints.daily}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                {t.cancel}
              </Button>
              <Button
                onClick={handleAddAppointment}
                className="flex-1"
              >
                {t.appointments.add}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Section Emplois du temps */}
      {activeTab === 'workSchedule' && (
        <div className="p-4 space-y-4">
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">{t.appointments.workScheduleConfig}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t.appointments.workScheduleDescription}
            </p>

            <div className="space-y-3">
              {familyMembers.map(member => (
                <Card
                  key={member.id}
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setSelectedMember(member.id);
                    if (member.workSchedule) {
                      setWorkScheduleData(member.workSchedule);
                    } else {
                      setWorkScheduleData({
                        workDays: [1, 2, 3, 4, 5],
                        defaultStartTime: '08:00',
                        defaultEndTime: '16:00',
                        vacations: [],
                        offDays: [],
                      });
                    }
                    setShowWorkScheduleForm(true);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full"
                        style={{ backgroundColor: member.color || '#6b8e7f' }}
                      />
                      <div>
                        <h3 className="font-medium">{member.name}</h3>
                        {member.workSchedule ? (
                          <p className="text-xs text-muted-foreground">
                            {member.workSchedule.workDays.length} {t.appointments.daysCount} • {member.workSchedule.defaultStartTime} - {member.workSchedule.defaultEndTime}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t.appointments.noWorkSchedule}</p>
                        )}
                      </div>
                    </div>
                    <Briefcase className="w-5 h-5 text-muted-foreground" />
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Formulaire emploi du temps */}
      {showWorkScheduleForm && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">
              {t.appointments.workScheduleFor} {familyMembers.find(m => m.id === selectedMember)?.name}
            </h2>

            {/* Jours de travail */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">{t.appointments.workDays}</label>
              <div className="grid grid-cols-4 gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <Button
                    key={day.value}
                    variant={workScheduleData.workDays.includes(day.value) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const newWorkDays = workScheduleData.workDays.includes(day.value)
                        ? workScheduleData.workDays.filter(d => d !== day.value)
                        : [...workScheduleData.workDays, day.value];
                      setWorkScheduleData({ ...workScheduleData, workDays: newWorkDays });
                    }}
                    className="text-xs"
                  >
                    {day.short}
                  </Button>
                ))}
              </div>
            </div>

            {/* Horaires par défaut */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.appointments.startTime}</label>
                <Input
                  type="time"
                  value={workScheduleData.defaultStartTime}
                  onChange={(e) => setWorkScheduleData({ ...workScheduleData, defaultStartTime: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t.appointments.endTime}</label>
                <Input
                  type="time"
                  value={workScheduleData.defaultEndTime}
                  onChange={(e) => setWorkScheduleData({ ...workScheduleData, defaultEndTime: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Vacances */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-foreground">{t.appointments.vacations}</label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setVacationForm({ startDate: '', endDate: '', description: '' })}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t.appointments.addVacation}
                </Button>
              </div>

              {workScheduleData.vacations && workScheduleData.vacations.length > 0 && (
                <div className="space-y-2 mb-3">
                  {workScheduleData.vacations.map(vacation => (
                    <div key={vacation.id} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div className="flex items-center gap-2">
                        <Plane className="w-4 h-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">
                            {new Date(vacation.startDate).toLocaleDateString('fr-FR')} - {new Date(vacation.endDate).toLocaleDateString('fr-FR')}
                          </p>
                          {vacation.description && <p className="text-xs text-muted-foreground">{vacation.description}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const newVacations = workScheduleData.vacations?.filter(v => v.id !== vacation.id) || [];
                          setWorkScheduleData({ ...workScheduleData, vacations: newVacations });
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {vacationForm.startDate !== '' && (
                <Card className="p-3 space-y-3 bg-muted/50">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium">{t.appointments.vacationStart}</label>
                      <Input
                        type="date"
                        value={vacationForm.startDate}
                        onChange={(e) => setVacationForm({ ...vacationForm, startDate: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">{t.appointments.vacationEnd}</label>
                      <Input
                        type="date"
                        value={vacationForm.endDate}
                        onChange={(e) => setVacationForm({ ...vacationForm, endDate: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium">{t.appointments.vacationDescription}</label>
                    <Input
                      placeholder={t.appointments.vacationPlaceholder}
                      value={vacationForm.description}
                      onChange={(e) => setVacationForm({ ...vacationForm, description: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setVacationForm({ startDate: '', endDate: '', description: '' })}
                      className="flex-1"
                    >
                      {t.cancel}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (vacationForm.startDate && vacationForm.endDate) {
                          const newVacation = {
                            id: nanoid(),
                            startDate: vacationForm.startDate,
                            endDate: vacationForm.endDate,
                            description: vacationForm.description,
                          };
                          const newVacations = [...(workScheduleData.vacations || []), newVacation];
                          setWorkScheduleData({ ...workScheduleData, vacations: newVacations });
                          setVacationForm({ startDate: '', endDate: '', description: '' });
                        }
                      }}
                      className="flex-1"
                    >
                      {t.appointments.add}
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowWorkScheduleForm(false);
                  setSelectedMember(null);
                }}
                className="flex-1"
              >
                {t.cancel}
              </Button>
              <Button
                onClick={() => {
                  updateFamilyMember(selectedMember, { workSchedule: workScheduleData });
                  setShowWorkScheduleForm(false);
                  setSelectedMember(null);
                }}
                className="flex-1"
              >
                {t.save}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
