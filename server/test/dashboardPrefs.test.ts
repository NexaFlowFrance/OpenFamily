import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { completeWidgetOrder, DASHBOARD_WIDGETS } from '../src/routes/userSettings';

// The layout of the home page, kept per account. A layout saved before a card
// existed must get that card where it belongs, and what the member chose to
// hide or to show must never be undone by a new version.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };

beforeEach(async () => {
    await resetState();
    parent = await registerWithPassword('parent@example.org');
});

const bearer = () => ({ Authorization: `Bearer ${parent.token}` });
const read = async () => (await request(app).get('/api/auth/dashboard-prefs').set(bearer())).body.data;
const saved = (prefs: unknown) => query('UPDATE users SET dashboard_prefs = $1 WHERE id = $2', [JSON.stringify(prefs), parent.user.id]);

describe('the layout of the home page', () => {
    it('starts with every card in its place, and the quick access tiles put away', async () => {
        expect(await read()).toEqual({
            order: ['stats', 'agenda', 'tasks', 'meals', 'shopping', 'birthdays', 'pantry', 'planning', 'quick', 'notes'],
            hidden: ['quick'],
            agendaView: 'day',
        });
    });

    it('gives a layout saved before the small cards their place under the agenda', async () => {
        // What every account that customised its home page before 2.3 holds.
        await saved({ order: ['stats', 'agenda', 'planning', 'quick', 'notes'], hidden: [], agendaView: 'week' });
        expect(await read()).toEqual({
            order: ['stats', 'agenda', 'tasks', 'meals', 'shopping', 'birthdays', 'pantry', 'planning', 'quick', 'notes'],
            // They had the quick access tiles on show: they still do.
            hidden: [],
            agendaView: 'week',
        });
    });

    it("keeps the member's own order around the cards it adds", async () => {
        await saved({ order: ['notes', 'agenda', 'stats'], hidden: ['stats'], agendaView: 'day' });
        const prefs = await read();
        expect(prefs.order).toEqual(['notes', 'agenda', 'tasks', 'meals', 'shopping', 'birthdays', 'pantry', 'planning', 'quick', 'stats']);
        expect(prefs.hidden).toEqual(['stats']);
    });

    it('places a card whose neighbours are all unknown at the top', () => {
        expect(completeWidgetOrder([])).toEqual([...DASHBOARD_WIDGETS]);
        expect(completeWidgetOrder(['notes'])[0]).toBe('stats');
        expect(new Set(completeWidgetOrder(['notes', 'quick']))).toEqual(new Set(DASHBOARD_WIDGETS));
    });

    it('saves what is sent, without the cards it does not know', async () => {
        const answer = await request(app).put('/api/auth/dashboard-prefs').set(bearer())
            .send({ order: ['pantry', 'made-up', 'agenda', 'pantry'], hidden: ['birthdays', 'made-up'], agendaView: 'week' });
        expect(answer.status).toBe(200);
        const order: string[] = answer.body.data.order;
        // The member put the pantry before the agenda: it stays before it, the
        // card nobody knows is gone, and the one sent twice is there once.
        expect(order.indexOf('pantry')).toBeLessThan(order.indexOf('agenda'));
        expect(order).not.toContain('made-up');
        expect(new Set(order).size).toBe(order.length);
        expect(order.length).toBe(DASHBOARD_WIDGETS.length);
        expect(answer.body.data.hidden).toEqual(['birthdays']);
        expect(await read()).toEqual(answer.body.data);
    });
});
