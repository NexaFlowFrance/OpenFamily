import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { nextOccurrence, reopenRecurringTasks } from '../src/lib/taskRecurrence';
import { forgetFamilyTimeZones } from '../src/lib/timeZone';

// A recurring task is one row: ticking it does the current occurrence, and
// the row opens again when the next one starts, on the family's clocks.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };

beforeEach(async () => {
    await resetState();
    forgetFamilyTimeZones();
    parent = await registerWithPassword('parent@example.org');
    await query("UPDATE users SET timezone = 'Europe/London' WHERE id = $1", [parent.user.id]);
    forgetFamilyTimeZones();
});

const bearer = { get Authorization() { return `Bearer ${parent.token}`; } };
const create = async (body: Record<string, unknown>) =>
    (await request(app).post('/api/tasks').set(bearer).send(body)).body.data as { id: string };
const complete = (id: string, done = true) => request(app).put(`/api/tasks/${id}`).set(bearer).send({ is_completed: done });
/** Pretends the task was ticked at that instant. */
const completedAt = (id: string, instant: string) =>
    query("UPDATE tasks SET completed_at = ($2::timestamptz AT TIME ZONE current_setting('TimeZone')) WHERE id = $1", [id, instant]);
const row = async (id: string) => (await query(
    "SELECT is_completed, completed_at, to_char(due_date, 'YYYY-MM-DD') AS due FROM tasks WHERE id = $1", [id],
)).rows[0];
const member = async () => (await query(
    "INSERT INTO family_members (user_id, name, color) VALUES ($1, 'Mia', '#16A34A') RETURNING id", [parent.user.id],
)).rows[0].id as string;

describe('the next occurrence of a task', () => {
    it('does not exist for a task done once', () => {
        expect(nextOccurrence('Une fois', '2026-11-25', null)).toBeNull();
        expect(nextOccurrence(null, '2026-11-25', '2026-11-25')).toBeNull();
        expect(nextOccurrence('whatever', '2026-11-25', null)).toBeNull();
    });

    it('follows the calendar when the task has no due date', () => {
        expect(nextOccurrence('Quotidien', '2026-11-25', null)).toEqual({ opensOn: '2026-11-26', dueOn: null });
        // 25 November 2026 is a Wednesday: the next week starts on Monday 30.
        expect(nextOccurrence('Hebdomadaire', '2026-11-25', null)?.opensOn).toBe('2026-11-30');
        expect(nextOccurrence('Hebdomadaire', '2026-11-29', null)?.opensOn).toBe('2026-11-30');
        expect(nextOccurrence('Mensuel', '2026-11-25', null)?.opensOn).toBe('2026-12-01');
        expect(nextOccurrence('Mensuel', '2026-12-31', null)?.opensOn).toBe('2027-01-01');
        expect(nextOccurrence('Trimestriel', '2026-11-25', null)?.opensOn).toBe('2027-01-01');
        expect(nextOccurrence('Trimestriel', '2026-02-10', null)?.opensOn).toBe('2026-04-01');
        expect(nextOccurrence('Quadrimestriel', '2026-06-10', null)?.opensOn).toBe('2026-09-01');
        expect(nextOccurrence('Annuel', '2026-06-10', null)?.opensOn).toBe('2027-01-01');
    });

    it('follows the due date when there is one', () => {
        // Done on the day: back the next day, due that day.
        expect(nextOccurrence('Quotidien', '2026-11-25', '2026-11-25')).toEqual({ opensOn: '2026-11-26', dueOn: '2026-11-26' });
        // Done ahead of time: it stays done until its day has passed.
        expect(nextOccurrence('Hebdomadaire', '2026-11-25', '2026-11-27')).toEqual({ opensOn: '2026-11-28', dueOn: '2026-12-04' });
        // Done three weeks late: it does not come back already overdue.
        expect(nextOccurrence('Hebdomadaire', '2026-11-25', '2026-11-06')).toEqual({ opensOn: '2026-11-26', dueOn: '2026-11-27' });
        // The 31st does not exist every month.
        expect(nextOccurrence('Mensuel', '2026-01-31', '2026-01-31')).toEqual({ opensOn: '2026-02-01', dueOn: '2026-02-28' });
        expect(nextOccurrence('Annuel', '2026-03-01', '2026-03-01')?.dueOn).toBe('2027-03-01');
    });
});

