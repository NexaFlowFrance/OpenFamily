// Generates marketing screenshots from the static demo build.
//   1) build the demo:  cd client && VITE_DEMO=true npx vite build
//   2) run:             node scripts/screenshots.mjs
// Screenshots are written to docs/screenshots/.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'client');
const outDir = path.join(root, 'docs', 'screenshots');
mkdirSync(outDir, { recursive: true });

const PORT = 4188;
const BASE = `http://localhost:${PORT}/OpenFamily/demo/`;

const desktop = [
    ['', 'dashboard'],
    ['kiosk', 'kiosk'],
    ['shopping', 'shopping'],
    ['calendar', 'calendar'],
    ['budget', 'budget'],
    ['meal-planning', 'meals'],
    ['family', 'family'],
    ['tasks', 'tasks'],
    ['planning', 'planning'],
    ['recipes', 'recipes'],
];
const mobile = [
    ['', 'dashboard'],
    ['shopping', 'shopping'],
    ['calendar', 'calendar'],
];

async function waitForServer(url, tries = 60) {
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch { /* not up yet */ }
        await sleep(500);
    }
    throw new Error('Preview server did not start');
}

const server = spawn(
    `npx vite preview --port ${PORT} --strictPort`,
    { cwd: clientDir, env: { ...process.env, VITE_DEMO: 'true' }, stdio: 'inherit', shell: true }
);

try {
    console.log('Waiting for preview server at', BASE);
    await waitForServer(BASE);
    console.log('Server is up. Launching Chromium…');
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    const prep = async (page) => {
        await page.addInitScript(() => {
            try { localStorage.setItem('i18nextLng', 'en'); } catch { /* ignore */ }
        });
    };

    // Desktop
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' });
    const dpage = await dctx.newPage();
    await prep(dpage);
    for (const [route, name] of desktop) {
        await dpage.goto(BASE + '#/' + route, { waitUntil: 'load' });
        await sleep(1400);
        if (name === 'budget') {
            try { await dpage.getByText('Analytics & limits').click({ timeout: 2000 }); await sleep(1200); } catch { /* ignore */ }
        }
        await dpage.screenshot({ path: path.join(outDir, `${name}.png`) });
        console.log('captured', name);
    }
    await dctx.close();

    // Mobile
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, locale: 'en-US' });
    const mpage = await mctx.newPage();
    await prep(mpage);
    for (const [route, name] of mobile) {
        await mpage.goto(BASE + '#/' + route, { waitUntil: 'load' });
        await sleep(1400);
        await mpage.screenshot({ path: path.join(outDir, `mobile-${name}.png`) });
        console.log('captured mobile', name);
    }
    await mctx.close();

    await browser.close();
    console.log('Done →', outDir);
} finally {
    server.kill();
}
