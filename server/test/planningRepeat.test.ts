import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';

// Weekly planning, every N weeks (issue #150): an entry repeats every week,
// or every N weeks counted from the date of its first occurrence.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };
let mia: string;

beforeEach(async () => {
    await resetState();
    parent = await registerWithPassword('parent@example.org');
    mia = (await query(
        "INSERT INTO family_members (user_id, name, color) VALUES ($1, 'Mia', '#16A34A') RETURNING id", [parent.user.id],
    )).rows[0].id;
});

const bearer = { get Authorization() { return `Bearer ${parent.token}`; } };
const entry = (extra: Record<string, unknown> = {}) => ({
    family_member_ids: [mia], schedule_type: 'activity', title: 'Swimming', day_of_week: 3,
    start_time: '17:00', end_time: '18:00', ...extra,
});
const create = (body: Record<string, unknown>) => request(app).post('/api/planning').set(bearer).send(body);
const week = async (start: string) =>
    ((await request(app).get(`/api/planning?week_start=${start}`).set(bearer)).body.data as { title: string }[]).map((e) => e.title);

describe('an entry every two weeks', () => {
    it('is in the weeks it falls on, from its first one, and not before', async () => {
        // Wednesday 25 November 2026, then every other Wednesday.
        const created = await create(entry({ repeat_weeks: 2, repeat_from: '2026-11-25' }));
        expect(created.status).toBe(200);
        expect(created.body.data).toMatchObject({ repeat_weeks: 2, repeat_from: '2026-11-25', specific_date: null });

        expect(await week('2026-11-23')).toEqual(['Swimming']);
        expect(await week('2026-11-30')).toEqual([]);
        expect(await week('2026-12-07')).toEqual(['Swimming']);
        expect(await week('2026-12-14')).toEqual([]);
        expect(await week('2026-11-09')).toEqual([]);
    });

    it('counts the same whatever day the week shown starts on', async () => {
        await create(entry({ repeat_weeks: 2, repeat_from: '2026-11-25' }));
        // Weeks starting on Sunday: 22 November holds the 25th, 29 November does not.
        expect(await week('2026-11-22')).toEqual(['Swimming']);
        expect(await week('2026-11-29')).toEqual([]);
        expect(await week('2026-12-06')).toEqual(['Swimming']);
    });

    it('counts from the weekday of the entry, given any day of its first week', async () => {
        // The week of Monday 23: the entry is on Wednesday, so it starts on the 25th.
        const created = await create(entry({ repeat_weeks: 3, repeat_from: '2026-11-23' }));
        expect(created.body.data.repeat_from).toBe('2026-11-25');
        expect(await week('2026-12-14')).toEqual(['Swimming']);
        expect(await week('2026-12-07')).toEqual([]);
    });

    it('is every week without a number, a date to count from, or with nonsense', async () => {
        expect((await create(entry())).body.data).toMatchObject({ repeat_weeks: 1, repeat_from: null });
        await query('DELETE FROM schedule_entries');
        expect((await create(entry({ repeat_weeks: 2 }))).body.data).toMatchObject({ repeat_weeks: 1, repeat_from: null });
        await query('DELETE FROM schedule_entries');
        expect((await create(entry({ repeat_weeks: 400, repeat_from: '2026-11-25' }))).body.data.repeat_weeks).toBe(1);
    });
});

describe('two entries at the same time', () => {
    it('share the slot when they alternate: one week each', async () => {
        expect((await create(entry({ title: 'At Mum\'s', repeat_weeks: 2, repeat_from: '2026-11-25' }))).status).toBe(200);
        expect((await create(entry({ title: 'At Dad\'s', repeat_weeks: 2, repeat_from: '2026-12-02' }))).status).toBe(200);
        expect(await week('2026-11-23')).toEqual(['At Mum\'s']);
        expect(await week('2026-11-30')).toEqual(['At Dad\'s']);
    });

    it('clash when their weeks meet', async () => {
        await create(entry({ repeat_weeks: 2, repeat_from: '2026-11-25' }));
        // Same weeks.
        expect((await create(entry({ title: 'Judo', repeat_weeks: 2, repeat_from: '2026-12-09' }))).status).toBe(409);
        // Every week meets everything.
        expect((await create(entry({ title: 'Judo' }))).status).toBe(409);
        // Every three weeks meets every two weeks sooner or later.
        expect((await create(entry({ title: 'Judo', repeat_weeks: 3, repeat_from: '2026-12-02' }))).status).toBe(409);
        // A single date on an off week is free, on a week of the entry it is not.
        expect((await create(entry({ title: 'Dentist', specific_date: '2026-12-02' }))).status).toBe(200);
        expect((await create(entry({ title: 'Dentist', specific_date: '2026-12-09' }))).status).toBe(409);
    });
});

describe('changing an entry', () => {
    it('keeps its rhythm when only its title changes, and can go back to every week', async () => {
        const id = (await create(entry({ repeat_weeks: 2, repeat_from: '2026-11-25' }))).body.data.id as string;

        const renamed = await request(app).put(`/api/planning/${id}`).set(bearer).send({ title: 'Swimming club' });
        expect(renamed.body.data).toMatchObject({ title: 'Swimming club', repeat_weeks: 2, repeat_from: '2026-11-25' });

        const weekly = await request(app).put(`/api/planning/${id}`).set(bearer).send({ repeat_weeks: 1 });
        expect(weekly.body.data).toMatchObject({ repeat_weeks: 1, repeat_from: null });
        expect(await week('2026-11-30')).toEqual(['Swimming club']);
    });

    it('several days at once each count from their own date', async () => {
        const bulk = await request(app).post('/api/planning/bulk').set(bearer).send({
            family_member_ids: [mia], schedule_type: 'work', title: 'Night shift', day_of_week_list: [1, 5],
            start_time: '21:00', end_time: '05:00', repeat_weeks: 2, repeat_from: '2026-11-23',
        });
        expect(bulk.status).toBe(200);
        const rows = (await query('SELECT day_of_week, repeat_weeks, to_char(repeat_from, \'YYYY-MM-DD\') AS d FROM schedule_entries ORDER BY day_of_week')).rows;
        expect(rows).toEqual([
            { day_of_week: 1, repeat_weeks: 2, d: '2026-11-23' },
            { day_of_week: 5, repeat_weeks: 2, d: '2026-11-27' },
        ]);
        expect(await week('2026-11-30')).toEqual([]);
        expect(await week('2026-12-07')).toEqual(['Night shift', 'Night shift']);
    });
});