describe('a daily chore', () => {
    it('is to do again the next day, and pays again, without taking back the points already earned', async () => {
        const mia = await member();
        const task = await create({ title: 'Empty the dishwasher', frequency: 'Quotidien', points: 10, assigned_to: [mia] });

        expect((await complete(task.id)).status).toBe(200);
        await completedAt(task.id, '2026-11-25T18:00:00Z');

        // Still the same day in London: nothing moves.
        expect(await reopenRecurringTasks(new Date('2026-11-25T23:30:00Z'), parent.user.id)).toBe(0);
        expect((await row(task.id)).is_completed).toBe(true);

        // Past midnight in London.
        expect(await reopenRecurringTasks(new Date('2026-11-26T00:05:00Z'), parent.user.id)).toBe(1);
        expect(await row(task.id)).toMatchObject({ is_completed: false, completed_at: null });

        expect((await complete(task.id)).status).toBe(200);
        const earned = await query("SELECT points FROM reward_transactions WHERE task_id = $1 AND type = 'earn'", [task.id]);
        expect(earned.rows.map((r) => r.points)).toEqual([10, 10]);
    });

    it('opens on the clocks of the family, not of the server', async () => {
        await query("UPDATE users SET timezone = 'Pacific/Auckland' WHERE id = $1", [parent.user.id]);
        forgetFamilyTimeZones();
        const task = await create({ title: 'Feed the cat', frequency: 'Quotidien' });
        await complete(task.id);
        // 25 November, 09:00 in Auckland.
        await completedAt(task.id, '2026-11-24T20:00:00Z');

        // 23:30 the same day in Auckland, 26 November 00:30 there.
        expect(await reopenRecurringTasks(new Date('2026-11-25T10:30:00Z'), parent.user.id)).toBe(0);
        expect(await reopenRecurringTasks(new Date('2026-11-25T11:30:00Z'), parent.user.id)).toBe(1);
    });

    it('is opened by reading the list, and by the scheduler for every family', async () => {
        const task = await create({ title: 'Water the plants', frequency: 'Quotidien' });
        await complete(task.id);
        await completedAt(task.id, '2026-01-01T12:00:00Z');

        const list = await request(app).get('/api/tasks').set(bearer);
        expect(list.body.data.find((t: { id: string }) => t.id === task.id).is_completed).toBe(false);

        await complete(task.id);
        await completedAt(task.id, '2026-01-01T12:00:00Z');
        expect(await reopenRecurringTasks()).toBe(1);
    });
});

describe('what is left alone', () => {
    it('a task done once stays done', async () => {
        const task = await create({ title: 'Renew the passport', frequency: 'Une fois' });
        await complete(task.id);
        await completedAt(task.id, '2026-01-01T12:00:00Z');
        expect(await reopenRecurringTasks(new Date('2026-11-25T12:00:00Z'))).toBe(0);
        expect((await row(task.id)).is_completed).toBe(true);
    });

    it('a chore waiting for a parent waits', async () => {
        const task = await create({ title: 'Tidy the bedroom', frequency: 'Quotidien' });
        await query("UPDATE tasks SET is_completed = true, pending_approval = true, completed_at = '2026-01-01 12:00:00' WHERE id = $1", [task.id]);
        expect(await reopenRecurringTasks(new Date('2026-11-25T12:00:00Z'))).toBe(0);
        expect((await row(task.id)).is_completed).toBe(true);
    });

    it('a weekly task with a due date keeps its weekday', async () => {
        const task = await create({ title: 'Take out the bins', frequency: 'Hebdomadaire', due_date: '2026-11-27' });
        await complete(task.id);
        await completedAt(task.id, '2026-11-25T18:00:00Z');

        expect(await reopenRecurringTasks(new Date('2026-11-27T12:00:00Z'), parent.user.id)).toBe(0);
        expect(await reopenRecurringTasks(new Date('2026-11-28T08:00:00Z'), parent.user.id)).toBe(1);
        expect(await row(task.id)).toMatchObject({ is_completed: false, due: '2026-12-04' });
    });
});
