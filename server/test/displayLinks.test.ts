import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { issueAccessToken } from '../src/lib/authTokens';
import { displayOptions, normalizeDisplayLocale } from '../src/lib/displayPage';
import { localDay } from '../src/lib/displaySnapshot';
import logger, { redactPath } from '../src/lib/logger';

// Display links (issue #135): a stable address that shows the family's day
// without signing in, created and revoked by parents, for screens that cannot
// sign in.

beforeAll(startSuite);
afterAll(stopSuite);

let parent: { token: string; user: { id: string } };

beforeEach(async () => {
    await resetState();
    parent = await registerWithPassword('parent@example.org');
});

const now = new Date();
const dayOffset = (days: number): string => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
const today = dayOffset(0);
const isoWeekday = ((now.getDay() + 6) % 7) + 1;

const links = (token?: string) => {
    const req = request(app).get('/api/display-links');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const createLink = (token: string, body: Record<string, unknown> = { name: 'Kitchen frame' }) =>
    request(app).post('/api/display-links').set('Authorization', `Bearer ${token}`).send(body);
const revokeLink = (token: string, id: string) =>
    request(app).delete(`/api/display-links/${id}`).set('Authorization', `Bearer ${token}`);
const page = (linkToken: string, search = '') => request(app).get(`/api/display/${linkToken}${search}`);

/** Another account of the same family, signed in. */
const familyMember = async (role: 'parent' | 'enfant', email: string) => {
    const created = await query(
        `INSERT INTO users (email, name, role, family_owner_id) VALUES ($1, $2, $3, $4)
         RETURNING id, family_owner_id, token_version`,
        [email, 'Member', role, parent.user.id],
    );
    return { id: created.rows[0].id as string, token: issueAccessToken(created.rows[0]) };
};

/** A day's worth of data for a family, every title prefixed so two families cannot be confused. */
const seedDay = async (ownerId: string, label: string) => {
    const member = await query(
        "INSERT INTO family_members (user_id, name, color) VALUES ($1, $2, '#16A34A') RETURNING id",
        [ownerId, `${label}Mia`],
    );
    const memberId = member.rows[0].id as string;
    const appointment = (title: string, start: string, extra: { location?: string; weekly?: boolean } = {}) => query(
        `INSERT INTO appointments (user_id, title, start_time, location, family_member_ids, recurrence_frequency)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [ownerId, title, start, extra.location ?? null, JSON.stringify([memberId]), extra.weekly ? 'weekly' : 'none'],
    );
    await appointment(`${label} dentist`, `${today}T09:30:00`, { location: `${label} clinic` });
    // Started two weeks ago on this weekday: today's occurrence comes from the series.
    await appointment(`${label} choir`, `${dayOffset(-14)}T18:00:00`, { weekly: true });
    await appointment(`${label} swimming`, `${dayOffset(1)}T08:15:00`);
    await appointment(`${label} last week`, `${dayOffset(-7)}T10:00:00`);

    await query('INSERT INTO tasks (user_id, title, assigned_to) VALUES ($1, $2, $3::jsonb)', [ownerId, `${label} trash`, JSON.stringify([memberId])]);
    await query('INSERT INTO tasks (user_id, title, is_completed) VALUES ($1, $2, true)', [ownerId, `${label} finished task`]);
    await query("INSERT INTO shopping_items (user_id, name, category, quantity, unit) VALUES ($1, $2, 'Autre', 2, 'L')", [ownerId, `${label} milk`]);
    await query("INSERT INTO shopping_items (user_id, name, category, is_checked) VALUES ($1, $2, 'Autre', true)", [ownerId, `${label} bought`]);
    await query("INSERT INTO meal_plans (user_id, date, meal_type, custom_meal) VALUES ($1, $2, 'Dîner', $3)", [ownerId, today, `${label} lasagna`]);
    const entry = await query(
        `INSERT INTO schedule_entries (user_id, family_member_id, schedule_type, title, day_of_week, start_time, end_time)
         VALUES ($1, $2, 'work', $3, $4, '09:00', '17:30') RETURNING id`,
        [ownerId, memberId, `${label} office`, isoWeekday],
    );
    await query('INSERT INTO schedule_entry_members (entry_id, family_member_id) VALUES ($1, $2)', [entry.rows[0].id, memberId]);
    await query("INSERT INTO family_notes (user_id, author_name, content) VALUES ($1, 'Alex', $2)", [ownerId, `${label} note`]);
};

describe('managing display links', () => {
    it('needs a session', async () => {
        expect((await links()).status).toBe(401);
        expect((await request(app).post('/api/display-links').send({ name: 'Frame' })).status).toBe(401);
    });

    it('is for parents: a child account can neither list nor create', async () => {
        const child = await familyMember('enfant', 'child@example.org');
        expect((await links(child.token)).status).toBe(403);
        expect((await createLink(child.token)).status).toBe(403);
        expect((await query('SELECT count(*)::int AS n FROM display_links')).rows[0].n).toBe(0);
    });

    it('creates a link with an unguessable token, and lists it for every parent of the family', async () => {
        const created = await createLink(parent.token, { name: '  Kitchen frame  ', locale: 'en-US' });
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({ name: 'Kitchen frame', locale: 'en-US', last_used_at: null });
        expect(created.body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

        const otherParent = await familyMember('parent', 'other@example.org');
        const listed = await links(otherParent.token);
        expect(listed.status).toBe(200);
        expect(listed.body.data.map((link: { name: string }) => link.name)).toEqual(['Kitchen frame']);
    });

    it('falls back to the creator\'s language when the app sends no usable locale', async () => {
        await query("UPDATE users SET language = 'de' WHERE id = $1", [parent.user.id]);
        const created = await createLink(parent.token, { name: 'Frame', locale: 'not a locale' });
        expect(created.body.data.locale).toBe('de-DE');
    });

    it.each([[''], ['   '], ['x'.repeat(81)], [42]])('refuses the name %j', async (name) => {
        const response = await createLink(parent.token, { name });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('invalid_name');
    });

    it('stops at ten links per family', async () => {
        for (let index = 0; index < 10; index += 1) {
            expect((await createLink(parent.token, { name: `Frame ${index}` })).status).toBe(201);
        }
        const eleventh = await createLink(parent.token, { name: 'One too many' });
        expect(eleventh.status).toBe(409);
        expect(eleventh.body).toMatchObject({ error: 'limit_reached', max: 10 });
    });

    it('revokes a link: its address stops answering at once', async () => {
        const link = (await createLink(parent.token)).body.data;
        expect((await page(link.token)).status).toBe(200);

        expect((await revokeLink(parent.token, link.id)).status).toBe(200);
        expect((await page(link.token)).status).toBe(404);
        expect((await links(parent.token)).body.data).toEqual([]);
        expect((await revokeLink(parent.token, link.id)).status).toBe(404);
    });

    it('cannot revoke another family\'s link', async () => {
        const stranger = await registerWithPassword('stranger@example.org');
        const theirs = (await createLink(stranger.token)).body.data;

        expect((await revokeLink(parent.token, theirs.id)).status).toBe(404);
        expect((await revokeLink(parent.token, 'not-an-id')).status).toBe(404);
        expect((await page(theirs.token)).status).toBe(200);
    });

    it('follows the family when its ownership is transferred', async () => {
        await seedDay(parent.user.id, 'Ours');
        const link = (await createLink(parent.token)).body.data;
        const successor = await familyMember('parent', 'successor@example.org');

        const transfer = await request(app)
            .post('/api/invites/transfer-ownership')
            .set('Authorization', `Bearer ${parent.token}`)
            .send({ newOwnerId: successor.id });
        expect(transfer.status).toBe(200);

        const after = await page(link.token);
        expect(after.status).toBe(200);
        expect(after.text).toContain('Ours dentist');
        expect((await query('SELECT user_id FROM display_links WHERE id = $1', [link.id])).rows[0].user_id).toBe(successor.id);
    });
});

describe('the page behind a link', () => {
    it.each([
        ['an unknown token', 'A'.repeat(43)],
        ['a token of the wrong shape', 'short'],
        ['an attempt at something else', '..%2F..%2Fauth%2Fme'],
    ])('answers 404 for %s, without a word about why', async (_label, token) => {
        const response = await page(token);
        expect(response.status).toBe(404);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.text).not.toMatch(/parent@example\.org|token|sql/i);
    });

    it('shows the family\'s day, and nothing of another family', async () => {
        await seedDay(parent.user.id, 'Ours');
        const stranger = await registerWithPassword('stranger@example.org');
        await seedDay(stranger.user.id, 'Theirs');
        const link = (await createLink(parent.token, { name: 'Frame', locale: 'en-GB' })).body.data;

        const response = await page(link.token);
        expect(response.status).toBe(200);
        const html = response.text;

        for (const shown of [
            'Ours dentist', 'Ours clinic', 'Ours choir', 'Ours swimming', 'OursMia',
            'Ours trash', 'Ours milk (2 L)', 'Ours lasagna', 'Dinner', 'Ours office', 'Ours note',
        ]) {
            expect(html, shown).toContain(shown);
        }
        for (const hidden of ['Ours last week', 'Ours finished task', 'Ours bought', 'Theirs']) {
            expect(html, hidden).not.toContain(hidden);
        }
    });

    it('is a complete page that may not be cached, indexed or scripted', async () => {
        const link = (await createLink(parent.token)).body.data;
        const response = await page(link.token);

        expect(response.headers['content-type']).toMatch(/^text\/html/);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(response.headers['content-security-policy']).toContain("default-src 'none'");
        expect(response.headers['content-security-policy']).not.toContain('script-src');
        expect(response.text.startsWith('<!doctype html>')).toBe(true);
        expect(response.text).not.toMatch(/<script/i);
    });

    it('writes what the family typed as text, never as markup', async () => {
        const member = await query(
            "INSERT INTO family_members (user_id, name, color) VALUES ($1, '<b>Eve</b>', '#fff\"x') RETURNING id",
            [parent.user.id],
        );
        await query(
            'INSERT INTO appointments (user_id, title, start_time, location, family_member_ids) VALUES ($1, $2, $3, $4, $5::jsonb)',
            [parent.user.id, '<script>alert(1)</script>', `${today}T10:00:00`, '<img src=x onerror=alert(2)>', JSON.stringify([member.rows[0].id])],
        );
        await query("INSERT INTO tasks (user_id, title) VALUES ($1, '</style><svg onload=alert(3)>')", [parent.user.id]);
        const link = (await createLink(parent.token)).body.data;

        const html = (await page(link.token)).text;
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
        expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
        expect(html).not.toMatch(/<script|<img|<svg|<b>Eve/i);
        // A colour that is not a plain hex one never reaches the style attribute.
        expect(html).toContain('style="background:#000000"');
    });

    it('speaks the language of the link, or the one the address asks for', async () => {
        const link = (await createLink(parent.token, { name: 'Frame', locale: 'fr-FR' })).body.data;
        expect((await page(link.token)).text).toContain('<html lang="fr"');
        expect((await page(link.token)).text).toContain('Aujourd&#39;hui');

        const german = (await page(link.token, '?lang=de')).text;
        expect(german).toContain('<html lang="de"');
        expect(german).toContain('Heute');
        expect((await page(link.token, '?lang=xx')).text).toContain('<html lang="fr"');
    });

    it('shows only the blocks the address asks for', async () => {
        await seedDay(parent.user.id, 'Ours');
        const link = (await createLink(parent.token, { name: 'Frame', locale: 'en-GB' })).body.data;

        const html = (await page(link.token, '?show=tasks,shopping')).text;
        expect(html).toContain('Ours trash');
        expect(html).toContain('Ours milk');
        expect(html).not.toContain('Ours dentist');
        expect(html).not.toContain('Ours lasagna');
    });

    it('reloads itself every five minutes unless told otherwise', async () => {
        const link = (await createLink(parent.token)).body.data;
        expect((await page(link.token)).text).toContain('<meta http-equiv="refresh" content="300">');
        expect((await page(link.token, '?refresh=5')).text).toContain('content="30"');
        expect((await page(link.token, '?refresh=0')).text).not.toContain('http-equiv="refresh"');
    });

    it('leaves out a module the family switched off', async () => {
        await seedDay(parent.user.id, 'Ours');
        await query("UPDATE users SET disabled_modules = '[\"meals\",\"notes\"]' WHERE id = $1", [parent.user.id]);
        const link = (await createLink(parent.token, { name: 'Frame', locale: 'en-GB' })).body.data;

        const html = (await page(link.token)).text;
        expect(html).not.toContain('Ours lasagna');
        expect(html).not.toContain('Ours note');
        expect(html).toContain('Ours office');
    });

    it('records when a link was last used', async () => {
        const link = (await createLink(parent.token)).body.data;
        await page(link.token);
        await expect.poll(async () => (await links(parent.token)).body.data[0].last_used_at).not.toBeNull();
    });

    it('opens nothing else: the token is not a session', async () => {
        const link = (await createLink(parent.token)).body.data;
        const asBearer = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${link.token}`);
        expect(asBearer.status).toBe(401);
        expect((await request(app).get(`/api/display-links/${link.token}`)).status).not.toBe(200);
    });
});

