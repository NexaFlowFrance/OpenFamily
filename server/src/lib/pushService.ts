import webpush from 'web-push';
import { query } from '../db';
import logger from './logger';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? '';
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@openfamily.local';

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
    logger.warn('push.vapid_not_configured', {
        hint: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in .env',
    });
}

export { vapidPublicKey };

export interface PushPayload {
    title: string;
    body: string;
    url?: string;
    tag?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!vapidPublicKey || !vapidPrivateKey) return;

    const { rows } = await query(
        'SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1',
        [userId]
    );
    const subs = rows as Array<{ endpoint: string; keys: { auth: string; p256dh: string } }>;

    if (subs.length === 0) return;

    const payloadStr = JSON.stringify(payload);

    await Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh } },
                    payloadStr
                );
            } catch (err: unknown) {
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 410 || status === 404) {
                    // Subscription expired or invalid — remove it
                    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
                    logger.info('push.subscription_removed', { endpoint: sub.endpoint.slice(0, 40) });
                } else {
                    logger.warn('push.send_failed', {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        })
    );
}
