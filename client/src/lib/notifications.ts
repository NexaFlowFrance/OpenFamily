import { Appointment, Task } from '@/types';

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('Ce navigateur ne supporte pas les notifications');
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

export const scheduleAppointmentNotification = (appointment: Appointment) => {
  if (Notification.permission !== 'granted') {
    return;
  }

  const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}`);
  const now = new Date();
  const timeDiff = appointmentDateTime.getTime() - now.getTime();

  // Notification 30 minutes avant
  const notifyTime = timeDiff - 30 * 60 * 1000;

  if (notifyTime > 0) {
    setTimeout(() => {
      new Notification('Rappel de rendez-vous', {
        body: `${appointment.title} dans 30 minutes`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: appointment.id,
        requireInteraction: true,
      });
    }, notifyTime);
  }

  // Notification à l'heure exacte
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

  const taskDateTime = new Date(`${task.dueDate}T${task.dueTime}`);
  const now = new Date();
  const timeDiff = taskDateTime.getTime() - now.getTime();

  // Ne pas planifier si la tâche est dans le passé
  if (timeDiff <= 0) {
    return;
  }

  // Notification 15 minutes avant
  const notifyTime = timeDiff - 15 * 60 * 1000;

  if (notifyTime > 0) {
    setTimeout(() => {
      new Notification('Rappel de tâche', {
        body: `${task.title} dans 15 minutes`,
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
