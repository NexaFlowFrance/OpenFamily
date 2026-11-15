import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { apiTokenRefusal } from '../src/lib/apiTokens';
import { buildOpenApiDocument } from '../src/lib/openapi';

// The description of the API for other programs must not drift from the
// application: every operation it lists is called here, and every field it
// promises is looked for in a real answer.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };
let apiToken: string;

beforeEach(async () => {
    await resetState();
    parent = await registerWithPassword('parent@example.org');
    const made = await request(app).post('/api/api-tokens')
        .set('Authorization', `Bearer ${parent.token}`).send({ name: 'Docs', scope: 'write' });
    apiToken = made.body.data.token as string;
});

type Json = Record<string, any>;
const document = buildOpenApiDocument() as Json;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const operations = Object.entries(document.paths as Json).flatMap(([route, item]) =>
    METHODS.filter((method) => item[method]).map((method) => ({ route, method, operation: item[method] as Json })));

const concrete = (route: string): string =>
    route.replace('{id}', crypto.randomUUID()).replace('{token}', 'x'.repeat(43));

const call = (method: typeof METHODS[number], route: string, token?: string) => {
    let req = request(app)[method](concrete(route));
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return method === 'get' || method === 'delete' ? req : req.send({});
};

describe('the OpenAPI document', () => {
    it('is served to anyone, as OpenAPI 3.1, at the version of the server', async () => {
        const served = await request(app).get('/api/openapi.json');
        expect(served.status).toBe(200);
        expect(served.headers['content-type']).toMatch(/application\/json/);
        expect(served.body.openapi).toBe('3.1.0');
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
        expect(served.body.info.version).toBe(pkg.version);
        expect(served.body).toEqual(JSON.parse(JSON.stringify(document)));
    });

    it('only points at schemas and answers it defines, and defines none it does not use', () => {
        const text = JSON.stringify(document);
        const used = new Set([...text.matchAll(/"\$ref":"#\/components\/(schemas|responses)\/([^"]+)"/g)].map((m) => `${m[1]}/${m[2]}`));
        const defined = new Set([
            ...Object.keys(document.components.schemas).map((name) => `schemas/${name}`),
            ...Object.keys(document.components.responses).map((name) => `responses/${name}`),
        ]);
        expect([...used].filter((name) => !defined.has(name))).toEqual([]);
        expect([...defined].filter((name) => !used.has(name))).toEqual([]);
    });

    it('lists a good part of the API', () => {
        expect(operations.length).toBeGreaterThan(25);
        for (const route of ['/api/shopping', '/api/tasks', '/api/appointments', '/api/auth/me']) {
            expect(document.paths[route], route).toBeDefined();
        }
        for (const { route, method, operation } of operations) {
            expect(operation.summary, `${method} ${route}`).toBeTruthy();
            expect(operation.tags?.length, `${method} ${route}`).toBe(1);
        }
    });
});

describe('every operation in the document', () => {
    it.each(operations.map(({ route, method, operation }) => [method, route, operation] as const))(
        '%s %s exists and is open to an API token',
        async (method, route, operation) => {
            const open = Array.isArray(operation.security) && operation.security.length === 0;
            const answered = await call(method, route, open ? undefined : apiToken);
            // The application's own answer to an address it does not know.
            expect(answered.body?.error).not.toBe('Route not found');
            if (!open) {
                expect(answered.status).not.toBe(401);
                expect(answered.body?.error).not.toBe('api_token_forbidden');
                expect(apiTokenRefusal(method, concrete(route), 'write')).toBeNull();
                // And it does need the token.
                expect((await call(method, route)).status).toBe(401);
            }
        },
    );
});

describe('the fields the document promises', () => {
    const bearer = () => ({ Authorization: `Bearer ${apiToken}` });
    const promised = (schema: string, except: string[] = []): string[] =>
        Object.keys(document.components.schemas[schema].properties).filter((name) => !except.includes(name));
    const missing = (schema: string, real: Json, except: string[] = []): string[] =>
        promised(schema, except).filter((name) => !(name in real));

    it('are in the real answers', async () => {
        const me = await request(app).get('/api/auth/me').set(bearer());
        expect(missing('Account', me.body.data.user)).toEqual([]);

        const item = await request(app).post('/api/shopping').set(bearer()).send({ name: 'Milk', category: 'Autre', quantity: 2, unit: 'L' });
        expect(missing('ShoppingItem', item.body.data)).toEqual([]);

        const member = await query("INSERT INTO family_members (user_id, name, color) VALUES ($1, 'Mia', '#16A34A') RETURNING id", [parent.user.id]);
        const members = await request(app).get('/api/family').set(bearer());
        expect(missing('FamilyMember', members.body.data[0])).toEqual([]);

        const task = await request(app).post('/api/tasks').set(bearer()).send({ title: 'Trash', due_date: '2026-12-01', assigned_to: [member.rows[0].id] });
        expect(missing('Task', task.body.data)).toEqual([]);

        await request(app).post('/api/appointments').set(bearer())
            .send({ title: 'Choir', start_time: '2026-12-01T18:00:00', end_time: '2026-12-01T19:00:00', recurrence_frequency: 'weekly', family_member_ids: [member.rows[0].id] });
        const listed = await request(app).get('/api/appointments?start_date=2026-12-01T00:00:00&end_date=2026-12-10T23:59:59').set(bearer());
        expect(listed.body.data.length).toBe(2);
        // A weekly series over ten days: two occurrences, each with its own identity.
        expect(missing('Appointment', listed.body.data[0])).toEqual([]);
        expect(listed.body.data.map((entry: Json) => entry.occurrence_date)).toEqual(['2026-12-01', '2026-12-08']);

        const meal = await request(app).post('/api/meal-plans').set(bearer()).send({ date: '2026-12-01', meal_type: 'Dîner', custom_meal: 'Lasagna' });
        expect(missing('MealPlan', meal.body.data)).toEqual([]);

        const note = await request(app).post('/api/notes').set(bearer()).send({ content: 'Buy stamps' });
        expect(missing('Note', note.body.data)).toEqual([]);

        await query(
            "INSERT INTO recipes (user_id, name, category, ingredients, instructions) VALUES ($1, 'Lasagna', 'Plat', '[]'::jsonb, '[]'::jsonb)",
            [parent.user.id],
        );
        const recipes = await request(app).get('/api/recipes').set(bearer());
        expect(missing('Recipe', recipes.body.data[0])).toEqual([]);

        const member2 = member.rows[0].id as string;
        await query(
            `INSERT INTO schedule_entries (user_id, family_member_id, schedule_type, title, day_of_week, start_time, end_time)
             VALUES ($1, $2, 'work', 'Office', 1, '09:00', '17:30')`,
            [parent.user.id, member2],
        );
        const planning = await request(app).get('/api/planning').set(bearer());
        expect(missing('PlanningEntry', planning.body.data[0])).toEqual([]);
    });

    it('accepts what the input schemas describe', async () => {
        // Every property of an input schema is one the route reads: sending them all works.
        const item = await request(app).post('/api/shopping').set(bearer())
            .send({ name: 'Milk', category: 'Autre', quantity: 2, unit: 'L', price: 1.2, notes: 'Organic' });
        expect(item.status).toBe(200);
        const changed = await request(app).put(`/api/shopping/${item.body.data.id}`).set(bearer()).send({ is_checked: true });
        expect(changed.body.data.is_checked).toBe(true);

        const task = await request(app).post('/api/tasks').set(bearer()).send({ title: 'Trash', description: 'Bins', due_date: '2026-12-01', points: 2 });
        expect(task.status).toBe(200);
        const done = await request(app).put(`/api/tasks/${task.body.data.id}`).set(bearer()).send({ is_completed: true });
        expect(done.body.data.is_completed).toBe(true);
    });
});
