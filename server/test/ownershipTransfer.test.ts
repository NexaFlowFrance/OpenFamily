import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { issueAccessToken } from '../src/lib/authTokens';
import { ACCOUNT_REFERENCES, FAMILY_TABLES, FAMILY_USER_COLUMNS, MEMBERSHIP_REFERENCES } from '../src/lib/familyData';

// Handing a family to another member: everything the family owns follows,
// whatever table or column it lives in.

beforeAll(startSuite);
afterAll(stopSuite);

let owner: { token: string; user: { id: string } };
let member: { id: string; token: string };

beforeEach(async () => {
    await resetState();
    owner = await registerWithPassword('owner@example.org');
    const created = await query(
        `INSERT INTO users (email, name, role, family_owner_id) VALUES ('member@example.org', 'Member', 'parent', $1)
         RETURNING id, family_owner_id, token_version`,
        [owner.user.id],
    );
    member = { id: created.rows[0].id as string, token: issueAccessToken(created.rows[0]) };
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const transfer = () =>
    request(app).post('/api/invites/transfer-ownership').set(bearer(owner.token)).send({ newOwnerId: member.id });

/** The session of the new owner after the transfer signed everyone out. */
const newOwnerSession = async (): Promise<string> => {
    const row = await query('SELECT id, family_owner_id, token_version FROM users WHERE id = $1', [member.id]);
    return issueAccessToken(row.rows[0]);
};

describe('what the code says a family owns', () => {
    it('classifies every reference to an account: nothing can be forgotten', async () => {
        const references = await query(
            `SELECT cl.relname AS "table", att.attname AS "column"
             FROM pg_constraint con
             JOIN pg_class cl ON cl.oid = con.conrelid
             JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
             WHERE con.contype = 'f' AND con.confrelid = 'users'::regclass`,
        );
        const known = new Set([
            ...FAMILY_TABLES.map((entry) => `${entry.table}.${entry.column}`),
            ...ACCOUNT_REFERENCES,
            ...MEMBERSHIP_REFERENCES,
        ]);
        const unclassified = references.rows
            .map((row: { table: string; column: string }) => `${row.table}.${row.column}`)
            .filter((reference: string) => !known.has(reference));
        // A new table that references users: say in lib/familyData.ts whether it
        // is the family's (it moves on an ownership transfer) or an account's.
        expect(unclassified).toEqual([]);
        expect(references.rows.length).toBeGreaterThan(30);
    });

    it('names only tables and columns that exist', async () => {
        for (const { table, column } of FAMILY_TABLES) {
            await expect(query(`SELECT ${column} FROM ${table} LIMIT 0`)).resolves.toBeDefined();
        }
        await expect(
            query(`SELECT ${FAMILY_USER_COLUMNS.map((entry) => entry.column).join(', ')} FROM users LIMIT 0`),
        ).resolves.toBeDefined();
    });
});

describe('transferring a family', () => {
    it('moves the notes, integrations, AI settings, followed calendars and Kakeibo months', async () => {
        const id = owner.user.id;
        await query("INSERT INTO family_notes (user_id, author_name, content) VALUES ($1, 'Alex', 'Buy stamps')", [id]);
        await query("INSERT INTO integrations (family_id, type, base_url) VALUES ($1, 'mealie', 'http://mealie.test')", [id]);
        await query("INSERT INTO ai_settings (user_id, provider, model) VALUES ($1, 'ollama', 'qwen')", [id]);
        const subscription = await query(
            `INSERT INTO calendar_subscriptions (user_id, name, encrypted_url, url_host)
             VALUES ($1, 'School', 'x', 'school.test') RETURNING id`,
            [id],
        );
        await query(
            `INSERT INTO appointments (user_id, title, start_time, subscription_id) VALUES ($1, 'Parents evening', '2026-12-01T18:00:00', $2)`,
            [id, subscription.rows[0].id],
        );
        await query('INSERT INTO kakeibo_months (user_id, month, year, savings_goal) VALUES ($1, 11, 2026, 200)', [id]);

        expect((await transfer()).status).toBe(200);

        for (const { table, column } of FAMILY_TABLES) {
            const left = await query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [id]);
            expect(left.rows[0].n, `${table} still holds rows of the former owner`).toBe(0);
        }
        const count = async (table: string, column = 'user_id') =>
            (await query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [member.id])).rows[0].n;
        expect(await count('family_notes')).toBe(1);
        expect(await count('integrations', 'family_id')).toBe(1);
        expect(await count('ai_settings')).toBe(1);
        expect(await count('calendar_subscriptions')).toBe(1);
        expect(await count('kakeibo_months')).toBe(1);

        // And the family reads them as before, through its new owner.
        const session = await newOwnerSession();
        const notes = await request(app).get('/api/notes').set(bearer(session));
        expect(notes.body.data.map((note: { content: string }) => note.content)).toEqual(['Buy stamps']);
        const subscriptions = await request(app).get('/api/calendar/subscriptions').set(bearer(session));
        expect(subscriptions.body.data.map((entry: { name: string }) => entry.name)).toEqual(['School']);
        const integrations = await request(app).get('/api/integrations').set(bearer(session));
        expect(integrations.body.data.map((entry: { type: string }) => entry.type)).toEqual(['mealie']);
    });

    it('moves the family-wide settings kept on the owner: modules, categories, Kakeibo pillars', async () => {
        await query(
            `UPDATE users SET disabled_modules = '["budget"]', custom_categories = '{"shopping":["Bio"]}',
                              kakeibo_pillars = '{"Loisirs":"wants"}' WHERE id = $1`,
            [owner.user.id],
        );
        expect((await transfer()).status).toBe(200);

        const rows = await query(
            'SELECT id, disabled_modules, custom_categories, kakeibo_pillars FROM users WHERE id = ANY($1::uuid[])',
            [[owner.user.id, member.id]],
        );
        const byId = new Map(rows.rows.map((row: { id: string }) => [row.id, row]));
        expect(byId.get(member.id)).toMatchObject({
            disabled_modules: '["budget"]',
            custom_categories: '{"shopping":["Bio"]}',
            kakeibo_pillars: '{"Loisirs":"wants"}',
        });
        expect(byId.get(owner.user.id)).toMatchObject({ disabled_modules: '[]', custom_categories: null, kakeibo_pillars: null });

        const me = await request(app).get('/api/auth/me').set(bearer(await newOwnerSession()));
        expect(me.body.data.user.disabled_modules).toEqual(['budget']);
    });

    it("keeps the family's calendar feed address working", async () => {
        const token = (await request(app).get('/api/calendar/token').set(bearer(owner.token))).body.data.token as string;
        await query("INSERT INTO appointments (user_id, title, start_time) VALUES ($1, 'Dentist', '2026-12-01T09:30:00')", [owner.user.id]);
        const feed = () => request(app).get(`/api/calendar/${token}/openfamily.ics`);
        expect((await feed()).text).toContain('Dentist');

        expect((await transfer()).status).toBe(200);

        const after = await feed();
        expect(after.status).toBe(200);
        expect(after.text).toContain('Dentist');
        // The address shown in Settings is still the same one.
        const shown = await request(app).get('/api/calendar/token').set(bearer(await newOwnerSession()));
        expect(shown.body.data.token).toBe(token);
    });

    it('leaves what belongs to an account with that account', async () => {
        await query("INSERT INTO notifications (user_id, title, message, type) VALUES ($1, 'Hello', 'For the former owner', 'info')", [owner.user.id]);
        expect((await transfer()).status).toBe(200);
        const mine = await query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1', [owner.user.id]);
        expect(mine.rows[0].n).toBe(1);
    });

    it('drops what the new owner had before joining, so that it cannot clash', async () => {
        // A settings row of their own, from when they used OpenFamily alone.
        await query("INSERT INTO ai_settings (user_id, provider, model) VALUES ($1, 'ollama', 'old')", [member.id]);
        await query("INSERT INTO ai_settings (user_id, provider, model) VALUES ($1, 'ollama', 'family')", [owner.user.id]);
        expect((await transfer()).status).toBe(200);
        const settings = await query('SELECT user_id, model FROM ai_settings');
        expect(settings.rows).toEqual([{ user_id: member.id, model: 'family' }]);
    });
});
