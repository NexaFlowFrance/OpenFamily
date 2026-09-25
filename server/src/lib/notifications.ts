import { query } from '../db';
import { sendPushToUser } from './pushService';
import { broadcast } from './broadcaster';
import logger from './logger';

export interface CreateNotificationInput {
    /** Recipient user ID (the actual account, not necessarily the family owner) */
    userId: string;
    title: string;
    message: string;
    type: string;
    relatedId?: string | null;
    /** Path the push notification should open (defaults to '/') */
    url?: string;
}

export type NotificationLanguage = 'fr' | 'en' | 'pt' | 'ru' | 'es' | 'zh';
export type LocalizedTexts = Record<NotificationLanguage, { title: string; message: string }>;

/**
 * Same as createNotification, with the title and message picked in the
 * recipient's own language (French when unset or unknown), so a member who
 * reads the app in Spanish is not notified in French.
 */
export async function createLocalizedNotification(
    input: Omit<CreateNotificationInput, 'title' | 'message'> & { texts: LocalizedTexts }
): Promise<void> {
    let lang: NotificationLanguage = 'fr';
    try {
        const result = await query('SELECT language FROM users WHERE id = $1', [input.userId]);
        const saved = String(result.rows[0]?.language ?? '').toLowerCase().split(/[-_]/)[0];
        if (saved in input.texts) lang = saved as NotificationLanguage;
    } catch {
        // Fall back to French; delivery matters more than the language.
    }
    const { texts, ...rest } = input;
    await createNotification({ ...rest, ...texts[lang] });
}

/**
 * Persist an in-app notification, broadcast a WebSocket refresh and send a web-push
 * message (best effort). Never throws — notification delivery must not break the
 * originating request.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
    try {
        await query(
            `INSERT INTO notifications (user_id, title, message, type, related_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [input.userId, input.title, input.message, input.type, input.relatedId ?? null]
        );

        broadcast(input.userId, { type: 'update', entity: 'notifications', action: 'created' });

        await sendPushToUser(input.userId, {
            title: input.title,
            body: input.message,
            url: input.url ?? '/',
            tag: input.type,
        });
    } catch (err) {
        logger.warn('notification.create_failed', {
            type: input.type,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
