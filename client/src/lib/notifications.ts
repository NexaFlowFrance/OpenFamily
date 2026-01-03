import { Appointment, Task, NotificationSettings } from '@/types';
import { logger } from './logger';

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    logger.warn('Ce navigateur ne supporte pas les notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

const getNotificationSettings = (): NotificationSettings => {
  try {
    const saved = localStorage.getItem('openfamily-notification-settings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    logger.warn('Erreur lors du chargement des paramètres de notification:', error);
  }
  
  // Valeurs par défaut
  return {
    appointmentReminders: {
      enabled: false,
      timings: [
        { id: 'day', label: '1 jour avant', minutes: 24 * 60, enabled: false },
        { id: 'hours2', label: '2 heures avant', minutes: 2 * 60, enabled: false },
        { id: 'hour1', label: '1 heure avant', minutes: 60, enabled: false },
        { id: 'min30', label: '30 minutes avant', minutes: 30, enabled: true },
        { id: 'min15', label: '15 minutes avant', minutes: 15, enabled: false },
      ],
    },
    taskReminders: {
      enabled: false,
      defaultTiming: 15,
    },
  };
};

export const scheduleAppointmentNotification = (appointment: Appointment) => {
  if (Notification.permission !== 'granted') {
    return;
  }

  const settings = getNotificationSettings();
  
  if (!settings.appointmentReminders.enabled) {
    return;
  }

  const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}`);
  const now = new Date();
  const timeDiff = appointmentDateTime.getTime() - now.getTime();

  // Programmer les notifications pour chaque délai activé
  const enabledTimings = settings.appointmentReminders.timings.filter(timing => timing.enabled);
  
  enabledTimings.forEach(timing => {
    const notifyTime = timeDiff - timing.minutes * 60 * 1000;
    
    if (notifyTime > 0) {
      setTimeout(() => {
        const timeLabel = timing.minutes >= 1440 
          ? `${timing.minutes / 1440} jour(s)`
          : timing.minutes >= 60
          ? `${timing.minutes / 60}h${timing.minutes % 60 > 0 ? timing.minutes % 60 + 'min' : ''}`
          : `${timing.minutes} min`;
          
        new Notification('Rappel de rendez-vous', {
          body: `${appointment.title} dans ${timeLabel}`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `${appointment.id}-${timing.id}`,
          requireInteraction: timing.minutes <= 30,
        });
      }, notifyTime);
    }
  });

  // Notification à l'heure exacte si le rendez-vous est dans le futur
  if (timeDiff > 0) {
    setTimeout(() => {
      new Notification('Rendez-vous maintenant !', {
        body: appointment.title,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `${appointment.id}-now`,
        requireInteraction: true,
      });
    }, timeDiff);
  }
};

export const scheduleTaskNotification = (task: Task) => {
  if (Notification.permission !== 'granted') {
    return;
  }

  if (!task.dueDate || !task.dueTime) {
    return;
  }

  const settings = getNotificationSettings();
  
  if (!settings.taskReminders.enabled) {
    return;
  }

  const taskDateTime = new Date(`${task.dueDate}T${task.dueTime}`);
  const now = new Date();
  const timeDiff = taskDateTime.getTime() - now.getTime();

  // Ne pas planifier si la tâche est dans le passé
  if (timeDiff <= 0) {
    return;
  }

  // Notification avant échéance selon les préférences
  const notifyTime = timeDiff - settings.taskReminders.defaultTiming * 60 * 1000;

  if (notifyTime > 0) {
    setTimeout(() => {
      new Notification('Rappel de tâche', {
        body: `${task.title} dans ${settings.taskReminders.defaultTiming} minutes`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: task.id,
        requireInteraction: false,
      });
    }, notifyTime);
  }

  // Notification à l'heure exacte
  setTimeout(() => {
    new Notification('Tâche à faire maintenant !', {
      body: task.title,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `${task.id}-now`,
      requireInteraction: true,
    });
  }, timeDiff);
};

export const getNotificationStatus = (): 'granted' | 'denied' | 'default' | 'unsupported' => {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
};
