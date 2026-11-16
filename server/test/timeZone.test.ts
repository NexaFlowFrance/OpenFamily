import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, createInvite, me, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { issueAccessToken } from '../src/lib/authTokens';
import { displayOptions, renderDisplayPage } from '../src/lib/displayPage';
import { loadDisplaySnapshot } from '../src/lib/displaySnapshot';
import { buildReminderTexts, checkReminders, reminderMoment } from '../src/lib/reminderScheduler';
import {
    addDays, canonicalTimeZone, dayInZone, forgetFamilyTimeZones, instantInZone, isoWeekdayOf, isTimeZone,
    naiveInZone, serverTimeZone,
} from '../src/lib/timeZone';

// A family's wall-clock times ("dentist at 09:30") become moments in time in
// the family's own zone: the one chosen in Settings, or the server's.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };

beforeEach(async () => {
    await resetState();
    forgetFamilyTimeZones();
    parent = await registerWithPassword('parent@example.org');
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const setZone = (token: string, timezone: unknown) =>
    request(app).put('/api/auth/timezone').set(bearer(token)).send({ timezone });
const familyMember = async (role: 'parent' | 'enfant', email: string) => {
    const created = await query(
        `INSERT INTO users (email, name, role, family_owner_id) VALUES ($1, 'Member', $2, $3)
         RETURNING id, family_owner_id, token_version`,
        [email, role, parent.user.id],
    );
    return { id: created.rows[0].id as string, token: issueAccessToken(created.rows[0]) };
};
const iso = (value: Date) => value.toISOString();

describe('wall-clock times and instants', () => {
    it('reads a wall-clock time in a zone, winter and summer', () => {
        expect(iso(instantInZone('2026-11-15T09:30:00', 'Europe/Paris'))).toBe('2026-11-15T08:30:00.000Z');
        expect(iso(instantInZone('2026-07-01T09:30:00', 'Europe/Paris'))).toBe('2026-07-01T07:30:00.000Z');
        expect(iso(instantInZone('2026-11-15T09:30:00', 'America/New_York'))).toBe('2026-11-15T14:30:00.000Z');
        // Fourteen hours ahead of UTC: the new year starts there first.
        expect(iso(instantInZone('2026-01-01T00:00:00', 'Pacific/Kiritimati'))).toBe('2025-12-31T10:00:00.000Z');
        expect(iso(instantInZone('2026-11-15', 'Asia/Tokyo'))).toBe('2026-11-14T15:00:00.000Z');
        expect(Number.isNaN(instantInZone('next tuesday', 'Europe/Paris').getTime())).toBe(true);
    });

    it('goes back from an instant to what the clocks show', () => {
        const instant = new Date('2026-11-15T23:30:00.000Z');
        expect(naiveInZone(instant, 'Europe/Paris')).toBe('2026-11-16T00:30:00');
        expect(dayInZone(instant, 'America/New_York')).toBe('2026-11-15');
        expect(dayInZone(instant, 'Asia/Tokyo')).toBe('2026-11-16');
        for (const zone of ['Europe/Paris', 'America/New_York', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
            expect(iso(instantInZone(naiveInZone(instant, zone), zone))).toBe(iso(instant));
        }
    });

    it('stays defined on the nights the clocks change', () => {
        // 02:30 does not exist on that night in New York; 01:30 happens twice in November.
        expect(iso(instantInZone('2026-03-08T02:30:00', 'America/New_York'))).toBe('2026-03-08T07:30:00.000Z');
        expect(iso(instantInZone('2026-11-01T01:30:00', 'America/New_York'))).toBe('2026-11-01T05:30:00.000Z');
        // The same wall-clock time, a day apart, across the change: 23 or 25 hours.
        const before = instantInZone('2026-03-28T12:00:00', 'Europe/Paris').getTime();
        const after = instantInZone('2026-03-29T12:00:00', 'Europe/Paris').getTime();
        expect((after - before) / 3_600_000).toBe(23);
    });

    it('knows a zone name from anything else, and its canonical spelling', () => {
        expect(isTimeZone('Europe/Paris')).toBe(true);
        expect(isTimeZone('UTC')).toBe(true);
        for (const value of ['Paris', '', 'Europe/Atlantis', 42, null, undefined, 'x'.repeat(80)]) {
            expect(isTimeZone(value)).toBe(false);
        }
        expect(canonicalTimeZone('europe/paris')).toBe('Europe/Paris');
        expect(isTimeZone(serverTimeZone())).toBe(true);
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(isoWeekdayOf('2026-11-15')).toBe(7);
        expect(isoWeekdayOf('2026-11-16')).toBe(1);
    });
});

describe('reminders', () => {
    it("are due in the family's zone, not the server's", () => {
        const appointment = { start_time: '2026-11-15T09:30:00', is_all_day: false };
        expect(iso(reminderMoment({ ...appointment, timezone: 'America/New_York' }, 30))).toBe('2026-11-15T14:00:00.000Z');
        expect(iso(reminderMoment({ ...appointment, timezone: 'Asia/Tokyo' }, 30))).toBe('2026-11-15T00:00:00.000Z');
        // An all-day event counts from 09:00 on its day, there.
        expect(iso(reminderMoment({ start_time: '2026-11-15T00:00:00', is_all_day: true, timezone: 'Asia/Tokyo' }, 0)))
            .toBe('2026-11-15T00:00:00.000Z');
        // No zone chosen: the server's, as before.
        expect(iso(reminderMoment(appointment, 0))).toBe(iso(instantInZone('2026-11-15T09:30:00', serverTimeZone())));
    });

    it('say "today" for the day it is where the family lives', () => {
        // 23:30 UTC on the 15th is already the 16th in Tokyo.
        const now = new Date('2026-11-15T23:30:00.000Z');
        const event = { title: 'School trip', start_time: '2026-11-16T00:00:00', is_all_day: true, language: 'en', location: null };
        expect(buildReminderTexts({ ...event, timezone: 'Asia/Tokyo' }, 0, now).body).toBe('Today');
        expect(buildReminderTexts({ ...event, timezone: 'America/New_York' }, 0, now).body).toBe('Tomorrow');
    });
});

describe('the reminder scheduler', () => {
    it("sends a reminder when it is due on the family's clocks, wherever the server runs", async () => {
        const now = new Date();
        // The same wall-clock time for two families: twenty-nine minutes from
        // now in Tokyo, which is hours away from now in New York.
        const start = naiveInZone(new Date(now.getTime() + 29 * 60_000), 'Asia/Tokyo');
        const other = await registerWithPassword('other@example.org');
        await setZone(parent.token, 'Asia/Tokyo');
        await setZone(other.token, 'America/New_York');
        for (const family of [parent, other]) {
            const created = await request(app).post('/api/appointments').set(bearer(family.token))
                .send({ title: 'Dentist', start_time: start, reminder_minutes: [30] });
            expect(created.status).toBe(200);
        }

        await checkReminders(now);

        const sent = await query("SELECT user_id, title, message FROM notifications WHERE type = 'appointment_reminder'");
        expect(sent.rows.map((row: { user_id: string }) => row.user_id)).toEqual([parent.user.id]);
        expect(sent.rows[0].title).toContain('Dentist');
        expect(sent.rows[0].message).toContain(start.slice(11, 16));

        // A second pass does not send it again.
        await checkReminders(now);
        expect((await query("SELECT count(*)::int AS n FROM notifications WHERE type = 'appointment_reminder'")).rows[0].n).toBe(1);
    });
});

describe("the family's time zone setting", () => {
    it("is the server's until a parent chooses one", async () => {
        const answer = await request(app).get('/api/auth/timezone').set(bearer(parent.token));
        expect(answer.body.data).toEqual({ timezone: serverTimeZone(), family_timezone: null, server_timezone: serverTimeZone() });
        expect((await me(parent.token)).body.data.user.timezone).toBe(serverTimeZone());
    });

    it('starts on the clocks of the browser that creates the family', async () => {
        const signUp = (email: string, extra: Record<string, unknown>) => request(app).post('/api/auth/register')
            .send({ email, password: 'correct-horse-1', name: 'Someone', ...extra });
        const zoneOf = async (token: string) =>
            (await request(app).get('/api/auth/timezone').set(bearer(token))).body.data.family_timezone;

        const montreal = await signUp('montreal@example.org', { timezone: 'america/montreal' });
        expect(montreal.status).toBe(200);
        // Stored under the name the runtime knows it by, like a zone a parent types.
        expect(await zoneOf(montreal.body.data.token)).toBe(canonicalTimeZone('America/Montreal'));

        // What is not a zone does not stop the sign-up: the family follows the server.
        for (const [email, timezone] of [['a@example.org', 'Europe/Atlantis'], ['b@example.org', 42], ['c@example.org', '']] as const) {
            const answer = await signUp(email, { timezone });
            expect(answer.status).toBe(200);
            expect(await zoneOf(answer.body.data.token)).toBeNull();
        }

        // Someone invited joins a family that has its zone: theirs is not kept.
        await setZone(parent.token, 'Asia/Tokyo');
        const invited = await signUp('invited@example.org', {
            inviteToken: await createInvite(parent.token), timezone: 'America/Montreal',
        });
        expect(invited.status).toBe(200);
        expect((await me(invited.body.data.token)).body.data.user.timezone).toBe('Asia/Tokyo');
        const row = await query('SELECT timezone FROM users WHERE id = $1', [invited.body.data.user.id]);
        expect(row.rows[0].timezone).toBeNull();
    });

    it('is chosen by a parent, for the whole family', async () => {
        const child = await familyMember('enfant', 'child@example.org');
        expect((await setZone(child.token, 'Asia/Tokyo')).status).toBe(403);

        const saved = await setZone(parent.token, 'asia/tokyo');
        expect(saved.status).toBe(200);
        expect(saved.body.data).toMatchObject({ timezone: 'Asia/Tokyo', family_timezone: 'Asia/Tokyo' });
        // Every member reads the same one.
        expect((await me(child.token)).body.data.user.timezone).toBe('Asia/Tokyo');

        expect((await setZone(parent.token, null)).body.data.family_timezone).toBeNull();
        expect((await me(child.token)).body.data.user.timezone).toBe(serverTimeZone());
    });

    it.each([['Tokyo'], ['Europe/Atlantis'], [42], [undefined]])('refuses %j', async (timezone) => {
        const answer = await setZone(parent.token, timezone);
        expect(answer.status).toBe(400);
        expect(answer.body.error).toBe('invalid_timezone');
    });

    it('follows the family when its ownership is transferred', async () => {
        const member = await familyMember('parent', 'member@example.org');
        await setZone(parent.token, 'Asia/Tokyo');
        const transfer = await request(app).post('/api/invites/transfer-ownership')
            .set(bearer(parent.token)).send({ newOwnerId: member.id });
        expect(transfer.status).toBe(200);
        expect((await me(transfer.body.data.token)).body.data.user.timezone).toBe('Asia/Tokyo');
    });
});

describe('what other programs are told', () => {
    // Tokyo keeps the same offset all year: nine hours ahead of UTC.
    const tokyoInstant = (naive: string) => new Date(`${naive}Z`).getTime() - 9 * 3_600_000;
    const today = dayInZone(new Date(), 'Asia/Tokyo');

    beforeEach(async () => {
        await setZone(parent.token, 'Asia/Tokyo');
    });

    it('the API gives each appointment as typed, and as an instant', async () => {
        const day = addDays(today, 1);
        await request(app).post('/api/appointments').set(bearer(parent.token))
            .send({ title: 'Dentist', start_time: `${day}T09:30:00`, end_time: `${day}T10:15:00` });
        await request(app).post('/api/appointments').set(bearer(parent.token))
            .send({ title: 'Call', start_time: `${day}T18:00:00` });

        const listed = await request(app)
            .get(`/api/appointments?start_date=${day}T00:00:00&end_date=${day}T23:59:59`).set(bearer(parent.token));
        const [dentist, call] = listed.body.data;
        expect(dentist).toMatchObject({
            title: 'Dentist',
            start_time: `${day}T09:30:00`,
            start_at: new Date(tokyoInstant(`${day}T09:30:00`)).toISOString(),
            end_at: new Date(tokyoInstant(`${day}T10:15:00`)).toISOString(),
        });
        expect(call.end_at).toBeNull();
    });

    it('the calendar feed gives instants, whole days as days, and every occurrence of a series', async () => {
        const day = addDays(today, 2);
        const post = (body: Record<string, unknown>) =>
            request(app).post('/api/appointments').set(bearer(parent.token)).send(body);
        await post({ title: 'Dentist', start_time: `${day}T09:30:00`, end_time: `${day}T10:15:00` });
        await post({ title: 'School trip', start_time: `${day}T00:00:00`, end_time: `${day}T23:59:00`, is_all_day: true });
        await post({ title: 'Choir', start_time: `${day}T18:00:00`, end_time: `${day}T19:00:00`, recurrence_frequency: 'weekly' });
        const token = (await request(app).get('/api/calendar/token').set(bearer(parent.token))).body.data.token as string;

        const feed = (await request(app).get(`/api/calendar/${token}/openfamily.ics`)).text;
        const stamp = (naive: string) => `${new Date(tokyoInstant(naive)).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
        const compact = (value: string) => value.replace(/-/g, '');

        expect(feed).toContain('X-WR-TIMEZONE:Asia/Tokyo');
        expect(feed).toContain(`DTSTART:${stamp(`${day}T09:30:00`)}`);
        expect(feed).toContain(`DTEND:${stamp(`${day}T10:15:00`)}`);
        // A whole day: no time, no zone, and it ends on the next day, exclusive.
        expect(feed).toContain(`DTSTART;VALUE=DATE:${compact(day)}`);
        expect(feed).toContain(`DTEND;VALUE=DATE:${compact(addDays(day, 1))}`);
        // The weekly series, one event a week over the two years ahead.
        const events = feed.split('BEGIN:VEVENT').slice(1);
        const choir = events.filter((event) => event.includes('SUMMARY:Choir'));
        expect(choir.length).toBeGreaterThan(100);
        expect(choir.some((event) => event.includes(`DTSTART:${stamp(`${addDays(day, 7)}T18:00:00`)}`))).toBe(true);
        const uids = events.map((event) => /UID:(\S+)/.exec(event)?.[1]);
        expect(new Set(uids).size).toBe(events.length);
        expect(feed).not.toMatch(/DTSTART:\d{8}T\d{6}\r/);
    });

    it("a display shows the family's day, and writes its date on the family's clocks", async () => {
        // 20:00 UTC on the 15th: already the 16th, 05:00, in Tokyo.
        const now = new Date('2026-11-15T20:00:00.000Z');
        await query("INSERT INTO appointments (user_id, title, start_time) VALUES ($1, 'Dentist', '2026-11-16T09:30:00')", [parent.user.id]);
        await query("INSERT INTO appointments (user_id, title, start_time) VALUES ($1, 'Yesterday', '2026-11-15T09:30:00')", [parent.user.id]);

        const snapshot = await loadDisplaySnapshot(parent.user.id, now);
        expect(snapshot).toMatchObject({ timeZone: 'Asia/Tokyo', today: '2026-11-16', tomorrow: '2026-11-17' });
        expect(snapshot.appointmentsToday.map((appointment) => appointment.title)).toEqual(['Dentist']);

        const html = renderDisplayPage(snapshot, displayOptions({}, 'en-US'));
        expect(html).toContain('Monday, November 16');
        expect(html).toContain('5:00 AM');
        // Stored times are wall-clock already: shown as typed.
        expect(html).toContain('9:30 AM');
    });
});
