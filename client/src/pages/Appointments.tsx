import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Trash2, Plus, MapPin, Clock, Briefcase, Plane } from 'lucide-react';
import { fr } from 'date-fns/locale';
import { scheduleAppointmentNotification } from '@/lib/notifications';
import { getDayOfWeek, getDayOfMonth } from '@/lib/recurrence';
import { WorkSchedule } from '@/types';
import { nanoid } from 'nanoid';

const TYPES = [
  { value: 'doctor', label: 'Médecin', color: '#d97b7b' },
  { value: 'school', label: 'École', color: '#6b8e7f' },
  { value: 'work', label: 'Travail', color: '#c8dfe8' },
  { value: 'personal', label: 'Personnel', color: '#f0d4a8' },
  { value: 'other', label: 'Autre', color: '#e8e6e3' },
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lundi', short: 'Lun' },
  { value: 2, label: 'Mardi', short: 'Mar' },
  { value: 3, label: 'Mercredi', short: 'Mer' },
  { value: 4, label: 'Jeudi', short: 'Jeu' },
  { value: 5, label: 'Vendredi', short: 'Ven' },
  { value: 6, label: 'Samedi', short: 'Sam' },
  { value: 0, label: 'Dimanche', short: 'Dim' },
];

export default function Appointments() {
  const { appointments, tasks, familyMembers, addAppointment, updateAppointment, deleteAppointment, updateFamilyMember } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [showWorkScheduleForm, setShowWorkScheduleForm] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [activeTab, setActiveTab] = useState<'appointments' | 'workSchedule'>('appointments');
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

  const handleAddAppointment = () => {
    if (formData.title.trim()) {
      const recurringConfig = formData.recurring ? {
        frequency: formData.frequency,
        dayOfWeek: formData.frequency === 'weekly' ? getDayOfWeek(formData.date) : undefined,
        dayOfMonth: formData.frequency === 'monthly' ? getDayOfMonth(formData.date) : undefined,
      } : undefined;

      const newAppointment = {
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
      addAppointment(newAppointment);
      
      // Planifier notification si permissions accordées
      const appointmentWithId = { ...newAppointment, id: '', createdAt: '' };
      scheduleAppointmentNotification(appointmentWithId);
      
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

  // Obtenir toutes les dates avec rendez-vous
  const appointmentDates = appointments.map(apt => new Date(apt.date));
  
  // Obtenir toutes les dates avec tâches (y compris récurrentes)
  const taskDates = tasks.flatMap(task => generateRecurringTaskDates(task));
  
  // Obtenir les événements pour une date spécifique
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const dayAppointments = appointments.filter(apt => apt.date === dateStr);
    const dayTasks = tasks.filter(task => {
      if (!task.recurring) {
        return task.dueDate === dateStr;
      }
      const recurringDates = generateRecurringTaskDates(task);
      return recurringDates.some(d => d.toISOString().split('T')[0] === dateStr);
    });
    
    return { appointments: dayAppointments, tasks: dayTasks };
  };
  
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : { appointments: [], tasks: [] };

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground mb-4">Rendez-vous & Emplois du temps</h1>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-3">
          <Button
            variant={activeTab === 'appointments' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('appointments')}
          >
            Rendez-vous
          </Button>
          <Button
            variant={activeTab === 'workSchedule' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('workSchedule')}
          >
            <Briefcase className="w-4 h-4 mr-2" />
            Emplois du temps
          </Button>
        </div>

        {activeTab === 'appointments' && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {sortedAppointments.filter(a => isUpcoming(a.date, a.time)).length} rendez-vous à venir
            </div>
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </Button>
          </div>
        )}
      </div>

      {activeTab === 'appointments' && (
        <>
          {/* Calendrier du mois en cours */}
          <div className="p-4">{/* Existing calendar code */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-3">Calendrier global - Rendez-vous & Tâches</h2>
          <div className="flex justify-center overflow-x-auto">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={fr}
              modifiers={{
                hasAppointment: appointmentDates,
                hasTask: taskDates,
              }}
              modifiersClassNames={{
                hasAppointment: "bg-primary/20 font-bold",
                hasTask: "bg-secondary/30 font-semibold",
              }}
              className="rounded-md border max-w-full [--cell-size:2.5rem] sm:[--cell-size:3rem] text-sm sm:text-base"
            />
          </div>
          
          {/* Légende */}
          <div className="flex gap-4 justify-center mt-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-primary/20 border border-primary/40"></div>
              <span>Rendez-vous</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-secondary/30 border border-secondary/50"></div>
              <span>Tâches</span>
            </div>
          </div>
          
          {/* Événements du jour sélectionné */}
          {selectedDate && (selectedDateEvents.appointments.length > 0 || selectedDateEvents.tasks.length > 0) && (
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="font-semibold mb-3">
                Événements du {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              
              {selectedDateEvents.appointments.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Rendez-vous</h4>
                  <div className="space-y-2">
                    {selectedDateEvents.appointments.map(apt => (
                      <div key={apt.id} className="text-sm p-2 rounded bg-primary/5 border border-primary/20">
                        <div className="font-medium">{apt.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3" />
                          <span>{apt.time}</span>
                          {apt.location && (
                            <>
                              <MapPin className="w-3 h-3 ml-2" />
                              <span>{apt.location}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedDateEvents.tasks.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Tâches</h4>
                  <div className="space-y-2">
                    {selectedDateEvents.tasks.map(task => (
                      <div key={task.id} className="text-sm p-2 rounded bg-secondary/5 border border-secondary/20">
                        <div className="font-medium">{task.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Priorité: {task.priority === 'high' ? 'Haute' : task.priority === 'medium' ? 'Moyenne' : 'Basse'}
                          {task.recurring && ' • Récurrente'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="p-4 space-y-3">
        {sortedAppointments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Aucun rendez-vous prévu</p>
          </div>
        ) : (
          sortedAppointments.map(apt => {
            const dt = formatDateTime(apt.date, apt.time);
            const upcoming = isUpcoming(apt.date, apt.time);

            return (
              <Card
                key={apt.id}
                className={`p-4 transition-all ${!upcoming ? 'opacity-60 bg-muted' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: getTypeColor(apt.type) }}
                  >
                    {apt.date.split('-')[2]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium ${!upcoming ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {apt.title}
                    </h3>

                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        style={{ backgroundColor: getTypeColor(apt.type) + '40' }}
                        className="text-xs"
                      >
                        {getTypeLabel(apt.type)}
                      </Badge>
                    </div>

                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{dt.date} à {dt.time}</span>
                      </div>
                      {apt.duration && (
                        <span>Durée: {apt.duration} min</span>
                      )}
                    </div>

                    {apt.location && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>{apt.location}</span>
                      </div>
                    )}

                    {apt.description && (
                      <p className="text-xs text-muted-foreground mt-2">{apt.description}</p>
                    )}

                    {apt.reminder !== 'none' && (
                      <div className="text-xs text-primary mt-2">
                        🔔 Rappel: {apt.reminder}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => deleteAppointment(apt.id)}
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Ajouter un rendez-vous</h2>

            <div>
              <label className="text-sm font-medium text-foreground">Titre</label>
              <Input
                placeholder="Ex: Visite pédiatre"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Input
                placeholder="Détails optionnels"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Date</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Heure</label>
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
                <label className="text-sm font-medium text-foreground">Durée (min)</label>
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
                <label className="text-sm font-medium text-foreground">Type</label>
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
              <label className="text-sm font-medium text-foreground">Lieu</label>
              <Input
                placeholder="Adresse ou lieu du rendez-vous"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Rappel</label>
              <select
                value={formData.reminder}
                onChange={(e) => setFormData({ ...formData, reminder: e.target.value as any })}
                className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="none">Aucun</option>
                <option value="15min">15 minutes avant</option>
                <option value="30min">30 minutes avant</option>
                <option value="1hour">1 heure avant</option>
                <option value="1day">1 jour avant</option>
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
                Rendez-vous récurrent
              </label>
            </div>

            {formData.recurring && (
              <div>
                <label className="text-sm font-medium text-foreground">Fréquence</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="daily">Quotidienne</option>
                  <option value="weekly">Hebdomadaire</option>
                  <option value="monthly">Mensuelle</option>
                  <option value="yearly">Annuelle</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.frequency === 'weekly' && 
                    `Se répétera tous les ${new Date(formData.date).toLocaleDateString('fr-FR', { weekday: 'long' })}`}
                  {formData.frequency === 'monthly' && 
                    `Se répétera tous les ${new Date(formData.date).getDate()} de chaque mois`}
                  {formData.frequency === 'yearly' && 
                    `Se répétera chaque année le ${new Date(formData.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
                  {formData.frequency === 'daily' && 
                    `Se répétera tous les jours`}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={handleAddAppointment}
                className="flex-1"
              >
                Ajouter
              </Button>
            </div>
          </Card>
        </div>
      )}
        </>
      )}

      {/* Section Emplois du temps */}
      {activeTab === 'workSchedule' && (
        <div className="p-4 space-y-4">
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">Configuration des emplois du temps</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Configurez les jours et horaires de travail pour chaque membre de la famille
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
                            {member.workSchedule.workDays.length} jour(s) • {member.workSchedule.defaultStartTime} - {member.workSchedule.defaultEndTime}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Aucun emploi du temps configuré</p>
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
              Emploi du temps - {familyMembers.find(m => m.id === selectedMember)?.name}
            </h2>

            {/* Jours de travail */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Jours de travail</label>
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
                <label className="text-sm font-medium text-foreground">Heure de début</label>
                <Input
                  type="time"
                  value={workScheduleData.defaultStartTime}
                  onChange={(e) => setWorkScheduleData({ ...workScheduleData, defaultStartTime: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Heure de fin</label>
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
                <label className="text-sm font-medium text-foreground">Périodes de vacances</label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setVacationForm({ startDate: '', endDate: '', description: '' })}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter
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
                      <label className="text-xs font-medium">Date de début</label>
                      <Input
                        type="date"
                        value={vacationForm.startDate}
                        onChange={(e) => setVacationForm({ ...vacationForm, startDate: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Date de fin</label>
                      <Input
                        type="date"
                        value={vacationForm.endDate}
                        onChange={(e) => setVacationForm({ ...vacationForm, endDate: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Description (optionnel)</label>
                    <Input
                      placeholder="Ex: Vacances d'été"
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
                      Annuler
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
                      Ajouter
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
                Annuler
              </Button>
              <Button
                onClick={() => {
                  updateFamilyMember(selectedMember, { workSchedule: workScheduleData });
                  setShowWorkScheduleForm(false);
                  setSelectedMember(null);
                }}
                className="flex-1"
              >
                Enregistrer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
