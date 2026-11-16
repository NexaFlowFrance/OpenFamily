import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { setBarcodeFetcherForTests } from '../src/lib/barcodeLookup';
import { onBroadcast } from '../src/lib/broadcaster';

// The pantry: what the family has at home, where, and until when it is good.
// A barcode can name a product: the family's own pantry answers first, then
// Open Food Facts, which only ever receives the digits of the barcode.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };
const told: string[] = [];
onBroadcast((_userId, data) => { if (data.entity === 'pantry') told.push(data.action); });

beforeEach(async () => {
    await resetState();
    told.length = 0;
    parent = await registerWithPassword('parent@example.org');
});
afterEach(() => setBarcodeFetcherForTests(null));

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const add = (body: unknown, token = parent.token) => request(app).post('/api/pantry').set(bearer(token)).send(body as object);
const list = async (token = parent.token) => (await request(app).get('/api/pantry').set(bearer(token))).body.data as Array<Record<string, any>>;

describe('what is in the pantry', () => {
    it('is added with a name, and kept in the cupboard unless told otherwise', async () => {
        const added = await add({ name: '  Rice  ' });
        expect(added.status).toBe(200);
        expect(added.body.data).toMatchObject({ name: 'Rice', location: 'cupboard', quantity: null, unit: null, expires_on: null, barcode: null, notes: null });

        const full = await add({ name: 'Milk', quantity: '1,5', unit: 'L', location: 'fridge', expires_on: '2026-12-03', barcode: '3017620422003', notes: 'Half-skimmed' });
        expect(full.status).toBe(200);
        expect(full.body.data).toMatchObject({ name: 'Milk', quantity: '1.50', unit: 'L', location: 'fridge', expires_on: '2026-12-03', barcode: '3017620422003', notes: 'Half-skimmed' });
        expect(told).toEqual(['created', 'created']);
    });

    it('is listed with what is good for the shortest time first, and what has no date last', async () => {
        await add({ name: 'Rice' });
        await add({ name: 'Yoghurt', location: 'fridge', expires_on: '2026-12-10' });
        await add({ name: 'Ham', location: 'fridge', expires_on: '2026-12-02' });
        await add({ name: 'Apples' });
        expect((await list()).map((item) => item.name)).toEqual(['Ham', 'Yoghurt', 'Apples', 'Rice']);
    });

    it('is changed one field at a time, and a field sent empty is emptied', async () => {
        const item = (await add({ name: 'Milk', quantity: 2, unit: 'L', location: 'fridge', expires_on: '2026-12-03' })).body.data;

        const less = await request(app).put(`/api/pantry/${item.id}`).set(bearer(parent.token)).send({ quantity: 1 });
        expect(less.status).toBe(200);
        expect(less.body.data).toMatchObject({ name: 'Milk', quantity: '1.00', unit: 'L', location: 'fridge', expires_on: '2026-12-03' });

        const emptied = await request(app).put(`/api/pantry/${item.id}`).set(bearer(parent.token)).send({ expires_on: '', unit: null, location: 'freezer' });
        expect(emptied.body.data).toMatchObject({ quantity: '1.00', unit: null, location: 'freezer', expires_on: null });

        expect((await request(app).put(`/api/pantry/${item.id}`).set(bearer(parent.token)).send({})).status).toBe(400);
        expect(told).toEqual(['created', 'updated', 'updated']);
    });

    it('is removed', async () => {
        const item = (await add({ name: 'Milk' })).body.data;
        expect((await request(app).delete(`/api/pantry/${item.id}`).set(bearer(parent.token))).status).toBe(200);
        expect(await list()).toEqual([]);
        expect((await request(app).delete(`/api/pantry/${item.id}`).set(bearer(parent.token))).status).toBe(404);
        // An id that is not one is "not found", not an error of the server.
        expect((await request(app).delete('/api/pantry/not-an-id').set(bearer(parent.token))).status).toBe(404);
        expect((await request(app).put('/api/pantry/not-an-id').set(bearer(parent.token)).send({ name: 'x' })).status).toBe(404);
    });

    it.each([
        [{}],
        [{ name: '   ' }],
        [{ name: 'x'.repeat(256) }],
        [{ name: 'Milk', quantity: -1 }],
        [{ name: 'Milk', quantity: 'a lot' }],
        [{ name: 'Milk', location: 'garage' }],
        [{ name: 'Milk', expires_on: '2026-02-30' }],
        [{ name: 'Milk', expires_on: 'next week' }],
        [{ name: 'Milk', barcode: '12ab' }],
        [{ name: 'Milk', barcode: '123' }],
    ])('refuses %j', async (body) => {
        expect((await add(body)).status).toBe(400);
        expect(await list()).toEqual([]);
    });

    it('belongs to one family', async () => {
        const item = (await add({ name: 'Milk' })).body.data;
        const other = await registerWithPassword('other@example.org');
        expect(await list(other.token)).toEqual([]);
        expect((await request(app).put(`/api/pantry/${item.id}`).set(bearer(other.token)).send({ name: 'Theirs' })).status).toBe(404);
        expect((await request(app).delete(`/api/pantry/${item.id}`).set(bearer(other.token))).status).toBe(404);
        expect((await list())[0].name).toBe('Milk');
        expect((await request(app).get('/api/pantry')).status).toBe(401);
    });

    it('goes with the family into an export, and comes back from it', async () => {
        await add({ name: 'Milk', quantity: 2, unit: 'L', location: 'fridge', expires_on: '2026-12-03', barcode: '3017620422003' });
        const exported = await request(app).get('/api/data/export').set(bearer(parent.token));
        expect(exported.body.data.pantry_items.length).toBe(1);

        // The file is read by another server: there, these rows do not exist yet.
        const [item] = await list();
        await request(app).delete(`/api/pantry/${item.id}`).set(bearer(parent.token));

        const other = await registerWithPassword('other@example.org');
        const imported = await request(app).post('/api/data/import').set(bearer(other.token)).send(exported.body.data);
        expect(imported.status).toBe(200);
        expect((await list(other.token)).map((item) => [item.name, item.quantity, item.location, item.expires_on, item.barcode]))
            .toEqual([['Milk', '2.00', 'fridge', '2026-12-03', '3017620422003']]);
    });
});

