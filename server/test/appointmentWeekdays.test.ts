import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { normalizeRecurrenceWeekdays } from '../src/lib/appointmentRecurrence';

// A weekly appointment on chosen weekdays (issue #150): Monday to Friday, the
// weekend, or any set of days, every week or every N weeks.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };
beforeEach(async () => {
    await resetState();
    parent = await registerWithPassword('parent@example.org');
});

const bearer = { get Authorization() { return `Bearer ${parent.token}`; } };
const create = (body: Record<string, unknown>) => request(app).post('/api/appointments').set(bearer).send({
    title: 'School run', start_time: '2026-11-25T08:15:00', end_time: '2026-11-25T08:45:00', recurrence_frequency: 'weekly', ...body,
});
const days = async (from: string, to: string) => ((await request(app)
    .get(`/api/appointments?start_date=${from}T00:00:00&end_date=${to}T23:59:59`).set(bearer)).body.data as { start_time: string }[])
    .map((a) => a.start_time.slice(0, 16));

describe('the weekdays of a weekly appointment', () => {
    it('are kept sorted, each once, and ignored when they mean nothing', () => {
        expect(normalizeRecurrenceWeekdays([5, 1, 1, 3])).toEqual([1, 3, 5]);
        expect(normalizeRecurrenceWeekdays([0, 8, 'x'])).toBeNull();
        expect(normalizeRecurrenceWeekdays([])).toBeNull();
        expect(normalizeRecurrenceWeekdays('1,2')).toBeNull();
    });

    it('Monday to Friday, starting on a Wednesday', async () => {
        const created = await create({ recurrence_weekdays: [1, 2, 3, 4, 5] });
        expect(created.status).toBe(200);
        expect(created.body.data.recurrence_weekdays).toEqual([1, 2, 3, 4, 5]);

        // Wednesday 25 November 2026 to Tuesday 8 December: no weekend, nothing before the start.
        expect(await days('2026-11-23', '2026-12-08')).toEqual([
            '2026-11-25T08:15', '2026-11-26T08:15', '2026-11-27T08:15',
            '2026-11-30T08:15', '2026-12-01T08:15', '2026-12-02T08:15', '2026-12-03T08:15', '2026-12-04T08:15',
            '2026-12-07T08:15', '2026-12-08T08:15',
        ]);
    });

    it('the weekend only, even when the series is created on a weekday', async () => {
        await create({ title: 'Market', recurrence_weekdays: [6, 7] });
        expect(await days('2026-11-23', '2026-12-06')).toEqual([
            '2026-11-28T08:15', '2026-11-29T08:15', '2026-12-05T08:15', '2026-12-06T08:15',
        ]);
    });

    it('every two weeks on Monday and Wednesday counts weeks from the first one, as calendars do', async () => {
        await create({ recurrence_weekdays: [1, 3], recurrence_interval: 2 });
        // The Wednesday of the start, then the Monday and Wednesday two weeks later.
        expect(await days('2026-11-23', '2026-12-23')).toEqual([
            '2026-11-25T08:15', '2026-12-07T08:15', '2026-12-09T08:15', '2026-12-21T08:15', '2026-12-23T08:15',
        ]);
    });

    it('stops at the end date, and one day can be skipped like any occurrence', async () => {
        const id = (await create({ recurrence_weekdays: [1, 2, 3, 4, 5], recurrence_until: '2026-12-01' })).body.data.id as string;
        expect(await days('2026-11-23', '2026-12-08')).toEqual([
            '2026-11-25T08:15', '2026-11-26T08:15', '2026-11-27T08:15', '2026-11-30T08:15', '2026-12-01T08:15',
        ]);
        const all = (await request(app).get('/api/appointments?start_date=2026-11-26T00:00:00&end_date=2026-11-26T23:59:59').set(bearer)).body.data;
        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({ series_id: id, occurrence_date: '2026-11-26' });
    });

    it('without chosen days a weekly appointment stays on its weekday, and other frequencies drop them', async () => {
        await create({ title: 'Piano' });
        expect(await days('2026-11-23', '2026-12-09')).toEqual(['2026-11-25T08:15', '2026-12-02T08:15', '2026-12-09T08:15']);

        const daily = await create({ title: 'Pills', recurrence_frequency: 'daily', recurrence_weekdays: [1] });
        expect(daily.body.data.recurrence_weekdays).toBeNull();
    });

    it('can be changed, and goes away with the weekly frequency', async () => {
        const id = (await create({ recurrence_weekdays: [1, 2, 3, 4, 5] })).body.data.id as string;
        const put = (body: Record<string, unknown>) => request(app).put(`/api/appointments/${id}`).set(bearer).send(body);

        expect((await put({ recurrence_weekdays: [6, 7] })).body.data.recurrence_weekdays).toEqual([6, 7]);
        expect((await put({ title: 'Renamed' })).body.data.recurrence_weekdays).toEqual([6, 7]);
        expect((await put({ recurrence_frequency: 'monthly' })).body.data.recurrence_weekdays).toBeNull();
    });
});
