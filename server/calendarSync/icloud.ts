import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import * as dav from 'dav';
import ICAL from 'ical.js';
import { decryptSecret } from '../crypto.js';
import type { ExternalCalendarAccount, SyncResult } from './types.js';

type RemoteEvent = {
  uid: string;
  href: string;
  etag: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 60000));
}

function parseIcsToRemoteEvents(ics: string, href: string, etag: string | null): RemoteEvent[] {
  const jcal = ICAL.parse(ics);
  const comp = new ICAL.Component(jcal);

  const vevents = comp.getAllSubcomponents('vevent');
  const out: RemoteEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    const uid = event.uid;
    if (!uid) continue;

    const summary = event.summary || '(Sans titre)';
    const description = event.description || null;
    const location = event.location || null;

    const startTime = event.startDate;
    const endTime = event.endDate;

    if (!startTime) continue;

    const allDay = startTime.isDate;

    // ICAL.Time -> JS Date
    const start = startTime.toJSDate();
    let end: Date;

    if (endTime) {
      end = endTime.toJSDate();
    } else {
      // fallback: 60min
      end = new Date(start.getTime() + 60 * 60000);
    }

    // For all-day, some providers set end = next day at 00:00
    out.push({
      uid,
      href,
      etag,
      summary,
      description,
      location,
      start,
      end,
      allDay,
    });
  }

  return out;
}

async function loadIcloudAccount(pool: Pool, familyId: string): Promise<ExternalCalendarAccount | null> {
  const res = await pool.query(
    `SELECT id, family_id, provider, username, password_encrypted, caldav_url
     FROM external_calendar_accounts
     WHERE family_id = $1 AND provider = 'icloud'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [familyId],
  );

  if (res.rowCount === 0) return null;

  const row = res.rows[0] as any;
  return {
    id: row.id,
    familyId: row.family_id,
    provider: 'icloud',
    username: row.username,
    passwordEncrypted: row.password_encrypted,
    caldavUrl: row.caldav_url,
  };
}

export async function upsertIcloudAccount(params: {
  pool: Pool;
  familyId: string;
  username: string;
  passwordEncrypted: string;
}): Promise<{ accountId: string }> {
  const { pool, familyId, username, passwordEncrypted } = params;

  const existing = await pool.query(
    `SELECT id FROM external_calendar_accounts
     WHERE family_id = $1 AND provider = 'icloud' AND username = $2
     LIMIT 1`,
    [familyId, username],
  );

  if (existing.rowCount > 0) {
    const accountId = existing.rows[0].id as string;
    await pool.query(
      `UPDATE external_calendar_accounts
       SET password_encrypted = $1, updated_at = NOW()
       WHERE id = $2`,
      [passwordEncrypted, accountId],
    );
    return { accountId };
  }

  const accountId = `extcal-${randomUUID()}`;
  await pool.query(
    `INSERT INTO external_calendar_accounts
     (id, family_id, provider, username, password_encrypted, caldav_url, created_at, updated_at)
     VALUES ($1, $2, 'icloud', $3, $4, 'https://caldav.icloud.com', NOW(), NOW())`,
    [accountId, familyId, username, passwordEncrypted],
  );

  return { accountId };
}

export async function syncIcloudToOpenFamily(params: {
  pool: Pool;
  familyId: string;
  windowPastDays?: number;
  windowFutureDays?: number;
}): Promise<SyncResult> {
  const { pool, familyId } = params;
  const windowPastDays = params.windowPastDays ?? 30;
  const windowFutureDays = params.windowFutureDays ?? 365;

  const account = await loadIcloudAccount(pool, familyId);
  if (!account) {
    throw new Error('No iCloud account connected for this family.');
  }

  const password = decryptSecret(account.passwordEncrypted);

  // Create CalDAV account
  const davAccount = await dav.createAccount({
    server: account.caldavUrl,
    credentials: {
      username: account.username,
      password,
    },
    // Force fetching calendars + objects
    loadCollections: true,
    loadObjects: true,
  });

  const startWindow = new Date();
  startWindow.setDate(startWindow.getDate() - windowPastDays);

  const endWindow = new Date();
  endWindow.setDate(endWindow.getDate() + windowFutureDays);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // For each calendar, ensure objects are loaded (dav library does it if loadObjects true)
  for (const cal of davAccount.calendars || []) {
    // calendar.objects contains { url, etag, calendarData } in many setups
    const objects = (cal.objects || []) as Array<any>;

    for (const obj of objects) {
      try {
        const href = String(obj.url || obj.href || '');
        const etag = (obj.etag as string | undefined) ?? null;
        const ics = String(obj.calendarData || obj.data || '');

        if (!href || !ics) {
          skipped++;
          continue;
        }

        const events = parseIcsToRemoteEvents(ics, href, etag);

        for (const ev of events) {
          // Filter by window
          if (ev.end < startWindow || ev.start > endWindow) {
            skipped++;
            continue;
          }

          // Check link by (account_id, remote_uid)
          const linkRes = await pool.query(
            `SELECT id, local_appointment_id, remote_etag
             FROM external_calendar_event_links
             WHERE account_id = $1 AND remote_uid = $2
             LIMIT 1`,
            [account.id, ev.uid],
          );

          const date = toYmd(ev.start);
          const time = ev.allDay ? '00:00' : toHm(ev.start);
          const duration = ev.allDay ? 24 * 60 : minutesBetween(ev.start, ev.end);

          if (linkRes.rowCount === 0) {
            // Create local appointment
            const appointmentId = `appt-${randomUUID()}`;

            await pool.query(
              `INSERT INTO appointments
               (id, family_id, title, date, time, location, description, type, reminder, duration, recurring, members, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'other', 'none', $8, NULL, '[]'::jsonb, NOW())`,
              [appointmentId, familyId, ev.summary, date, time, ev.location, ev.description, duration],
            );

            const linkId = `link-${randomUUID()}`;
            await pool.query(
              `INSERT INTO external_calendar_event_links
               (id, family_id, account_id, provider, remote_uid, remote_href, remote_etag, local_appointment_id, updated_at)
               VALUES ($1, $2, $3, 'icloud', $4, $5, $6, $7, NOW())`,
              [linkId, familyId, account.id, ev.uid, ev.href, ev.etag, appointmentId],
            );

            created++;
          } else {
            const linkRow = linkRes.rows[0] as any;
            const existingEtag = (linkRow.remote_etag as string | null) ?? null;

            // If etag is same, skip
            if (existingEtag && ev.etag && existingEtag === ev.etag) {
              skipped++;
              continue;
            }

            // Update local appointment
            await pool.query(
              `UPDATE appointments
               SET title = $1,
                   date = $2,
                   time = $3,
                   location = $4,
                   description = $5,
                   duration = $6
               WHERE id = $7 AND family_id = $8`,
              [ev.summary, date, time, ev.location, ev.description, duration, linkRow.local_appointment_id, familyId],
            );

            // Update link etag/href
            await pool.query(
              `UPDATE external_calendar_event_links
               SET remote_href = $1,
                   remote_etag = $2,
                   updated_at = NOW()
               WHERE id = $3`,
              [ev.href, ev.etag, linkRow.id],
            );

            updated++;
          }
        }
      } catch {
        errors++;
      }
    }
  }

  return { created, updated, skipped, errors };
}
