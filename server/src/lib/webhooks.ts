import crypto from 'node:crypto';
import { query } from '../db';
import { onBroadcast, WsAction, WsUpdatePayload } from './broadcaster';
import { decryptCredentials, encryptCredentials } from '../utils/crypto';
import { assertSafeIntegrationUrl, UnsafeUrlError } from '../utils/urlGuard';
import logger from './logger';

/**
 * Outgoing webhooks: when something changes in a family, OpenFamily tells the
 * addresses a parent registered in Settings (Home Assistant, n8n, Node-RED, a
 * script), so that they need not ask over and over.
 *
 * A call says what kind of thing changed, never the thing itself: "the
 * shopping list changed", like the real-time channel of the apps. The
 * receiver then reads what it needs through the API, with its own token.
 * That keeps a family's data out of requests sent to an address that may have
 * changed hands, and the calls small enough to be merged when changes come in
 * a burst.
 *
 * Each call is signed with the webhook's own secret, so the receiver can tell
 * it really comes from this server. The address is kept encrypted, like the
 * secret: a Home Assistant webhook address is a password in itself.
 */

/** What a webhook can be told about: the family's data, not an account's inbox. */
export const WEBHOOK_ENTITIES = [
    'shopping', 'tasks', 'appointments', 'meal-plans', 'planning', 'recipes',
    'notes', 'posts', 'family', 'budget', 'rewards',
] as const;
export type WebhookEntity = typeof WEBHOOK_ENTITIES[number];

export const WEBHOOK_MAX_PER_FAMILY = 10;
export const WEBHOOK_MAX_NAME_LENGTH = 80;
export const WEBHOOK_MAX_URL_LENGTH = 2000;
/** A webhook that failed this many times in a row is switched off, and says so in Settings. */
export const WEBHOOK_MAX_FAILURES = 20;
export const WEBHOOK_TEST_EVENT = 'webhook.test';

const TIMEOUT_MS = 5000;
// Changes of the same kind within this time are told once.
let coalesceMs = 1000;

export const isWebhookEntity = (value: unknown): value is WebhookEntity =>
    (WEBHOOK_ENTITIES as readonly unknown[]).includes(value);

export const generateWebhookSecret = (): string => `whsec_${crypto.randomBytes(32).toString('base64url')}`;

/** The signature a receiver checks: HMAC-SHA256 of the exact body, with the webhook's secret. */
export const signWebhookBody = (secret: string, body: string): string =>
    `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

/** The address and the secret, as the database keeps them. */
export const sealWebhookTarget = (url: string, secret: string): string => encryptCredentials({ url, secret });

/** The entities a webhook asked for; an empty list means all of them. */
export const parseWebhookEvents = (raw: unknown): WebhookEntity[] => {
    try {
        const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed.filter(isWebhookEntity) : [];
    } catch {
        return [];
    }
};

export interface WebhookDelivery {
    ok: boolean;
    /** The HTTP status of the answer; 0 when there was none. */
    status: number;
    error: string | null;
}

/** Why a call got no answer, in a few words, never with the address in it. */
const describeFailure = (error: unknown): string => {
    if (error instanceof UnsafeUrlError) return 'address not allowed';
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') return 'no answer in time';
    const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
    return typeof cause?.code === 'string' ? cause.code : 'unreachable';
};

/**
 * Sends one call and records how it went. A redirect is not followed: the
 * address a parent entered is the only one called. Never throws.
 */
export const deliverWebhook = async (
    webhook: { id: string; encrypted_target: string },
    event: string,
    entity: string | null,
    action: string | null,
): Promise<WebhookDelivery> => {
    let delivery: WebhookDelivery;
    const deliveryId = crypto.randomUUID();
    try {
        const { url, secret } = decryptCredentials(webhook.encrypted_target);
        if (!url || !secret) throw new Error('unreadable target');
        // Checked again at every call: what a name resolves to can change.
        await assertSafeIntegrationUrl(url);
        const body = JSON.stringify({
            event,
            entity,
            action,
            occurred_at: new Date().toISOString(),
            webhook_id: webhook.id,
            delivery_id: deliveryId,
        });
        const response = await fetch(url, {
            method: 'POST',
            redirect: 'manual',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'OpenFamily-Webhook/1',
                'X-OpenFamily-Event': event,
                'X-OpenFamily-Delivery': deliveryId,
                'X-OpenFamily-Signature': signWebhookBody(secret, body),
            },
            body,
        });
        await response.body?.cancel().catch(() => undefined);
        const ok = response.status >= 200 && response.status < 300;
        delivery = { ok, status: response.status, error: ok ? null : `HTTP ${response.status}` };
    } catch (error) {
        delivery = { ok: false, status: 0, error: describeFailure(error) };
    }

    try {
        const recorded = await query(
            `UPDATE webhooks SET
                last_delivery_at = now(),
                last_status = $2,
                last_error = $3,
                failure_count = CASE WHEN $4 THEN 0 ELSE failure_count + 1 END,
                enabled = enabled AND ($4 OR failure_count + 1 < $5)
             WHERE id = $1
             RETURNING enabled`,
            [webhook.id, delivery.status, delivery.error, delivery.ok, WEBHOOK_MAX_FAILURES],
        );
        if (!delivery.ok) {
            logger.warn('webhooks.delivery_failed', {
                id: webhook.id,
                event,
                status: delivery.status,
                reason: delivery.error,
                disabled: recorded.rows[0]?.enabled === false,
            });
        }
    } catch (error) {
        logger.error('webhooks.record_failed', { error: error instanceof Error ? error.message : String(error) });
    }
    return delivery;
};

// ─── From a change to the calls ──────────────────────────────────────────────

const timers = new Map<string, NodeJS.Timeout>();
const running = new Set<Promise<void>>();

const dispatch = async (ownerId: string, entity: WebhookEntity, action: WsAction): Promise<void> => {
    const found = await query(
        'SELECT id, encrypted_target, events FROM webhooks WHERE user_id = $1 AND enabled = true',
        [ownerId],
    );
    const wanted = (found.rows as Array<{ id: string; encrypted_target: string; events: string }>).filter((webhook) => {
        const events = parseWebhookEvents(webhook.events);
        return events.length === 0 || events.includes(entity);
    });
    await Promise.all(wanted.map((webhook) => deliverWebhook(webhook, `${entity}.${action}`, entity, action)));
};

/** A change was broadcast for a family: tell its webhooks, once for a burst of the same kind. */
const onChange = (ownerId: string, data: WsUpdatePayload): void => {
    const { entity, action } = data;
    if (!isWebhookEntity(entity)) return;
    const key = `${ownerId}:${entity}:${action}`;
    if (timers.has(key)) return;
    const timer = setTimeout(() => {
        timers.delete(key);
        const run = dispatch(ownerId, entity, action)
            .catch((error) => {
                logger.error('webhooks.dispatch_failed', { error: error instanceof Error ? error.message : String(error) });
            })
            .finally(() => running.delete(run));
        running.add(run);
    }, coalesceMs);
    timer.unref?.();
    timers.set(key, timer);
};

let started = false;

/** Starts following what the server broadcasts. Safe to call more than once. */
export const startWebhookDispatcher = (): void => {
    if (started) return;
    started = true;
    onBroadcast(onChange);
};

/** Tests: how long changes are merged for, and a way to wait until every call is over. */
export const setWebhookCoalesceForTests = (ms: number): void => {
    coalesceMs = ms;
};
export const settleWebhooks = async (): Promise<void> => {
    while (timers.size > 0 || running.size > 0) {
        await Promise.allSettled([...running]);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
};
