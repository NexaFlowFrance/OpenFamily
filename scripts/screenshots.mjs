// Generates the screenshots of the READMEs and of the website from the static
// demo build, and the image shown when a link to OpenFamily is shared.
//   1) build the demo:  cd client && VITE_DEMO=true npx vite build
//   2) run:             node scripts/screenshots.mjs
// Screenshots are written to docs/screenshots/ (a dark one is named
// <page>-dark.png), the shared-link image to docs/openfamily-og.png.
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync, readFileSync } from 'node:fs';
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
    ['pantry', 'pantry'],
];
const mobile = [
    ['', 'dashboard'],
    ['shopping', 'shopping'],
    ['calendar', 'calendar'],
];
// The pages also shown in the dark theme.
const desktopDark = ['dashboard', 'calendar', 'planning'];
const mobileDark = ['dashboard'];

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, locale: 'en-US' };

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

// On Windows the server is a grandchild of the shell we started: kill() would
// only end the shell and leave the port taken.
function stopServer() {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
}

/** A page of the demo, in English, in the given theme. */
async function openDemo(browser, options, theme) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.addInitScript((wanted) => {
        try {
            localStorage.setItem('i18nextLng', 'en');
            localStorage.setItem('theme', wanted);
        } catch { /* ignore */ }
    }, theme);
    return { context, page };
}

async function visit(page, route, name) {
    await page.goto(BASE + '#/' + route, { waitUntil: 'load' });
    await sleep(1400);
    if (name === 'budget') {
        try { await page.getByText('Analytics & limits').click({ timeout: 2000 }); await sleep(1200); } catch { /* ignore */ }
    }
}

async function capture(browser, options, theme, routes, fileName) {
    const { context, page } = await openDemo(browser, options, theme);
    for (const [route, name] of routes) {
        await visit(page, route, name);
        const file = fileName(name);
        await page.screenshot({ path: path.join(outDir, file) });
        console.log('captured', file);
    }
    await context.close();
}

const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;

/** The 1200x630 image of a shared link: the name, what it is, and the home page. */
async function captureSharedLinkImage(browser) {
    const { context, page } = await openDemo(browser, { viewport: { width: 1180, height: 780 }, deviceScaleFactor: 2, locale: 'en-US' }, 'light');
    await visit(page, '', 'dashboard');
    // Without the banner of the demo, which sits above the header of the app.
    const top = await page.evaluate(() => Math.max(0, Math.round(document.querySelector('header')?.getBoundingClientRect().top ?? 0)));
    const home = await page.screenshot({ clip: { x: 0, y: top, width: 1180, height: 780 - top } });
    await context.close();

    const fonts = path.join(clientDir, 'public', 'fonts');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Fraunces'; font-weight: 500; src: url(${dataUrl(path.join(fonts, 'Fraunces-500-latin.woff2'), 'font/woff2')}) format('woff2'); }
@font-face { font-family: 'Fraunces'; font-weight: 500; font-style: italic; src: url(${dataUrl(path.join(fonts, 'Fraunces-500-italic-latin.woff2'), 'font/woff2')}) format('woff2'); }
@font-face { font-family: 'Instrument Sans'; font-weight: 400; src: url(${dataUrl(path.join(fonts, 'InstrumentSans-400-latin.woff2'), 'font/woff2')}) format('woff2'); }
html, body { margin: 0; width: 1200px; height: 630px; }
body { position: relative; overflow: hidden; background: #0f0f10; color: #f1efec; font-family: 'Instrument Sans', sans-serif; }
.glow { position: absolute; inset: 0; background:
    radial-gradient(55% 75% at 88% 12%, rgba(238, 98, 119, .24), transparent 70%),
    radial-gradient(40% 55% at 0% 100%, rgba(238, 98, 119, .10), transparent 70%); }
.text { position: absolute; left: 72px; top: 0; bottom: 0; width: 440px; display: flex; flex-direction: column; justify-content: center; }
.logo { width: 84px; height: 84px; border-radius: 20px; box-shadow: 0 0 0 1px #3a393d; }
h1 { margin: 30px 0 18px; font-family: 'Fraunces', serif; font-weight: 500; font-size: 78px; line-height: 1; letter-spacing: -0.02em; }
.what { margin: 0; font-size: 28px; line-height: 1.3; color: #a9a5a3; }
.what em { font-family: 'Fraunces', serif; font-weight: 500; font-style: italic; color: #ee6277; }
.parts { margin: 32px 0 0; font-size: 19px; letter-spacing: .01em; color: #ee6277; }
.frame { position: absolute; left: 548px; top: 78px; width: 760px; overflow: hidden; border-radius: 18px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, .6), 0 0 0 1px #3a393d; }
.frame img { display: block; width: 100%; }
</style></head><body>
<div class="glow"></div>
<div class="text">
  <img class="logo" src="${dataUrl(path.join(root, 'docs', 'OpenFamily.png'), 'image/png')}" alt="">
  <h1>OpenFamily</h1>
  <p class="what">The family organizer<br><em>you host yourself</em></p>
  <p class="parts">Calendar · Tasks · Shopping · Meals · Budget</p>
</div>
<div class="frame"><img src="data:image/png;base64,${home.toString('base64')}" alt=""></div>
</body></html>`;

    const card = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const cardPage = await card.newPage();
    await cardPage.setContent(html, { waitUntil: 'load' });
    await cardPage.evaluate(() => document.fonts.ready);
    await cardPage.screenshot({ path: path.join(root, 'docs', 'openfamily-og.png') });
    await card.close();
    console.log('captured openfamily-og.png');
}

try {
    console.log('Waiting for preview server at', BASE);
    await waitForServer(BASE);
    console.log('Server is up. Launching Chromium…');
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    await capture(browser, DESKTOP, 'light', desktop, (name) => `${name}.png`);
    await capture(browser, DESKTOP, 'dark', desktop.filter(([, name]) => desktopDark.includes(name)), (name) => `${name}-dark.png`);
    await capture(browser, MOBILE, 'light', mobile, (name) => `mobile-${name}.png`);
    await capture(browser, MOBILE, 'dark', mobile.filter(([, name]) => mobileDark.includes(name)), (name) => `mobile-${name}-dark.png`);
    await captureSharedLinkImage(browser);

    await browser.close();
    console.log('Done:', outDir);
} finally {
    stopServer();
}
