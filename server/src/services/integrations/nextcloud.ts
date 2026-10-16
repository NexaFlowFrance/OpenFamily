import { getClient, query } from '../../db';
import { parseForStorage } from '../../lib/calendarSources';
import { decryptCredentials } from '../../utils/crypto';
import { safeFetch } from '../../lib/safeFetch';

const NEXTCLOUD_TIMEOUT_MS = 15_000;
const DEFAULT_CALENDAR_COLOR = '#3B82F6';
const TECHNICAL_CALENDARS = new Set(['inbox', 'outbox', 'trashbin']);

interface DiscoveredCalendar {
    href: string;
    name: string;
    color?: string;
}

interface PersistedCalendar extends DiscoveredCalendar {
    id: string;
    enabled: boolean;
    familyMemberIds: string[];
    storedColor: string;
}

interface NextcloudCredentials {
    username?: string;
    password?: string;
}

interface SyncResult {
    imported: number;
    errors: number;
}

function normalizeBaseUrl(value: string): string {
    return value.replace(/\/+$/, '');
}

function decodeXml(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function normalizeHref(value: string): string {
    try {
        return decodeURIComponent(value)
            .replace(/\/+$/, '')
            .toLocaleLowerCase();
    } catch {
        return value.replace(/\/+$/, '').toLocaleLowerCase();
    }
}

function calendarNameFromHref(href: string): string {
    const segment = href.split('/').filter(Boolean).pop();
    if (!segment) return href;

    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

function isTechnicalCalendar(calendar: DiscoveredCalendar): boolean {
    const hrefName = calendarNameFromHref(calendar.href).toLocaleLowerCase();
    const displayName = calendar.name.toLocaleLowerCase();
    return TECHNICAL_CALENDARS.has(hrefName) || TECHNICAL_CALENDARS.has(displayName);
}

async function discoverCalendars(
    baseUrl: string,
    username: string,
    authHeader: string
): Promise<DiscoveredCalendar[]> {
    const root = `/remote.php/dav/calendars/${encodeURIComponent(username)}/`;
    const response = await safeFetch(`${normalizeBaseUrl(baseUrl)}${root}`, {
        method: 'PROPFIND',
        headers: {
            Authorization: authHeader,
            Depth: '1',
            'Content-Type': 'application/xml; charset=utf-8',
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:I="http://apple.com/ns/ical/">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
    <I:calendar-color/>
  </D:prop>
</D:propfind>`,
        timeoutMs: NEXTCLOUD_TIMEOUT_MS,
    });

    if (!response.ok && response.status !== 207) {
        throw new Error(`Nextcloud calendar discovery failed: HTTP ${response.status}`);
    }

    const xml = await response.text();
    const responseBlocks =
        xml.match(/<(?:[A-Za-z][\w.-]*:)?response\b[\s\S]*?<\/(?:[A-Za-z][\w.-]*:)?response>/gi) ?? [];
    const calendars: DiscoveredCalendar[] = [];
    const seenHrefs = new Set<string>();
    const normalizedRoot = normalizeHref(root);

    for (const block of responseBlocks) {
        if (!/<(?:[A-Za-z][\w.-]*:)?calendar\s*\/?\s*>/i.test(block)) {
            continue;
        }

        const hrefMatch = block.match(
            /<(?:[A-Za-z][\w.-]*:)?href>([^<]+)<\/(?:[A-Za-z][\w.-]*:)?href>/i
        );
        if (!hrefMatch) continue;

        const href = decodeXml(hrefMatch[1].trim());
        const normalizedHref = normalizeHref(href);
        if (normalizedHref === normalizedRoot || seenHrefs.has(normalizedHref)) {
            continue;
        }

        const displayNameMatch = block.match(
            /<(?:[A-Za-z][\w.-]*:)?displayname>([^<]*)<\/(?:[A-Za-z][\w.-]*:)?displayname>/i
        );
        const colorMatch = block.match(
            /<(?:[A-Za-z][\w.-]*:)?calendar-color>([^<]*)<\/(?:[A-Za-z][\w.-]*:)?calendar-color>/i
        );

        seenHrefs.add(normalizedHref);
        calendars.push({
            href,
            name:
                decodeXml(displayNameMatch?.[1]?.trim() ?? '') ||
                calendarNameFromHref(href),
            color: colorMatch?.[1]?.trim() || undefined,
        });
    }

    return calendars;
}

async function persistCalendars(
    integrationId: string,
    userId: string,
    calendars: DiscoveredCalendar[]
): Promise<PersistedCalendar[]> {
    const client = await getClient();

    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE integration_calendars
             SET discovered = false,
                 updated_at = now()
             WHERE integration_id = $1
               AND user_id = $2`,
            [integrationId, userId]
        );

        for (const calendar of calendars) {
            await client.query(
                `INSERT INTO integration_calendars (
                     user_id,
                     integration_id,
                     calendar_href,
                     calendar_name,
                     color,
                     enabled,
                     discovered,
                     updated_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, true, now())
                 ON CONFLICT (integration_id, calendar_href)
                 DO UPDATE SET
                     calendar_name = EXCLUDED.calendar_name,
                     discovered = true,
                     updated_at = now()`,
                [
                    userId,
                    integrationId,
                    calendar.href,
                    calendar.name,
                    calendar.color || DEFAULT_CALENDAR_COLOR,
                    !isTechnicalCalendar(calendar),
                ]
            );
        }

        const result = await client.query(
            `SELECT
                 id,
                 calendar_href,
                 calendar_name,
                 color,
                 family_member_ids,
                 enabled
             FROM integration_calendars
             WHERE integration_id = $1
               AND user_id = $2
               AND discovered = true
             ORDER BY calendar_name`,
            [integrationId, userId]
        );

        await client.query('COMMIT');

        return result.rows.map((row) => ({
            id: String(row.id),
            href: String(row.calendar_href),
            name: String(row.calendar_name),
            storedColor: String(row.color || DEFAULT_CALENDAR_COLOR),
            familyMemberIds: Array.isArray(row.family_member_ids)
                ? row.family_member_ids.map(String)
                : [],
            enabled: Boolean(row.enabled),
        }));
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

async function setCalendarSyncResult(
    calendarId: string,
    eventCount: number,
    error: unknown = null
): Promise<void> {
    await query(
        `UPDATE integration_calendars
         SET last_synced_at = CASE WHEN $3::text IS NULL THEN now() ELSE last_synced_at END,
             last_error = $3,
             event_count = CASE WHEN $3::text IS NULL THEN $2 ELSE event_count END,
             updated_at = now()
         WHERE id = $1`,
        [
            calendarId,
            eventCount,
            error ? (error instanceof Error ? error.message : String(error)) : null,
        ]
    );
}

export async function testNextcloudConnection(
    baseUrl: string,
    username: string,
    password: string
): Promise<{ success: boolean; message: string }> {
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    try {
        const calendars = await discoverCalendars(baseUrl, username, authHeader);
        return {
            success: true,
            message: `Connexion réussie — ${calendars.length} calendrier(s) trouvé(s)`,
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Connexion Nextcloud impossible',
        };
    }
}

export async function syncNextcloud(
    integrationId: string,
    userId: string,
    baseUrl: string,
    encryptedCredentials: string,
    config: Record<string, unknown>
): Promise<SyncResult> {
    const credentials = decryptCredentials(encryptedCredentials) as NextcloudCredentials;
    const { username, password } = credentials;
    if (!username || !password) {
        throw new Error('Identifiants Nextcloud manquants');
    }

    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const discovered = await discoverCalendars(normalizedBaseUrl, username, authHeader);
    const discoveryInput: DiscoveredCalendar[] = discovered.length > 0
        ? discovered
        : [{
            href: `/remote.php/dav/calendars/${encodeURIComponent(username)}/${(config.calendar_name as string) || 'personal'}/`,
            name: (config.calendar_name as string) || 'personal',
        }];
    const calendars = await persistCalendars(integrationId, userId, discoveryInput);

    const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    let imported = 0;
    let errors = 0;

    for (const calendar of calendars) {
        if (!calendar.enabled) continue;

        const calUrl = calendar.href.startsWith('http')
            ? calendar.href
            : `${normalizedBaseUrl}${calendar.href}`;

        try {
            const response = await safeFetch(calUrl, {
                method: 'REPORT',
                headers: {
                    Authorization: authHeader,
                    Depth: '1',
                    'Content-Type': 'application/xml; charset=utf-8',
                },
                body: reportBody,
                timeoutMs: NEXTCLOUD_TIMEOUT_MS,
            });

            if (!response.ok && response.status !== 207) {
                throw new Error(`Nextcloud calendar fetch failed: HTTP ${response.status}`);
            }

            const xml = await response.text();
            const icsBlocks =
                xml.match(/BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/g) ?? [];
            const parsedEvents = icsBlocks.flatMap(
                (ics) => parseForStorage(ics, null, true).events
            );
            const seenUids = new Set<string>();
            const client = await getClient();

            try {
                await client.query('BEGIN');

                for (const event of parsedEvents) {
                    seenUids.add(event.uid);

                    const existing = await client.query(
                        `SELECT id
                         FROM appointments
                         WHERE user_id = $1
                           AND caldav_uid = $2
                           AND (
                               source_calendar_id = $3
                               OR source_calendar_id IS NULL
                           )
                         ORDER BY source_calendar_id NULLS LAST
                         LIMIT 1`,
                        [userId, event.uid, calendar.id]
                    );

                    const recurrence = event.recurrence;
                    let appointmentId: string;
                    const values = [
                        event.title,
                        event.description,
                        event.start,
                        event.end,
                        event.location,
                        event.allDay,
                        recurrence?.frequency ?? 'none',
                        recurrence?.interval ?? 1,
                        recurrence?.until ?? null,
                        calendar.storedColor,
                        event.uid,
                        JSON.stringify(calendar.familyMemberIds),
                        integrationId,
                        calendar.id,
                    ];

                    if (existing.rows.length > 0) {
                        appointmentId = String(existing.rows[0].id);
                        await client.query(
                            `UPDATE appointments
                             SET title = $1,
                                 description = $2,
                                 start_time = $3,
                                 end_time = $4,
                                 location = $5,
                                 is_all_day = $6,
                                 recurrence_frequency = $7,
                                 recurrence_interval = $8,
                                 recurrence_until = $9,
                                 color = $10,
                                 external_uid = $11,
                                 family_member_ids = $12::jsonb,
                                 source_integration_id = $13,
                                 source_calendar_id = $14,
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE id = $15`,
                            [...values, appointmentId]
                        );

                        await client.query(
                            `DELETE FROM appointment_recurrence_exceptions
                             WHERE appointment_id = $1`,
                            [appointmentId]
                        );
                    } else {
                        const inserted = await client.query(
                            `INSERT INTO appointments (
                                 user_id,
                                 title,
                                 description,
                                 start_time,
                                 end_time,
                                 location,
                                 is_all_day,
                                 recurrence_frequency,
                                 recurrence_interval,
                                 recurrence_until,
                                 color,
                                 caldav_uid,
                                 external_uid,
                                 family_member_ids,
                                 source_integration_id,
                                 source_calendar_id
                             )
                             VALUES (
                                 $1, $2, $3, $4, $5, $6, $7, $8,
                                 $9, $10, $11, $12, $13, $14::jsonb,
                                 $15, $16
                             )
                             RETURNING id`,
                            [
                                userId,
                                event.title,
                                event.description,
                                event.start,
                                event.end,
                                event.location,
                                event.allDay,
                                recurrence?.frequency ?? 'none',
                                recurrence?.interval ?? 1,
                                recurrence?.until ?? null,
                                calendar.storedColor,
                                event.uid,
                                event.uid,
                                calendar.familyMemberIds,
                                integrationId,
                                calendar.id,
                            ]
                        );
                        appointmentId = String(inserted.rows[0].id);
                    }

                    if (recurrence) {
                        for (const exception of event.exceptions) {
                            await client.query(
                                `INSERT INTO appointment_recurrence_exceptions (
                                     appointment_id,
                                     occurrence_date,
                                     exception_type,
                                     override_data
                                 )
                                 VALUES ($1, $2::date, $3, $4::jsonb)
                                 ON CONFLICT (appointment_id, occurrence_date)
                                 DO UPDATE SET
                                     exception_type = EXCLUDED.exception_type,
                                     override_data = EXCLUDED.override_data`,
                                [
                                    appointmentId,
                                    exception.date,
                                    exception.type,
                                    exception.data
                                        ? JSON.stringify(exception.data)
                                        : null,
                                ]
                            );
                        }
                    }

                    imported++;
                }

                const currentUids = Array.from(seenUids);
                await client.query(
                    `DELETE FROM appointment_recurrence_exceptions AS exception
                     USING appointments AS appointment
                     WHERE exception.appointment_id = appointment.id
                       AND appointment.source_calendar_id = $1
                       AND appointment.caldav_uid IS NOT NULL
                       AND NOT (appointment.caldav_uid = ANY($2::text[]))`,
                    [calendar.id, currentUids]
                );
                await client.query(
                    `DELETE FROM appointments
                     WHERE source_calendar_id = $1
                       AND caldav_uid IS NOT NULL
                       AND NOT (caldav_uid = ANY($2::text[]))`,
                    [calendar.id, currentUids]
                );

                await client.query('COMMIT');
                await setCalendarSyncResult(calendar.id, seenUids.size);
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            errors++;
            console.error(
                `Nextcloud calendar sync failed for ${calendar.name}:`,
                error
            );
            await setCalendarSyncResult(calendar.id, 0, error).catch(() => undefined);
        }
    }

    return { imported, errors };
}

