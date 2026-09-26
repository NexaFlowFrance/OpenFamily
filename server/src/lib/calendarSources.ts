/**
 * Outside calendars in OpenFamily: a one-off .ics file import, and calendars
 * followed by address (Google Calendar's secret iCal address, Outlook, Apple,
 * Proton...) that are refreshed on a schedule.
 *
 * Events keep their source identifier (external_uid) and a fingerprint of their
 * content (external_hash): a refresh or a second import of the same file
 * updates what changed, adds what is new and, for a followed calendar, removes
 * what its source no longer has. Locally chosen members, reminders and notes
 * are kept across refreshes.
 */
import crypto from 'node:crypto';
import cron from 'node-cron';
import { PoolClient } from 'pg';
import { getClient, query } from '../db';
import { broadcast } from './broadcaster';
import logger from './logger';
import { safeFetch, readCappedBuffer } from './safeFetch';
import { decryptCredentials } from '../utils/crypto';
import { IcsEvent, IcsError, parseIcs } from './icsCalendar';

export const MAX_SUBSCRIPTIONS = 10;
export const MAX_EVENTS_PER_SOURCE = 5000;
export const MAX_ICS_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const REFRESH_EVERY_MINUTES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SourceErrorCode = 'INVALID_URL' | 'FETCH_FAILED' | 'NOT_ICS' | 'TOO_LARGE' | 'EMPTY';

export class CalendarSourceError extends Error {
    constructor(public code: SourceErrorCode, message?: string) {
        super(message ?? code);
    }
}

/** The family's zone: the one the server runs in, as for reminders. */
export const familyTimeZone = (): string => process.env.TZ || 'Europe/Paris';

const UNTITLED: Record<string, string> = {
    fr: 'Sans titre', en: 'Untitled', pt: 'Sem título', ru: 'Без названия', es: 'Sin título', zh: '无标题',
};
export const untitledFor = (language: unknown): string =>
    UNTITLED[String(language ?? '').slice(0, 2)] ?? UNTITLED.fr;

