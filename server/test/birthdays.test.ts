import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { issueAccessToken } from '../src/lib/authTokens';
import { birthdayIn, birthdaysBetween, checkBirthdays } from '../src/lib/birthdays';
import { loadDisplaySnapshot } from '../src/lib/displaySnapshot';
import { forgetFamilyTimeZones } from '../src/lib/timeZone';

// Birthdays come from the dates of birth on the Family page. They are worked
// out when the calendar is read, never stored, and shown by everything that
// shows the calendar. On the day, the family is told once, in the morning.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };

beforeEach(async () => {
    await resetState();
    forgetFamilyTimeZones();
    parent = await registerWithPassword('parent@example.org');
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const addMember = async (name: string, birthDate: string | null, ownerId = parent.user.id) => (await query(
    "INSERT INTO family_members (user_id, name, color, birth_date) VALUES ($1, $2, '#16A34A', $3) RETURNING id",
    [ownerId, name, birthDate],
)).rows[0].id as string;
const appointments = (range: string, token = parent.token) => request(app).get(`/api/appointments?${range}`).set(bearer(token));
const notices = async (userId: string) => (await query(
    "SELECT title, message, related_id FROM notifications WHERE user_id = $1 AND type = 'birthday' ORDER BY title", [userId],
)).rows;

describe('the day of a birthday', () => {
    it('is the same day every year', () => {
        expect(birthdayIn('2018-06-14', 2026)).toBe('2026-06-14');
    });

    it('is 28 February for someone born on the 29th, the years without one', () => {
        expect(birthdayIn('2016-02-29', 2027)).toBe('2027-02-28');
        expect(birthdayIn('2016-02-29', 2028)).toBe('2028-02-29');
        // 2100 is not a leap year, 2000 was.
        expect(birthdayIn('2016-02-29', 2100)).toBe('2100-02-28');
        expect(birthdayIn('1996-02-29', 2000)).toBe('2000-02-29');
    });

    it('comes with the age reached, in the order of the calendar, and not before the first one', async () => {
        await addMember('Zoé', '2018-06-14');
        await addMember('Alex', '1984-06-14');
        await addMember('Mia', '2026-03-01');
        await addMember('No date', null);

        const year = await birthdaysBetween(parent.user.id, '2026-01-01', '2026-12-31');
        // Mia was born in 2026: her first birthday is in 2027.
        expect(year.map((b) => [b.name, b.date, b.age])).toEqual([['Alex', '2026-06-14', 42], ['Zoé', '2026-06-14', 8]]);

        const twoYears = await birthdaysBetween(parent.user.id, '2026-06-15T00:00:00', '2027-06-14T23:59:59');
        expect(twoYears.map((b) => [b.name, b.date, b.age])).toEqual([
            ['Mia', '2027-03-01', 1], ['Alex', '2027-06-14', 43], ['Zoé', '2027-06-14', 9],
        ]);
        expect(await birthdaysBetween(parent.user.id, 'soon', 'later')).toEqual([]);
    });
});

describe('birthdays in the calendar', () => {
    it('come with the appointments of the range, as whole days', async () => {
        const zoe = await addMember('Zoé', '2018-06-14');
        await request(app).post('/api/appointments').set(bearer(parent.token))
            .send({ title: 'Dentist', start_time: '2026-06-14T09:30:00', end_time: '2026-06-14T10:00:00' });

        const listed = await appointments('start_date=2026-06-01T00:00:00&end_date=2026-06-30T23:59:59');
        expect(listed.status).toBe(200);
        expect(listed.body.data.map((entry: { title: string }) => entry.title)).toEqual(['Anniversaire de Zoé', 'Dentist']);
        expect(listed.body.data[0]).toMatchObject({
            id: `birthday-${zoe}`,
            occurrence_id: `birthday-${zoe}-2026`,
            kind: 'birthday',
            is_all_day: true,
            start_time: '2026-06-14T00:00:00',
            end_time: '2026-06-14T23:59:00',
            color: '#16A34A',
            family_member_ids: [zoe],
            family_members_data: [{ id: zoe, name: 'Zoé', color: '#16A34A' }],
            birthday: { member_id: zoe, name: 'Zoé', age: 8, birth_date: '2018-06-14' },
        });
        // An appointment is not one.
        expect(listed.body.data[1].kind).toBeUndefined();
    });

    it("are titled in the language of the family's owner", async () => {
        await addMember('Zoé', '2018-06-14');
        const titleIn = async (language: string) => {
            await request(app).put('/api/auth/language').set(bearer(parent.token)).send({ language });
            return (await appointments('start_date=2026-06-14T00:00:00&end_date=2026-06-14T23:59:59')).body.data[0].title;
        };
        expect(await titleIn('en')).toBe("Zoé's birthday");
        expect(await titleIn('de')).toBe('Geburtstag von Zoé');
        // A language the server has no texts for: English.
        expect(await titleIn('it')).toBe("Zoé's birthday");
    });

    it('belong to one family only, and are not listed without a range', async () => {
        await addMember('Zoé', '2018-06-14');
        const other = await registerWithPassword('other@example.org');
        expect((await appointments('start_date=2026-06-01T00:00:00&end_date=2026-06-30T23:59:59', other.token)).body.data).toEqual([]);
        expect((await appointments('')).body.data).toEqual([]);
    });

    it('cannot be changed or deleted: the date of birth is on the Family page', async () => {
        const zoe = await addMember('Zoé', '2018-06-14');
        for (const call of [
            request(app).put(`/api/appointments/birthday-${zoe}`).send({ title: 'Party' }),
            request(app).delete(`/api/appointments/birthday-${zoe}`),
            request(app).put(`/api/appointments/birthday-${zoe}/occurrences/2026-06-14`).send({ title: 'Party' }),
            request(app).delete(`/api/appointments/birthday-${zoe}/occurrences/2026-06-14`),
        ]) {
            const answer = await call.set(bearer(parent.token));
            expect(answer.status).toBe(409);
            expect(answer.body.error).toBe('birthday_read_only');
        }
        // Changing the date of birth moves the birthday.
        await request(app).put(`/api/family/${zoe}`).set(bearer(parent.token)).send({ birthdate: '2018-07-02' });
        expect((await appointments('start_date=2026-06-01T00:00:00&end_date=2026-06-30T23:59:59')).body.data).toEqual([]);
        expect((await appointments('start_date=2026-07-01T00:00:00&end_date=2026-07-31T23:59:59')).body.data[0].start_time).toBe('2026-07-02T00:00:00');
    });

    it('are in the calendar feed as whole days, and on a display', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const zoe = await addMember('Zoé', `2018-${today.slice(5)}`);
        await request(app).put('/api/auth/timezone').set(bearer(parent.token)).send({ timezone: 'UTC' });

        const token = (await request(app).get('/api/calendar/token').set(bearer(parent.token))).body.data.token;
        const feed = (await request(app).get(`/api/calendar/${token}/openfamily.ics`)).text;
        const year = today.slice(0, 4);
        const event = feed.split('BEGIN:VEVENT').find((part) => part.includes(`UID:birthday-${zoe}-${year}@openfamily`));
        expect(event).toBeDefined();
        expect(event).toContain(`DTSTART;VALUE=DATE:${today.replace(/-/g, '')}`);
        expect(event).toContain('SUMMARY:Anniversaire de Zoé');

        const snapshot = await loadDisplaySnapshot(parent.user.id);
        expect(snapshot.appointmentsToday.map((entry) => [entry.title, entry.allDay])).toEqual([['Anniversaire de Zoé', true]]);
    });
});

describe('the notice of the day', () => {
    const invited = async (email: string, language: string) => {
        const created = await query(
            `INSERT INTO users (email, name, role, family_owner_id, language) VALUES ($1, 'Member', 'parent', $2, $3)
             RETURNING id, family_owner_id, token_version`,
            [email, parent.user.id, language],
        );
        return { id: created.rows[0].id as string, token: issueAccessToken(created.rows[0]) };
    };

    it("tells every account of the family once, in its language, on the morning of the family's clocks", async () => {
        const zoe = await addMember('Zoé', '2018-06-14');
        await addMember('Alex', '1984-09-30');
        const member = await invited('member@example.org', 'en');
        const stranger = await registerWithPassword('stranger@example.org');
        await request(app).put('/api/auth/timezone').set(bearer(parent.token)).send({ timezone: 'Asia/Tokyo' });

        // 14 June, 07:59 in Tokyo: too early.
        await checkBirthdays(new Date('2026-06-13T22:59:00Z'));
        expect(await notices(parent.user.id)).toEqual([]);

        // 08:00 in Tokyo, while it is still the 13th in UTC.
        await checkBirthdays(new Date('2026-06-13T23:00:00Z'));
        expect(await notices(parent.user.id)).toEqual([{ title: 'Anniversaire de Zoé', message: "C'est aujourd'hui !", related_id: zoe }]);
        expect(await notices(member.id)).toEqual([{ title: "Zoé's birthday", message: 'It is today!', related_id: zoe }]);
        expect(await notices(stranger.user.id)).toEqual([]);

        // Later the same day, and the next pass: nobody is told twice.
        await checkBirthdays(new Date('2026-06-14T03:00:00Z'));
        await checkBirthdays(new Date('2026-06-14T03:10:00Z'));
        expect((await notices(parent.user.id)).length).toBe(1);
        expect((await notices(member.id)).length).toBe(1);

        // The year after, again.
        await checkBirthdays(new Date('2027-06-14T01:00:00Z'));
        expect((await notices(parent.user.id)).length).toBe(2);
    });

    it('is not sent in the evening by a server that was off all day, nor on the day of birth itself', async () => {
        await addMember('Zoé', '2018-06-14');
        await addMember('Newborn', '2026-06-14');
        await request(app).put('/api/auth/timezone').set(bearer(parent.token)).send({ timezone: 'UTC' });

        await checkBirthdays(new Date('2026-06-14T20:00:00Z'));
        expect(await notices(parent.user.id)).toEqual([]);
        await checkBirthdays(new Date('2026-06-14T19:59:00Z'));
        expect((await notices(parent.user.id)).map((row: { title: string }) => row.title)).toEqual(['Anniversaire de Zoé']);
    });

    it('is sent on 28 February for someone born on the 29th, the years without one', async () => {
        await addMember('Leap', '2016-02-29');
        await request(app).put('/api/auth/timezone').set(bearer(parent.token)).send({ timezone: 'UTC' });

        await checkBirthdays(new Date('2027-02-28T09:00:00Z'));
        expect((await notices(parent.user.id)).length).toBe(1);
        // In a leap year: on the 29th, not the 28th.
        await checkBirthdays(new Date('2028-02-28T09:00:00Z'));
        expect((await notices(parent.user.id)).length).toBe(1);
        await checkBirthdays(new Date('2028-02-29T09:00:00Z'));
        expect((await notices(parent.user.id)).length).toBe(2);
    });
});
