import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, exchange, runCallback, resetState, startSuite, stopSuite } from './helpers';
import { nativeReturnPage } from '../src/lib/nativeReturn';

// Single sign-on from the Android app: the sign-in happens in the phone's
// browser, and the callback hands the one-time code back to the app through a
// link of its own scheme, instead of the web address.

beforeAll(startSuite);
afterAll(stopSuite);
beforeEach(() => resetState());

const challengeOf = (verifier: string): string => crypto.createHash('sha256').update(verifier).digest('base64url');

/** /start as the app does it, the provider round trip, then /callback. */
const nativeCallback = async (native: unknown = true, acceptLanguage = 'en') => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const started = await request(app).post('/api/auth/oidc/start').send({ clientChallenge: challengeOf(verifier), native });
    expect(started.status).toBe(200);
    const atProvider = await fetch(started.body.data.authorizationUrl, { redirect: 'manual' });
    const backTo = new URL(atProvider.headers.get('location')!);
    const callback = await request(app).get(`/api/auth/oidc/callback${backTo.search}`).set('Accept-Language', acceptLanguage);
    return { callback, verifier };
};

const linkIn = (html: string): string => /<a href="([^"]+)"/.exec(html)?.[1] ?? '';

describe('a sign-in started by the Android app', () => {
    it('ends on a page that sends the phone back to the app, with a code the app can redeem', async () => {
        const { callback, verifier } = await nativeCallback();
        expect(callback.status).toBe(200);
        expect(callback.headers['content-type']).toContain('text/html');
        expect(callback.headers.location).toBeUndefined();
        expect(callback.headers['cache-control']).toBe('no-store');

        const link = linkIn(callback.text);
        expect(link).toMatch(/^openfamily:\/\/auth\/callback#code=[A-Za-z0-9_-]{43}$/);
        // The page tries by itself, and the button is the same link.
        expect(callback.text).toContain(`<meta http-equiv="refresh" content="0;url=${link}">`);

        const code = link.split('#code=')[1];
        const redeemed = await exchange(code, verifier);
        expect(redeemed.status).toBe(200);
        expect(redeemed.body.data.token).toBeTruthy();
    });

    it('still needs the secret the app kept: the link alone signs nobody in', async () => {
        const { callback } = await nativeCallback();
        const code = linkIn(callback.text).split('#code=')[1];
        const stolen = await exchange(code, crypto.randomBytes(32).toString('base64url'));
        expect(stolen.status).not.toBe(200);
    });

    it('speaks the language of the phone when it knows it', async () => {
        const { callback } = await nativeCallback(true, 'fr-FR,fr;q=0.9,en;q=0.8');
        expect(callback.text).toContain('Ouvrir OpenFamily');
        expect(callback.text).toContain('<html lang="fr">');
        expect(nativeReturnPage('openfamily://auth/callback#code=x', 'xx,yy')).toContain('Open OpenFamily');
    });

    it('never puts anything but its own link in the page', () => {
        const page = nativeReturnPage('openfamily://auth/callback#error="><script>alert(1)</script>', 'en');
        expect(page).not.toContain('<script>');
    });
});

describe('everything else stays on the web', () => {
    it('a sign-in from a browser is redirected to the web address, as before', async () => {
        const result = await runCallback();
        expect(result.location).toMatch(/^http:\/\/app\.test\/auth\/callback#code=/);
    });

    it('only a real "native: true" asks for the app', async () => {
        const { callback } = await nativeCallback('true');
        expect(callback.status).toBe(302);
        expect(callback.headers.location).toMatch(/^http:\/\/app\.test\/auth\/callback#code=/);
    });

    it('an unknown state cannot be sent to the app', async () => {
        const callback = await request(app).get('/api/auth/oidc/callback?state=whatever&code=x&native=true');
        expect(callback.status).toBe(302);
        expect(callback.headers.location).toBe('http://app.test/auth/callback#error=expired');
    });
});
