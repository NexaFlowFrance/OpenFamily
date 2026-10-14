import { getClient, query } from '../../db';
import { parseForStorage } from '../../lib/calendarSources';
import { decryptCredentials } from '../../utils/crypto';
import { safeFetch } from '../../lib/safeFetch';

// Outbound Nextcloud/CalDAV calls go through safeFetch: redirects are re-validated
// on every hop (no SSRF bypass via a 302 to an internal/metadata address) and each
// request is bounded by a hard timeout.
const NEXTCLOUD_TIMEOUT_MS = 15_000;

interface CalDAVEvent {
    uid: string;
    title: string;
    startTime: string;
    endTime: string | null;
    description: string | null;
    location: string | null;
    color: string | null;
}

// ICS line folding: long property values are split across lines with CRLF + SPACE.
// Must unfold before parsing any property.
function unfoldICS(data: string): string {
    return data.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

// CalDAV embeds ICS inside XML, so standard XML entities get escaped.
function unescapeXML(s: string): string {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function parseICSDate(raw: string): string {
    // Handle TZID=...:YYYYMMDDTHHMMSS or plain YYYYMMDDTHHMMSSZ
    const clean = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw;
    if (clean.includes('T')) {
        const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8);
        const h = clean.slice(9, 11), mi = clean.slice(11, 13), s = clean.slice(13, 15);
        return `${y}-${mo}-${d}T${h}:${mi}:${s}${clean.endsWith('Z') ? 'Z' : ''}`;
    }
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00`;
}

function parseICS(rawData: string): CalDAVEvent[] {
    const data = unfoldICS(unescapeXML(rawData));
    const events: CalDAVEvent[] = [];
    const blocks = data.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

    for (const block of blocks) {
        const get = (key: string): string | null => {
            const m = block.match(new RegExp(`^${key}[^:\\r\\n]*:([^\\r\\n]+)`, 'm'));
            return m ? m[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';') : null;
        };

        const uid = get('UID');
        const summary = get('SUMMARY');
        const dtstart = get('DTSTART');
        if (!uid || !summary || !dtstart) continue;

        events.push({
            uid,
            title: summary,
            startTime: parseICSDate(dtstart),
            endTime: (() => { const v = get('DTEND'); return v ? parseICSDate(v) : null; })(),
            description: get('DESCRIPTION'),
            location: get('LOCATION'),
            color: get('COLOR') || get('X-APPLE-CALENDAR-COLOR'),
        });
    }
    return events;
}

async function discoverCalendars(baseUrl: string, username: string, authHeader: string): Promise<string[]> {
    const root = `${baseUrl}/remote.php/dav/calendars/${encodeURIComponent(username)}/`;
    try {
        const resp = await safeFetch(root, {
            method: 'PROPFIND',
            headers: { 'Authorization': authHeader, 'Depth': '1', 'Content-Type': 'application/xml' },
            body: `<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>`,
            timeoutMs: NEXTCLOUD_TIMEOUT_MS,
        });
        if (!resp.ok) return [];
        const xml = await resp.text();
        const hrefs: string[] = [];
        // Each calendar collection response block contains a <cal:calendar/> resourcetype
        const blocks = xml.match(/<[Dd]:response[\s\S]*?<\/[Dd]:response>/g) || [];
        for (const block of blocks) {
            if (!block.includes(':calendar') && !block.includes('caldav:calendar')) continue;
            const m = block.match(/<[Dd]:href>([^<]+)<\/[Dd]:href>/);
            if (m && m[1] !== root && m[1] !== `${root}`) hrefs.push(m[1]);
        }
        return hrefs;
    } catch {
        return [];
    }
}

export async function testNextcloudConnection(baseUrl: string, username: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
        const statusResp = await safeFetch(`${baseUrl}/status.php`, { timeoutMs: NEXTCLOUD_TIMEOUT_MS });
        if (!statusResp.ok) return { success: false, message: `Serveur inaccessible (HTTP ${statusResp.status})` };
        const status = await statusResp.json() as { versionstring?: string; version?: string };

        const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
        const davResp = await safeFetch(`${baseUrl}/remote.php/dav/calendars/${encodeURIComponent(username)}/`, {
            method: 'PROPFIND',
            headers: { 'Authorization': authHeader, 'Depth': '0', 'Content-Type': 'application/xml' },
            timeoutMs: NEXTCLOUD_TIMEOUT_MS,
        });

        if (davResp.status === 401) return { success: false, message: 'Identifiants incorrects. Si la double authentification est activée, utilisez un App Password.' };
        if (davResp.status === 404) return { success: false, message: `Utilisateur "${username}" introuvable sur ce serveur.` };
        if (!davResp.ok) return { success: false, message: `Erreur DAV ${davResp.status}` };

        const hrefs = await discoverCalendars(baseUrl, username, authHeader);
        const vstr = status.versionstring || status.version || '';
        return {
            success: true,
            message: `Connecté a Nextcloud ${vstr} — ${hrefs.length} calendrier${hrefs.length > 1 ? 's' : ''} trouvé${hrefs.length > 1 ? 's' : ''}`.trim(),
        };
    } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : 'Impossible de joindre le serveur' };
    }
}

export async function syncNextcloud(
    _integrationId: string,
    userId: string,
    baseUrl: string,
    encryptedCredentials: string,
    config: Record<string, unknown>
): Promise<{ imported: number; errors: number }> {
    const creds = decryptCredentials(encryptedCredentials);
    const { username, password } = creds;
    if (!username || !password) throw new Error('Identifiants manquants');

    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const discovered = await discoverCalendars(baseUrl, username, authHeader);
    const calendarHrefs = discovered.length > 0
        ? discovered
        : [`/remote.php/dav/calendars/${encodeURIComponent(username)}/${(config.calendar_name as string) || 'personal'}/`];

    const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    let imported = 0;
    let errors = 0;

    const seenUids = new Set<string>();

    for (const href of calendarHrefs) {
        const calUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;

        try {
            const resp = await safeFetch(calUrl, {
                method: 'REPORT',
                headers: {
                    'Authorization': authHeader,
                    'Depth': '1',
                    'Content-Type': 'application/xml',
                },
                body: reportBody,
                timeoutMs: NEXTCLOUD_TIMEOUT_MS,
            });

            if (!resp.ok && resp.status !== 207) {
                errors++;
                continue;
            }

            const xml = await resp.text();
            const icsBlocks =
                xml.match(/BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/g) || [];

            for (const ics of icsBlocks) {
                const client = await getClient();

                try {
                    const parsed = parseForStorage(ics, null, true);

                    await client.query('BEGIN');

                    for (const event of parsed.events) {

                        seenUids.add(event.uid);

                        const existing = await client.query(
                            `SELECT id
                             FROM appointments
                             WHERE user_id = $1
                               AND caldav_uid = $2`,
                            [userId, event.uid]
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
                            '#3B82F6',
                            event.uid,
                        ];

                        if (existing.rows.length > 0) {
                            appointmentId = existing.rows[0].id;

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
                                     updated_at = CURRENT_TIMESTAMP
                                 WHERE id = $12`,
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
                                     external_uid
                                 )
                                 VALUES (
                                     $1, $2, $3, $4, $5, $6, $7,
                                     $8, $9, $10, $11, $12, $13
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
                                    '#3B82F6',
                                    event.uid,
                                    event.uid,
                                ]
                            );

                            appointmentId = inserted.rows[0].id;
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
                                     ON CONFLICT (
                                         appointment_id,
                                         occurrence_date
                                     )
                                     DO UPDATE SET
                                         exception_type =
                                             EXCLUDED.exception_type,
                                         override_data =
                                             EXCLUDED.override_data`,
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

                    await client.query('COMMIT');
                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error(
                        'Nextcloud calendar event import failed:',
                        error
                    );
                    errors++;
                } finally {
                    client.release();
                }
            }
        } catch (error) {
            console.error('Nextcloud calendar fetch failed:', error);
            errors++;
        }
    }

    if (errors === 0 && seenUids.size > 0) {
        console.info(
            `Nextcloud sync completed with ${seenUids.size} UID(s)`
        );
    }

    if (errors === 0 && seenUids.size > 0) {
        const client = await getClient();

        try {
            const currentUids = Array.from(seenUids);

            await client.query('BEGIN');

            await client.query(
                `DELETE FROM appointment_recurrence_exceptions
                 WHERE appointment_id IN (
                     SELECT id
                     FROM appointments
                     WHERE user_id = $1
                       AND caldav_uid IS NOT NULL
                       AND NOT (caldav_uid = ANY($2::text[]))
                 )`,
                [userId, currentUids]
            );

            const deleted = await client.query(
                `DELETE FROM appointments
                 WHERE user_id = $1
                   AND caldav_uid IS NOT NULL
                   AND NOT (caldav_uid = ANY($2::text[]))
                 RETURNING id`,
                [userId, currentUids]
            );

            await client.query('COMMIT');

            if (deleted.rowCount && deleted.rowCount > 0) {
                console.info(
                    `Removed ${deleted.rowCount} deleted Nextcloud event(s)`
                );
            }
        } catch (error) {
            await client.query('ROLLBACK');

            console.error(
                'Removing deleted Nextcloud events failed:',
                error
            );

            errors++;
        } finally {
            client.release();
        }
    }

    return { imported, errors };
}
