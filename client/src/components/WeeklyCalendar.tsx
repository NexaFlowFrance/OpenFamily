import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, Clock, MapPin } from 'lucide-react';
import { Appointment } from '@/types';
import { generateAppointmentOccurrences } from '@/lib/recurrence';

interface WeeklyCalendarProps {
  appointments: Appointment[];
  onAppointmentClick?: (appointment: Appointment) => void;
  onAppointmentDelete?: (appointmentId: string) => void;
}

export default function WeeklyCalendar({ appointments, onAppointmentClick, onAppointmentDelete }: WeeklyCalendarProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Lundi = début de semaine
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const hours = Array.from({ length: 15 }, (_, i) => i + 6); // 6h à 20h

  // Generate 7 days of the week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(currentWeekStart.getDate() + i);
    return date;
  });

  // Navigation entre les semaines
  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(currentWeekStart.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeekStart(newDate);
  };

  const goToCurrentWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const isCurrentWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return currentWeekStart.getTime() === monday.getTime();
  };

  // Obtenir tous les rendez-vous de la semaine
  const getWeekAppointments = () => {
    const weekStart = new Date(currentWeekStart);
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const appointmentsByDay: { [key: string]: Array<{ appointment: Appointment; time: string }> } = {};

    appointments.forEach(appointment => {
      const occurrences = generateAppointmentOccurrences(appointment, weekStart, weekEnd);
      
      occurrences.forEach(occ => {
        if (!appointmentsByDay[occ.date]) {
          appointmentsByDay[occ.date] = [];
        }
        appointmentsByDay[occ.date].push({
          appointment,
          time: occ.time,
        });
      });
    });

    return appointmentsByDay;
  };

  const appointmentsByDay = getWeekAppointments();

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'doctor': return '#d97b7b';
      case 'school': return '#6b8e7f';
      case 'work': return '#c8dfe8';
      case 'personal': return '#f0d4a8';
      default: return '#e8e6e3';
    }
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'doctor': return 'Médecin';
      case 'school': return 'École';
      case 'work': return 'Travail';
      case 'personal': return 'Personnel';
      default: return 'Autre';
    }
  };

  // Détecter les chevauchements d'horaires
  const getAppointmentLayout = (apt: { appointment: Appointment; time: string }, dayAppointments: Array<{ appointment: Appointment; time: string }>) => {
    const timeParts = apt.time.split(':');
    const aptStart = parseInt(timeParts[0] || '0') * 60 + parseInt(timeParts[1] || '0');
    const aptEnd = aptStart + (apt.appointment.duration || 60);
    
    const overlapping = dayAppointments.filter(other => {
      const otherTimeParts = other.time.split(':');
      const otherStart = parseInt(otherTimeParts[0] || '0') * 60 + parseInt(otherTimeParts[1] || '0');
      const otherEnd = otherStart + (other.appointment.duration || 60);
      return aptStart < otherEnd && aptEnd > otherStart;
    });
    
    if (overlapping.length <= 1) {
      return { column: 0, totalColumns: 1 };
    }
    
    overlapping.sort((a, b) => a.time.localeCompare(b.time));
    const column = overlapping.findIndex(o => o.appointment.id === apt.appointment.id && o.time === apt.time);
    return { column, totalColumns: overlapping.length };
  };

  const formatWeekRange = () => {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    
    return `${currentWeekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} - ${weekEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  };

  return (
    <Card className="p-4">
      {/* En-tête avec navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">
            {formatWeekRange()}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek('prev')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          {!isCurrentWeek() && (
            <Button
              variant="outline"
              size="sm"
              onClick={goToCurrentWeek}
            >
              Cette semaine
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek('next')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Vue hebdomadaire */}
      <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div style={{ minWidth: '100%', width: 'max-content' }} className="min-w-[700px] sm:min-w-[800px] lg:min-w-[900px]">
          {/* En-têtes des jours */}
          <div className="flex border-b border-border mb-2">
            <div className="w-10 sm:w-12 flex-shrink-0 p-1 sm:p-2"></div>
            {weekDays.map((day, index) => {
              // Utiliser le même formatage cohérent que dans le reste du calendrier
              const dayYear = day.getFullYear();
              const dayMonth = (day.getMonth() + 1).toString().padStart(2, '0');
              const dayDate = day.getDate().toString().padStart(2, '0');
              const dayStr = `${dayYear}-${dayMonth}-${dayDate}`;
              
              const today = new Date();
              const todayYear = today.getFullYear();
              const todayMonth = (today.getMonth() + 1).toString().padStart(2, '0');
              const todayDay = today.getDate().toString().padStart(2, '0');
              const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
              
              const isToday = dayStr === todayStr;
              return (
                <div
                  key={index}
                  className={`flex-1 min-w-[95px] sm:min-w-[105px] p-1 sm:p-2 text-center ${
                    isToday ? 'bg-primary/10 font-bold' : ''
                  }`}
                >
                  <div className="text-xs sm:text-sm font-medium">
                    {day.toLocaleDateString('fr-FR', { weekday: 'short' })}
                  </div>
                  <div className={`text-[10px] sm:text-xs ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grille horaire */}
          <div className="space-y-0">
            {hours.map(hour => (
              <div
                key={hour}
                className="flex border-b border-border last:border-b-0"
                style={{ minHeight: '50px' }}
              >
                {/* Colonne heure */}
                <div className="w-10 sm:w-12 flex-shrink-0 p-1 sm:p-2 text-[10px] sm:text-xs font-medium text-muted-foreground">
                  {hour.toString().padStart(2, '0')}h
                </div>

                {/* Colonnes jours */}
                {weekDays.map((day, dayIndex) => {
                  // Utiliser le même formatage que dans le calendrier mensuel pour éviter les décalages
                  const year = day.getFullYear();
                  const month = (day.getMonth() + 1).toString().padStart(2, '0');
                  const dayOfMonth = day.getDate().toString().padStart(2, '0');
                  const dateStr = `${year}-${month}-${dayOfMonth}`;
                  
                  const dayAppointments = appointmentsByDay[dateStr] || [];
                  
                  // Calculer si c'est aujourd'hui avec le même format
                  const today = new Date();
                  const todayYear = today.getFullYear();
                  const todayMonth = (today.getMonth() + 1).toString().padStart(2, '0');
                  const todayDay = today.getDate().toString().padStart(2, '0');
                  const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
                  const isToday = dateStr === todayStr;

                  return (
                    <div
                      key={dayIndex}
                      className={`flex-1 min-w-[95px] sm:min-w-[105px] relative border-l border-border ${
                        isToday ? 'bg-primary/5' : ''
                      }`}
                    >
                      {/* Rendez-vous à cette heure */}
                      {dayAppointments
                        .filter(apt => {
                          const timeParts = apt.time.split(':');
                          const aptHour = parseInt(timeParts[0] || '0');
                          const aptMinutes = parseInt(timeParts[1] || '0');
                          const aptStartHour = aptHour + aptMinutes / 60;
                          const aptEndHour = aptStartHour + (apt.appointment.duration || 60) / 60;
                          return hour >= aptStartHour && hour < aptEndHour;
                        })
                        .map((apt, index) => {
                          const timeParts = apt.time.split(':');
                          const aptHour = parseInt(timeParts[0] || '0');
                          if (aptHour !== hour) return null; // Afficher uniquement dans la première heure

                          const { column, totalColumns } = getAppointmentLayout(apt, dayAppointments);
                          const columnWidth = 100 / totalColumns;

                          return (
                            <div
                              key={`${apt.appointment.id}-${index}`}
                              onClick={() => onAppointmentClick?.(apt.appointment)}
                              className="absolute p-1 rounded-md shadow-sm border-l-4 cursor-pointer hover:shadow-md transition-shadow"
                              style={{
                                backgroundColor: getTypeColor(apt.appointment.type) + '20',
                                borderLeftColor: getTypeColor(apt.appointment.type),
                                top: `${(parseInt(timeParts[1] || '0') / 60) * 50}px`,
                                height: `${Math.min(((apt.appointment.duration || 60) / 60) * 50, 50 - (parseInt(timeParts[1] || '0') / 60) * 50)}px`,
                                left: `${column * columnWidth}%`,
                                width: `${columnWidth - 1}%`,
                                zIndex: 1,
                              }}
                            >
                              <div className="text-[10px] sm:text-xs font-medium truncate">
                                {apt.appointment.title}
                              </div>
                              <div className="text-[8px] sm:text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                <Clock className="w-2 h-2" />
                                {apt.time}
                              </div>
                              {apt.appointment.location && (
                                <div className="text-[8px] sm:text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                  <MapPin className="w-2 h-2" />
                                  {apt.appointment.location}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Liste des rendez-vous de la semaine */}
      <div className="mt-4 space-y-3">
        <h3 className="text-lg font-semibold">Rendez-vous de la semaine</h3>
        {Object.values(appointmentsByDay).flat().length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun rendez-vous cette semaine</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(appointmentsByDay)
              .flatMap(([date, apts]) => 
                apts.map(apt => ({ ...apt, date }))
              )
              .sort((a, b) => {
                const dateCompare = a.date.localeCompare(b.date);
                if (dateCompare !== 0) return dateCompare;
                return a.time.localeCompare(b.time);
              })
              .map((apt, index) => {
                // Create date avoiding timezone issues
                const [year, month, day] = apt.date.split('-').map(Number);
                const aptDate = new Date(year, month - 1, day);
                const isUpcoming = new Date(`${apt.date}T${apt.time}`) > new Date();
                
                return (
                  <div
                    key={`${apt.appointment.id}-${index}`}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      !isUpcoming ? 'opacity-90 bg-muted/30' : 'bg-background'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getTypeColor(apt.appointment.type) }}
                        />
                        <div>
                          <div className="font-medium">{apt.appointment.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {aptDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à {apt.time}
                            {apt.appointment.duration && ` • ${apt.appointment.duration}min`}
                            {apt.appointment.location && ` • ${apt.appointment.location}`}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onAppointmentClick?.(apt.appointment)}
                        className="text-sm text-primary hover:text-primary/80 font-medium"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => onAppointmentDelete?.(apt.appointment.id)}
                        className="text-sm text-destructive hover:text-destructive/80 font-medium"
                      >
                        Supprimer
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
  );
}
