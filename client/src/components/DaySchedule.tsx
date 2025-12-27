// Composant d'affichage du calendrier journalier avec vue heure par heure
import { Task, Appointment } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { generateTaskOccurrences, generateAppointmentOccurrences, formatDateShortFr } from '@/lib/recurrence';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DayScheduleProps {
  tasks: Task[];
  appointments: Appointment[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

interface ScheduleItem {
  id: string;
  title: string;
  time: string;
  duration: number;
  type: 'task' | 'appointment';
  color: string;
  category?: string;
  location?: string;
  completed?: boolean;
}

export default function DaySchedule({ tasks, appointments, selectedDate, onDateChange }: DayScheduleProps) {
  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6h à 23h

  // Obtenir tous les items du jour sélectionné
  const getItemsForDay = (): ScheduleItem[] => {
    const items: ScheduleItem[] = [];
    const dateStr = selectedDate.toISOString().split('T')[0];
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Ajouter les rendez-vous
    appointments.forEach(appointment => {
      const occurrences = generateAppointmentOccurrences(appointment, dayStart, dayEnd);
      occurrences.forEach(occ => {
        if (occ.date === dateStr) {
          items.push({
            id: appointment.id,
            title: appointment.title,
            time: occ.time,
            duration: appointment.duration || 60,
            type: 'appointment',
            color: getAppointmentColor(appointment.type),
            location: appointment.location,
          });
        }
      });
    });

    // Ajouter les tâches avec heure
    tasks.forEach(task => {
      if (!task.dueTime) return; // Ignorer les tâches sans heure
      
      const occurrences = generateTaskOccurrences(task, dayStart, dayEnd);
      occurrences.forEach(occ => {
        if (occ.date === dateStr && occ.time) {
          items.push({
            id: task.id,
            title: task.title,
            time: occ.time,
            duration: task.duration || 30,
            type: 'task',
            color: getTaskColor(task.category),
            category: task.category,
            completed: task.completed,
          });
        }
      });
    });

    // Trier par heure
    return items.sort((a, b) => a.time.localeCompare(b.time));
  };

  const getAppointmentColor = (type: string): string => {
    switch (type) {
      case 'doctor': return '#d97b7b';
      case 'school': return '#6b8e7f';
      case 'work': return '#c8dfe8';
      case 'personal': return '#f0d4a8';
      default: return '#e8e6e3';
    }
  };

  const getTaskColor = (category: string): string => {
    switch (category) {
      case 'household': return '#6b8e7f';
      case 'baby': return '#f0d4a8';
      case 'personal': return '#c8dfe8';
      default: return '#e8e6e3';
    }
  };

  // Calculer la position et hauteur d'un item dans la grille horaire
  const getItemPosition = (time: string, duration: number) => {
    const [hours, minutes] = time.split(':').map(Number);
    const startHour = hours + minutes / 60;
    const topOffset = ((startHour - 6) * 60) + 'px'; // 60px par heure
    const height = (duration / 60) * 60 + 'px';
    
    return { top: topOffset, height };
  };

  const scheduleItems = getItemsForDay();

  const navigateDay = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    onDateChange(newDate);
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  const isToday = selectedDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

  return (
    <Card className="p-4 mb-4">
      {/* En-tête avec navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">
            {selectedDate.toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateDay('prev')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
            >
              Aujourd'hui
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateDay('next')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Vue heure par heure */}
      <div className="relative">
        {/* Grille des heures */}
        <div className="space-y-0 border border-border rounded-lg overflow-hidden">
          {hours.map(hour => (
            <div
              key={hour}
              className="flex border-b border-border last:border-b-0"
              style={{ minHeight: '60px' }}
            >
              {/* Colonne heure */}
              <div className="w-16 flex-shrink-0 p-2 bg-muted/50 font-medium text-sm text-muted-foreground border-r border-border">
                {hour.toString().padStart(2, '0')}:00
              </div>
              
              {/* Colonne contenu */}
              <div className="flex-1 relative p-2">
                {/* Items à cette heure */}
                {scheduleItems
                  .filter(item => {
                    const itemHour = parseInt(item.time.split(':')[0]);
                    const itemMinutes = parseInt(item.time.split(':')[1]);
                    const itemStartHour = itemHour + itemMinutes / 60;
                    const itemEndHour = itemStartHour + item.duration / 60;
                    return hour >= itemStartHour && hour < itemEndHour;
                  })
                  .map((item, index) => {
                    const itemHour = parseInt(item.time.split(':')[0]);
                    if (itemHour !== hour) return null; // Afficher uniquement dans la première heure
                    
                    return (
                      <div
                        key={`${item.id}-${index}`}
                        className={`absolute left-2 right-2 p-2 rounded-md shadow-sm border-l-4 ${
                          item.completed ? 'opacity-60' : ''
                        }`}
                        style={{
                          backgroundColor: item.color + '20',
                          borderLeftColor: item.color,
                          top: `${(parseInt(item.time.split(':')[1]) / 60) * 60}px`,
                          height: `${Math.min((item.duration / 60) * 60, 60 - (parseInt(item.time.split(':')[1]) / 60) * 60)}px`,
                          zIndex: 10,
                        }}
                      >
                        <div className="text-sm font-medium truncate">
                          {item.time} - {item.title}
                        </div>
                        {item.location && (
                          <div className="text-xs text-muted-foreground truncate">
                            📍 {item.location}
                          </div>
                        )}
                        <Badge
                          variant="secondary"
                          className="text-xs mt-1"
                          style={{ backgroundColor: item.color + '40' }}
                        >
                          {item.type === 'appointment' ? 'RDV' : 'Tâche'}
                        </Badge>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {/* Résumé en bas */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{scheduleItems.length}</span> événement(s) planifié(s) ce jour
          </div>
          {scheduleItems.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Aucun événement programmé pour cette journée
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
