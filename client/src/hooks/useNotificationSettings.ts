import { useState, useEffect } from 'react';
import { logger } from '../lib/logger';
import type { NotificationSettings } from '@/types';
import { 
  registerServiceWorker, 
  subscribeToPush, 
  unsubscribeFromPush, 
  getPushSubscriptionStatus 
} from '@/lib/webPush';

// Helper function to get translated timing labels
export const getNotificationTimings = (t: any) => [
  { id: 'day', label: t.settings.notificationTimings.day, minutes: 24 * 60, enabled: false },
  { id: 'hours2', label: t.settings.notificationTimings.hours2, minutes: 2 * 60, enabled: false },
  { id: 'hour1', label: t.settings.notificationTimings.hour1, minutes: 60, enabled: false },
  { id: 'min30', label: t.settings.notificationTimings.min30, minutes: 30, enabled: true },
  { id: 'min15', label: t.settings.notificationTimings.min15, minutes: 15, enabled: false },
];

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
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
    defaultTiming: 15, // 15 minutes avant par défaut
  },
};

const STORAGE_KEY = 'openfamily-notification-settings';

export const useNotificationSettings = () => {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialiser le service worker au démarrage
    registerServiceWorker().then(() => {
      setIsInitialized(true);
    });

    // Load saved preferences
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed });
      }
    } catch (error) {
      logger.warn('Erreur lors du chargement des paramètres de notification:', error);
    }
  }, []);

  const updateSettings = (newSettings: Partial<NotificationSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      logger.warn('Erreur lors de la sauvegarde des paramètres de notification:', error);
    }
  };

  const toggleAppointmentReminders = async (enabled: boolean, userId?: string) => {
    if (enabled && userId) {
      // S'abonner aux notifications push
      const subscription = await subscribeToPush(userId);
      if (!subscription) {
        logger.error('Impossible de s\'abonner aux notifications push');
        return;
      }
    } else if (!enabled && userId) {
      // Se désabonner
      await unsubscribeFromPush(userId);
    }

    updateSettings({
      appointmentReminders: {
        ...settings.appointmentReminders,
        enabled,
      },
    });
  };

  const toggleAppointmentTiming = (timingId: string, enabled: boolean) => {
    const updatedTimings = settings.appointmentReminders.timings.map(timing =>
      timing.id === timingId ? { ...timing, enabled } : timing
    );

    updateSettings({
      appointmentReminders: {
        ...settings.appointmentReminders,
        timings: updatedTimings,
      },
    });
  };

  const getEnabledAppointmentTimings = () => {
    return settings.appointmentReminders.timings.filter(timing => timing.enabled);
  };

  return {
    settings,
    updateSettings,
    toggleAppointmentReminders,
    toggleAppointmentTiming,
    getEnabledAppointmentTimings,
    isInitialized,
  };
};