describe('a barcode', () => {
    const lookup = (barcode: string, token = parent.token) => request(app).get(`/api/pantry/lookup/${barcode}`).set(bearer(token));
    const answerWith = (status: number, body: unknown) => {
        const asked: Array<{ url: string; headers: Record<string, string> }> = [];
        setBarcodeFetcherForTests(async (url, init) => {
            asked.push({ url, headers: init.headers as Record<string, string> });
            return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
        });
        return asked;
    };

    it('is named by Open Food Facts, which is sent the digits and nothing about the family', async () => {
        const asked = answerWith(200, { status: 1, product: { product_name: 'Nutella', product_name_fr: 'Pâte à tartiner', brands: 'Ferrero, Nutella', quantity: '400 g' } });
        const answer = await lookup('3017620422003');
        expect(answer.status).toBe(200);
        // In the language of whoever asks (French by default), then the plain name.
        expect(answer.body.data).toEqual({ source: 'openfoodfacts', barcode: '3017620422003', name: 'Pâte à tartiner', brand: 'Ferrero', package: '400 g', unit: null, location: null });

        expect(asked.length).toBe(1);
        expect(asked[0].url).toBe('https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=product_name,product_name_fr,generic_name,brands,quantity');
        expect(Object.keys(asked[0].headers).sort()).toEqual(['Accept', 'User-Agent']);
        expect(asked[0].headers['User-Agent']).toMatch(/^OpenFamily\/\d+\.\d+\.\d+ \(https:\/\/github\.com\/NexaFlowFrance\/OpenFamily\)$/);

        await request(app).put('/api/auth/language').set(bearer(parent.token)).send({ language: 'de' });
        expect((await lookup('3017620422003')).body.data.name).toBe('Nutella');
        expect(asked[1].url).toContain('product_name_de');
    });

    it("is named by the family's own pantry first, without asking anyone", async () => {
        setBarcodeFetcherForTests(async () => { throw new Error('nobody should be asked'); });
        await add({ name: 'The good pasta', unit: 'pack', location: 'cupboard', barcode: '8076800195057' });
        const answer = await lookup('8076800195057');
        expect(answer.status).toBe(200);
        expect(answer.body.data).toEqual({ source: 'pantry', barcode: '8076800195057', name: 'The good pasta', brand: null, package: null, unit: 'pack', location: 'cupboard' });

        // Another family does not learn what this one calls it.
        const other = await registerWithPassword('other@example.org');
        expect((await lookup('8076800195057', other.token)).status).toBe(502);
    });

    it('that nobody knows is said to be unknown', async () => {
        answerWith(404, { status: 0, status_verbose: 'product not found' });
        const unknown = await lookup('0000000000000');
        expect(unknown.status).toBe(404);
        expect(unknown.body.error).toBe('unknown_barcode');

        answerWith(200, { status: 0 });
        expect((await lookup('0000000000000')).body.error).toBe('unknown_barcode');
        // A product with no name is no help.
        answerWith(200, { status: 1, product: { brands: 'Somebody' } });
        expect((await lookup('0000000000000')).body.error).toBe('unknown_barcode');
    });

    it('cannot be looked up when Open Food Facts cannot be reached, and says so', async () => {
        setBarcodeFetcherForTests(async () => { throw new Error('getaddrinfo ENOTFOUND'); });
        const failed = await lookup('3017620422003');
        expect(failed.status).toBe(502);
        expect(failed.body.error).toBe('lookup_unavailable');

        answerWith(500, {});
        expect((await lookup('3017620422003')).status).toBe(502);
    });

    it('that is not one is refused before anyone is asked', async () => {
        const asked = answerWith(200, {});
        for (const wrong of ['abc', '12', '1234567890123456789012', '30176204 22003']) {
            const answer = await lookup(encodeURIComponent(wrong));
            expect(answer.status).toBe(400);
            expect(answer.body.error).toBe('invalid_barcode');
        }
        expect(asked.length).toBe(0);
        expect((await request(app).get('/api/pantry/lookup/3017620422003')).status).toBe(401);
    });
});