describe('the options of a page', () => {
    it('keeps a real locale in one of the app\'s languages, and falls back otherwise', () => {
        expect(normalizeDisplayLocale('fr-CA')).toBe('fr-CA');
        expect(normalizeDisplayLocale('EN-us')).toBe('en-US');
        expect(normalizeDisplayLocale('ja-JP', 'es')).toBe('es-ES');
        expect(normalizeDisplayLocale('en_US', 'pt')).toBe('pt-BR');
        expect(normalizeDisplayLocale(undefined)).toBe('en-GB');
    });

    it('reads the blocks in the order asked, each once, ignoring unknown ones', () => {
        expect(displayOptions({ show: 'tasks, schedule,tasks,weather' }, 'en-GB').sections).toEqual(['tasks', 'schedule']);
        expect(displayOptions({ show: 'nothing' }, 'en-GB').sections).toHaveLength(6);
    });

    it('bounds the scale and the refresh', () => {
        expect(displayOptions({ scale: '9' }, 'en-GB').scale).toBe(2.5);
        expect(displayOptions({ scale: 'big' }, 'en-GB').scale).toBe(1);
        expect(displayOptions({ refresh: '999999' }, 'en-GB').refreshSeconds).toBe(86_400);
        expect(displayOptions({ refresh: ['60', '0'] }, 'en-GB').refreshSeconds).toBe(60);
    });
});

describe('request logs', () => {
    it('record a visit to a display link without its token', async () => {
        const link = (await createLink(parent.token)).body.data;
        const info = vi.spyOn(logger, 'info');
        try {
            await page(link.token, '?scale=1.2');
            const requests = () => info.mock.calls.filter(([event]) => event === 'http.request').map(([, meta]) => meta);
            await expect.poll(requests).toHaveLength(1);
            expect(requests()[0]).toMatchObject({ method: 'GET', path: '/api/display/[redacted]', statusCode: 200 });
            expect(JSON.stringify(info.mock.calls)).not.toContain(link.token);
        } finally {
            info.mockRestore();
        }
    });

    it('never carry the secret of a display link or of the calendar feed', () => {
        expect(redactPath(`/api/display/${'A'.repeat(43)}`)).toBe('/api/display/[redacted]');
        expect(redactPath('/api/calendar/0123456789abcdef/openfamily.ics')).toBe('/api/calendar/[redacted]/openfamily.ics');
        expect(redactPath('/api/display-links')).toBe('/api/display-links');
        expect(redactPath('/api/calendar/token')).toBe('/api/calendar/token');
    });
});
