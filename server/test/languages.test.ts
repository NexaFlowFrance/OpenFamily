import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, me, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { isLanguageCode, writingLanguage } from '../src/lib/languages';
import { createLocalizedNotification, LocalizedTexts } from '../src/lib/notifications';
import { buildReminderTexts } from '../src/lib/reminderScheduler';

// The interface is translated by the community one language at a time, ahead
// of the server's own texts. Someone who picks such a language keeps it; what
// the server writes to them is in English until its texts follow.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };

beforeEach(async () => {
    await resetState();
    parent = await registerWithPassword('parent@example.org');
});

const setLanguage = (language: unknown) => request(app).put('/api/auth/language')
    .set('Authorization', `Bearer ${parent.token}`).send({ language });

describe('the language a person chooses', () => {
    it('is kept when the server has its texts', async () => {
        const answer = await setLanguage('de');
        expect(answer.status).toBe(200);
        expect((await me(parent.token)).body.data.user.language).toBe('de');
    });

    it('is kept as well when only the interface has it', async () => {
        const answer = await setLanguage('it');
        expect(answer.status).toBe(200);
        expect(answer.body.data.user.language).toBe('it');
        expect((await me(parent.token)).body.data.user.language).toBe('it');
    });

    it.each([['italiano'], ['IT'], ['i'], ['it-IT'], ['<b>'], [''], [42], [null], [undefined]])('refuses %j', async (language) => {
        expect((await setLanguage(language)).status).toBe(400);
        // What was there is still there.
        expect((await me(parent.token)).body.data.user.language).toBe('fr');
    });
});

describe('the language the server writes in', () => {
    it("is the person's when the server has it, whatever the region", () => {
        expect(writingLanguage('de')).toBe('de');
        expect(writingLanguage('pt-BR')).toBe('pt');
        expect(writingLanguage(' ZH_cn ')).toBe('zh');
    });

    it('is English for a language only the interface has', () => {
        expect(writingLanguage('it')).toBe('en');
        expect(writingLanguage('nl-BE')).toBe('en');
    });

    it('is French when nothing usable is stored, as for the oldest accounts', () => {
        for (const nothing of [null, undefined, '', '   ', '42', 'x']) expect(writingLanguage(nothing)).toBe('fr');
    });

    it('knows a language code from anything else', () => {
        expect(['fr', 'it', 'fil'].every(isLanguageCode)).toBe(true);
        expect(['FR', 'it-IT', 'ital', 'f', '', 12, null].some(isLanguageCode)).toBe(false);
    });

    it('reminds in English someone whose language it has no texts for', () => {
        const now = new Date('2026-06-01T08:00:00Z');
        const event = { title: 'Dentist', start_time: '2026-06-01T09:30:00', location: null, is_all_day: true, timezone: 'UTC' };
        const italian = buildReminderTexts({ ...event, language: 'it' }, 0, now);
        expect(italian).toEqual(buildReminderTexts({ ...event, language: 'en' }, 0, now));
        expect(italian).not.toEqual(buildReminderTexts({ ...event, language: 'fr' }, 0, now));
    });

    it('notifies them in English too', async () => {
        const texts = Object.fromEntries(['fr', 'en', 'pt', 'ru', 'es', 'ca', 'zh', 'de']
            .map((language) => [language, { title: `title-${language}`, message: `message-${language}` }])) as LocalizedTexts;
        const titleOf = async () => (await query(
            'SELECT title FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [parent.user.id],
        )).rows[0]?.title;

        await setLanguage('it');
        await createLocalizedNotification({ userId: parent.user.id, type: 'info', texts });
        expect(await titleOf()).toBe('title-en');

        await query('DELETE FROM notifications WHERE user_id = $1', [parent.user.id]);
        await setLanguage('es');
        await createLocalizedNotification({ userId: parent.user.id, type: 'info', texts });
        expect(await titleOf()).toBe('title-es');
    });
});
