import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { immichPhotoChoice, immichRandomSearch, parseImmichPhotoChoice } from '../src/services/integrations/immich';
import { encryptCredentials } from '../src/utils/crypto';

// The kiosk and its screensaver show photos from the family's Immich. The
// family chooses which: every photo, the favourites, or chosen albums
// (issue #155), read here from a stand-in for Immich's API.

const KEY = 'immich-test-key';
const HOLIDAYS = '11111111-1111-4111-8111-111111111111';
const FAMILY = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';

let immich: http.Server;
let baseUrl: string;
let searches: Record<string, unknown>[] = [];
let parent: { token: string; user: { id: string } };

beforeAll(async () => {
    await startSuite();
    immich = http.createServer((req, res) => {
        if (req.headers['x-api-key'] !== KEY) { res.writeHead(401).end(); return; }
        if (req.method === 'GET' && req.url === '/api/albums') {
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify([
                { id: HOLIDAYS, albumName: 'Holidays', assetCount: 42 },
                { id: FAMILY, albumName: 'Family', assetCount: 7 },
                { id: 'not-an-id', albumName: 'Broken' },
            ]));
            return;
        }
        if (req.method === 'POST' && req.url === '/api/search/random') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                const search = JSON.parse(body) as Record<string, unknown>;
                searches.push(search);
                // An album with nothing in it.
                const empty = Array.isArray(search.albumIds) && search.albumIds.length === 1 && search.albumIds[0] === FAMILY;
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(empty ? [] : [{ id: ASSET }]));
            });
            return;
        }
        if (req.method === 'GET' && req.url?.startsWith(`/api/assets/${ASSET}/thumbnail`)) {
            res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
            return;
        }
        res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => immich.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(immich.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise((resolve) => immich.close(resolve));
    await stopSuite();
});

beforeEach(async () => {
    await resetState();
    searches = [];
    parent = await registerWithPassword('parent@example.org');
    await query(
        `INSERT INTO integrations (family_id, type, display_name, base_url, encrypted_credentials, config, status)
         VALUES ($1, 'immich', 'Immich', $2, $3, '{}'::jsonb, 'connected')`,
        [parent.user.id, baseUrl, encryptCredentials({ apiKey: KEY })],
    );
});

const bearer = { get Authorization() { return `Bearer ${parent.token}`; } };
const choose = (body: unknown) => request(app).put('/api/integrations/immich/photos').set(bearer).send(body as object);
const photo = () => request(app).get('/api/integrations/immich/photo').set(bearer);

describe('the choice of photos', () => {
    it('is every photo until the family says otherwise', async () => {
        expect(immichPhotoChoice({})).toEqual({ source: 'all', albumIds: [] });
        expect(immichPhotoChoice(null)).toEqual({ source: 'all', albumIds: [] });
        expect(immichPhotoChoice({ photo_source: 'albums', photo_album_ids: [] })).toEqual({ source: 'all', albumIds: [] });
        expect(immichRandomSearch({ source: 'all', albumIds: [] })).toEqual({ size: 1, type: 'IMAGE' });

        expect((await photo()).status).toBe(200);
        expect(searches).toEqual([{ size: 1, type: 'IMAGE' }]);
    });

    it('refuses what it cannot keep', () => {
        expect(parseImmichPhotoChoice('everything', [])).toBeNull();
        expect(parseImmichPhotoChoice('albums', [])).toBeNull();
        expect(parseImmichPhotoChoice('albums', ['../../etc'])).toBeNull();
        expect(parseImmichPhotoChoice('albums', 'x')).toBeNull();
        expect(parseImmichPhotoChoice('albums', Array.from({ length: 51 }, () => HOLIDAYS))).toBeNull();
        expect(parseImmichPhotoChoice('favorites', [HOLIDAYS])).toEqual({ source: 'favorites', albumIds: [] });
        expect(parseImmichPhotoChoice('albums', [HOLIDAYS, HOLIDAYS])).toEqual({ source: 'albums', albumIds: [HOLIDAYS] });
    });

    it('lists the albums by name, with the current choice', async () => {
        const res = await request(app).get('/api/integrations/immich/albums').set(bearer);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
            albums: [{ id: FAMILY, name: 'Family', count: 7 }, { id: HOLIDAYS, name: 'Holidays', count: 42 }],
            source: 'all',
            albumIds: [],
        });
    });

    it('keeps the kiosk to the favourites', async () => {
        expect((await choose({ source: 'favorites' })).body.data).toEqual({ source: 'favorites', albumIds: [] });
        expect((await photo()).status).toBe(200);
        expect(searches).toEqual([{ size: 1, type: 'IMAGE', isFavorite: true }]);
    });

    it('keeps the kiosk to chosen albums, several if wanted', async () => {
        expect((await choose({ source: 'albums', albumIds: [HOLIDAYS, FAMILY] })).status).toBe(200);
        expect((await photo()).status).toBe(200);
        expect(searches).toEqual([{ size: 1, type: 'IMAGE', albumIds: [HOLIDAYS, FAMILY] }]);

        const again = await request(app).get('/api/integrations/immich/albums').set(bearer);
        expect(again.body.data).toMatchObject({ source: 'albums', albumIds: [HOLIDAYS, FAMILY] });
    });

    it('shows nothing rather than a photo from outside an empty album', async () => {
        await choose({ source: 'albums', albumIds: [FAMILY] });
        expect((await photo()).status).toBe(502);
        expect(searches).toEqual([{ size: 1, type: 'IMAGE', albumIds: [FAMILY] }]);
    });

    it('survives connecting again with a new key', async () => {
        await choose({ source: 'albums', albumIds: [HOLIDAYS] });
        const again = await request(app).post('/api/integrations').set(bearer).send({ type: 'immich', base_url: baseUrl, apiKey: KEY });
        expect(again.status).toBe(200);
        expect(immichPhotoChoice(again.body.data.config)).toEqual({ source: 'albums', albumIds: [HOLIDAYS] });
    });

    it('is a parent\'s to make, and refuses a bad request', async () => {
        expect((await choose({ source: 'albums', albumIds: [] })).status).toBe(400);
        expect((await choose({ source: 'albums', albumIds: ['nope'] })).status).toBe(400);
        expect((await choose({})).status).toBe(400);
        expect((await request(app).put('/api/integrations/immich/photos').send({ source: 'all' })).status).toBe(401);
    });
});
