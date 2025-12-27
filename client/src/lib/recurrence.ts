// Bibliothèque de gestion des récurrences
import { Task, Appointment } from '@/types';

// Noms des jours en français (dimanche = 0)
export const JOURS_SEMAINE = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi'
];

// Générer toutes les occurrences d'une tâche récurrente sur une période
export function generateTaskOccurrences(
  task: Task,
  startDate: Date,
  endDate: Date
): Array<{ date: string; time?: string }> {
  if (!task.recurring) {
    return [{ date: task.dueDate, time: task.dueTime }];
  }

  const occurrences: Array<{ date: string; time?: string }> = [];
  const baseDate = new Date(task.dueDate);
  const recurEnd = task.recurring.endDate ? new Date(task.recurring.endDate) : endDate;
  
  let currentDate = new Date(baseDate);

  while (currentDate <= recurEnd && currentDate <= endDate) {
    if (currentDate >= startDate) {
      occurrences.push({
        date: currentDate.toISOString().split('T')[0],
        time: task.dueTime
      });
    }

    switch (task.recurring.frequency) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + 1);
        break;

      case 'weekly':
        // Pour hebdomadaire, on garde le même jour de la semaine
        if (task.recurring.dayOfWeek !== undefined) {
          // Trouver le prochain jour de la semaine spécifié
          const targetDay = task.recurring.dayOfWeek;
          const currentDay = currentDate.getDay();
          let daysToAdd = targetDay - currentDay;
          if (daysToAdd <= 0) daysToAdd += 7;
          currentDate.setDate(currentDate.getDate() + daysToAdd);
        } else {
          // Par défaut, +7 jours
          currentDate.setDate(currentDate.getDate() + 7);
        }
        break;

      case 'monthly':
        // Pour mensuel, on garde le même jour du mois
        if (task.recurring.dayOfMonth !== undefined) {
          const targetDay = task.recurring.dayOfMonth;
          currentDate.setMonth(currentDate.getMonth() + 1);
          // Gérer les mois avec moins de jours (ex: 31 février -> 28/29)
          const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
          currentDate.setDate(Math.min(targetDay, daysInMonth));
        } else {
          // Par défaut, garder le jour initial
          const dayOfMonth = baseDate.getDate();
          currentDate.setMonth(currentDate.getMonth() + 1);
          const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
          currentDate.setDate(Math.min(dayOfMonth, daysInMonth));
        }
        break;

      case 'yearly':
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
    }
  }

  return occurrences;
}

// Générer toutes les occurrences d'un rendez-vous récurrent sur une période
export function generateAppointmentOccurrences(
  appointment: Appointment,
  startDate: Date,
  endDate: Date
): Array<{ date: string; time: string }> {
  if (!appointment.recurring) {
    return [{ date: appointment.date, time: appointment.time }];
  }

  const occurrences: Array<{ date: string; time: string }> = [];
  const baseDate = new Date(appointment.date);
  const recurEnd = appointment.recurring.endDate ? new Date(appointment.recurring.endDate) : endDate;
  
  let currentDate = new Date(baseDate);

  while (currentDate <= recurEnd && currentDate <= endDate) {
    if (currentDate >= startDate) {
      occurrences.push({
        date: currentDate.toISOString().split('T')[0],
        time: appointment.time
      });
    }

    switch (appointment.recurring.frequency) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + 1);
        break;

      case 'weekly':
        // Pour hebdomadaire, on garde le même jour de la semaine
        if (appointment.recurring.dayOfWeek !== undefined) {
          const targetDay = appointment.recurring.dayOfWeek;
          const currentDay = currentDate.getDay();
          let daysToAdd = targetDay - currentDay;
          if (daysToAdd <= 0) daysToAdd += 7;
          currentDate.setDate(currentDate.getDate() + daysToAdd);
        } else {
          currentDate.setDate(currentDate.getDate() + 7);
        }
        break;

      case 'monthly':
        // Pour mensuel, on garde le même jour du mois
        if (appointment.recurring.dayOfMonth !== undefined) {
          const targetDay = appointment.recurring.dayOfMonth;
          currentDate.setMonth(currentDate.getMonth() + 1);
          const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
          currentDate.setDate(Math.min(targetDay, daysInMonth));
        } else {
          const dayOfMonth = baseDate.getDate();
          currentDate.setMonth(currentDate.getMonth() + 1);
          const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
          currentDate.setDate(Math.min(dayOfMonth, daysInMonth));
        }
        break;

      case 'yearly':
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
    }
  }

  return occurrences;
}

// Obtenir le jour de la semaine d'une date (0=dimanche, 1=lundi, etc.)
export function getDayOfWeek(dateString: string): number {
  return new Date(dateString).getDay();
}

// Obtenir le jour du mois d'une date (1-31)
export function getDayOfMonth(dateString: string): number {
  return new Date(dateString).getDate();
}

// Obtenir le nom du jour de la semaine en français
export function getDayName(dayOfWeek: number): string {
  return JOURS_SEMAINE[dayOfWeek];
}

// Formater une date en français
export function formatDateFr(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Formater une date courte en français
export function formatDateShortFr(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}