/** "webcal://" is how calendar sites offer subscriptions; it is plain https. */
export function normalizeCalendarUrl(raw: unknown): URL {
    const value = typeof raw === 'string' ? raw.trim().replace(/^webcals?:\/\//i, 'https://') : '';
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new CalendarSourceError('INVALID_URL');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new CalendarSourceError('INVALID_URL');
    return url;
}

export async function fetchIcs(url: string): Promise<string> {
    let response: Response;
    try {
        response = await safeFetch(url, {
            timeoutMs: FETCH_TIMEOUT_MS,
            headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5', 'User-Agent': 'OpenFamily calendar' },
        });
    } catch (error) {
        throw new CalendarSourceError('FETCH_FAILED', error instanceof Error ? error.message : undefined);
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new CalendarSourceError('FETCH_FAILED', `HTTP ${response.status}`);
    }
    let body: Buffer;
    try {
        body = await readCappedBuffer(response, MAX_ICS_BYTES);
    } catch {
        throw new CalendarSourceError('TOO_LARGE');
    }
    return body.toString('utf8');
}

/** Parse for storage: followed calendars keep a rolling year behind and ahead. */
export function parseForStorage(ics: string, language: unknown, followed: boolean) {
    const now = Date.now();
    try {
        return parseIcs(ics, {
            timeZone: familyTimeZone(),
            windowStart: followed ? new Date(now - 365 * DAY_MS) : null,
            windowEnd: new Date(now + (followed ? 365 : 2 * 365) * DAY_MS),
            untitled: untitledFor(language),
            maxEvents: MAX_EVENTS_PER_SOURCE,
        });
    } catch (error) {
        if (error instanceof IcsError) throw new CalendarSourceError(error.code === 'EMPTY' ? 'EMPTY' : 'NOT_ICS');
        throw error;
    }
}

const fingerprint = (event: IcsEvent) =>
    crypto.createHash('sha256').update(JSON.stringify({ ...event, uid: undefined })).digest('hex').slice(0, 32);

export interface StoreResult {
    created: number;
    updated: number;
    unchanged: number;
    removed: number;
}

/**
 * Writes parsed events for one source inside the caller's transaction.
 * `subscriptionId` null means a one-off file import.
 */
export async function storeEvents(
    client: PoolClient,
    options: {
        userId: string;
        subscriptionId: string | null;
        color: string;
        memberIds: string[];
        events: IcsEvent[];
        removeMissing: boolean;
    }
): Promise<StoreResult> {
    const { userId, subscriptionId, color, memberIds, events } = options;
    const existing = await client.query(
        `SELECT id, external_uid, external_hash FROM appointments
         WHERE user_id = $1 AND subscription_id IS NOT DISTINCT FROM $2 AND external_uid IS NOT NULL`,
        [userId, subscriptionId]
    );
    const byUid = new Map<string, { id: string; hash: string | null }>(
        existing.rows.map((r: any) => [r.external_uid, { id: r.id, hash: r.external_hash }])
    );

    const result: StoreResult = { created: 0, updated: 0, unchanged: 0, removed: 0 };
    const seen = new Set<string>();

    for (const event of events) {
        if (seen.has(event.uid)) continue;
        seen.add(event.uid);
        const hash = fingerprint(event);
        const found = byUid.get(event.uid);
        if (found && found.hash === hash) {
            result.unchanged++;
            continue;
        }
        const recurrence = event.recurrence;
        const fields = [
            event.title,
            event.description,
            event.start,
            event.end,
            event.location,
            event.allDay,
            recurrence?.frequency ?? 'none',
            recurrence?.interval ?? 1,
            recurrence?.until ?? null,
            hash,
        ];
        let appointmentId: string;
        if (found) {
            await client.query(
                `UPDATE appointments
                 SET title = $1, description = $2, start_time = $3, end_time = $4, location = $5,
                     is_all_day = $6, recurrence_frequency = $7, recurrence_interval = $8,
                     recurrence_until = $9, external_hash = $10, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $11`,
                [...fields, found.id]
            );
            await client.query('DELETE FROM appointment_recurrence_exceptions WHERE appointment_id = $1', [found.id]);
            appointmentId = found.id;
            result.updated++;
        } else {
            const inserted = await client.query(
                `INSERT INTO appointments (
                    title, description, start_time, end_time, location, is_all_day,
                    recurrence_frequency, recurrence_interval, recurrence_until, external_hash,
                    user_id, subscription_id, external_uid, color, family_member_ids
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
                 RETURNING id`,
                [...fields, userId, subscriptionId, event.uid, color, JSON.stringify(memberIds)]
            );
            appointmentId = inserted.rows[0].id;
            result.created++;
        }
        if (recurrence) {
            for (const exception of event.exceptions) {
                await client.query(
                    `INSERT INTO appointment_recurrence_exceptions
                        (appointment_id, occurrence_date, exception_type, override_data)
                     VALUES ($1, $2::date, $3, $4::jsonb)
                     ON CONFLICT (appointment_id, occurrence_date)
                     DO UPDATE SET exception_type = EXCLUDED.exception_type, override_data = EXCLUDED.override_data`,
                    [appointmentId, exception.date, exception.type, exception.data ? JSON.stringify(exception.data) : null]
                );
            }
        }
    }

    if (options.removeMissing && subscriptionId) {
        const removed = await client.query(
            `DELETE FROM appointments
             WHERE subscription_id = $1 AND NOT (external_uid = ANY($2::text[]))
             RETURNING id`,
            [subscriptionId, [...seen]]
        );
        result.removed = removed.rowCount ?? 0;
    }
    return result;
}

const syncing = new Set<string>();

/** Refreshes one followed calendar; records the outcome on the subscription. */
export async function syncSubscription(subscriptionId: string): Promise<StoreResult & { total: number }> {
    if (syncing.has(subscriptionId)) throw new CalendarSourceError('FETCH_FAILED', 'Already refreshing');
    syncing.add(subscriptionId);
    try {
        const found = await query(
            `SELECT s.*, COALESCE(u.language, 'fr') AS language
             FROM calendar_subscriptions s JOIN users u ON u.id = s.user_id
             WHERE s.id = $1`,
            [subscriptionId]
        );
        const sub = found.rows[0];
        if (!sub) throw new CalendarSourceError('INVALID_URL', 'Subscription not found');
        try {
            const { url } = decryptCredentials(sub.encrypted_url);
            const parsed = parseForStorage(await fetchIcs(normalizeCalendarUrl(url).toString()), sub.language, true);
            const client = await getClient();
            let stored: StoreResult;
            try {
                await client.query('BEGIN');
                stored = await storeEvents(client, {
                    userId: sub.user_id,
                    subscriptionId,
                    color: sub.color,
                    memberIds: Array.isArray(sub.family_member_ids) ? sub.family_member_ids : [],
                    events: parsed.events,
                    removeMissing: true,
                });
                await client.query(
                    `UPDATE calendar_subscriptions
                     SET last_synced_at = now(), last_error = NULL, event_count = $2, updated_at = now()
                     WHERE id = $1`,
                    [subscriptionId, parsed.events.length]
                );
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                client.release();
            }
            if (stored.created || stored.updated || stored.removed) {
                broadcast(sub.user_id, { type: 'update', entity: 'appointments', action: 'synced' });
            }
            return { ...stored, total: parsed.events.length };
        } catch (error) {
            const code = error instanceof CalendarSourceError ? error.code : 'FETCH_FAILED';
            await query(
                'UPDATE calendar_subscriptions SET last_error = $2, last_synced_at = now(), updated_at = now() WHERE id = $1',
                [subscriptionId, code]
            ).catch(() => undefined);
            throw error;
        }
    } finally {
        syncing.delete(subscriptionId);
    }
}

async function refreshAll(): Promise<void> {
    try {
        const due = await query(
            `SELECT id FROM calendar_subscriptions
             WHERE last_synced_at IS NULL OR last_synced_at < now() - ($1 || ' minutes')::interval
             ORDER BY last_synced_at NULLS FIRST`,
            [String(REFRESH_EVERY_MINUTES - 5)]
        );
        for (const row of due.rows) {
            try {
                await syncSubscription(row.id);
            } catch (error) {
                logger.warn('calendar_subscription.refresh_failed', {
                    subscriptionId: row.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    } catch (error) {
        logger.error('calendar_subscription.scheduler_error', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export function startCalendarSubscriptionScheduler(): void {
    cron.schedule(`*/${REFRESH_EVERY_MINUTES} * * * *`, () => {
        void refreshAll();
    }, { timezone: familyTimeZone() });
    logger.info('calendar_subscription.scheduler_started', { everyMinutes: REFRESH_EVERY_MINUTES });
}
