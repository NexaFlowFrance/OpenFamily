// Gestion des subscriptions Web Push
import { logger } from './logger';
const VAPID_PUBLIC_KEY = 'BKwpdHIzJUphggpc46Pk5oso5SjruMjWiqM5z9ae0lxCnFrbSGihQ5azEWcVhDtiiuqUfsZiJXDHDm857ZyeIeQ';

// Convertir la clé VAPID publique en Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Enregistrer le service worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    logger.warn('Service Worker non supporté');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    logger.log('Service Worker enregistré:', registration);
    return registration;
  } catch (error) {
    logger.error('Erreur lors de l\'enregistrement du Service Worker:', error);
    return null;
  }
}

// Check if push notifications are supported
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Demander la permission pour les notifications
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    logger.warn('Notifications non supportées');
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
}

// S'abonner aux notifications push
export async function subscribeToPush(userId: string): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    logger.warn('Push non supporté');
    return null;
  }

  try {
    // S'assurer qu'un service worker est enregistré
    await registerServiceWorker();
    const registration = await navigator.serviceWorker.ready;

    // Check permissions
    const permissionGranted = await requestNotificationPermission();
    if (!permissionGranted) {
      throw new Error('Permission de notification refusée');
    }

    // Get or create subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource
      });
    }

    // Envoyer la subscription au backend
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        familyId: 'family-default', // À remplacer par un vrai système d'auth
        subscription: subscription.toJSON()
      })
    });

    logger.log('Subscription push enregistrée:', subscription);
    return subscription;
  } catch (error) {
    logger.error('Erreur lors de la subscription push:', error);
    return null;
  }
}

// Se désabonner des notifications push
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      
      // Informer le backend
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId })
      });

      logger.log('Désabonnement push réussi');
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Erreur lors du désabonnement push:', error);
    return false;
  }
}

// Obtenir le statut de la subscription
export async function getPushSubscriptionStatus(): Promise<{
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}> {
  const supported = isPushSupported();
  const permission = Notification.permission;
  let subscribed = false;

  if (supported) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      subscribed = !!subscription;
    } catch (error) {
      logger.error('Erreur lors de la vérification de la subscription:', error);
    }
  }

  return { supported, permission, subscribed };
}

// Enregistrer un rendez-vous pour notification
export async function scheduleAppointmentNotification(
  appointmentId: string,
  appointmentDate: string,
  appointmentTime: string,
  title: string,
  timings: Array<{ minutes: number; label: string }>
): Promise<void> {
  try {
    // Pour l'instant, on utilise un family ID par défaut
    // À remplacer par un vrai système d'authentification
    const familyId = 'family-default';
    
    await fetch('/api/push/schedule-appointment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appointmentId,
        appointmentDate,
        appointmentTime,
        title,
        timings,
        familyId
      })
    });
    logger.log('Notifications de rendez-vous programmées');
  } catch (error) {
    logger.error('Erreur lors de la programmation des notifications:', error);
  }
}
