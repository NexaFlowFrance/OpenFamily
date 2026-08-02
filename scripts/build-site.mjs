// Builds the openfamily.fr package: the landing pages, the interactive demo and
// the waiting-list PHP endpoint, ready to upload to any PHP shared host.
//
//   npm run build:site
//   → dist/site/           the folder to upload into public_html
//   → dist/openfamily.fr.zip
//
// GitHub Pages is untouched: docs/ stays the source of truth and keeps its
// /OpenFamily/ base, while this script rewrites a COPY for the root of a domain.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'site');
const DOMAIN = process.env.SITE_DOMAIN || 'https://openfamily.fr';

const log = (msg) => console.log(`  ${msg}`);

// ── 1. Clean output ──────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
console.log('\n▶ Building the openfamily.fr package');

// ── 2. Landing pages + assets (copied, then rewritten for a root-hosted site) ─
// config.example.php is a template the operator reads once from the repo — it has
// no runtime role on the server, so don't ship it there at all.
const SKIP = new Set(['MOBILE.md', 'config.example.php']);
for (const entry of fs.readdirSync(path.join(ROOT, 'docs'), { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const from = path.join(ROOT, 'docs', entry.name);
    const to = path.join(OUT, entry.name);
    fs.cpSync(from, to, { recursive: true });
}
log('landing pages, screenshots, OG image, waitlist.php copied');

// Absolute URLs baked for GitHub Pages must point at the real domain instead,
// otherwise social previews and canonical URLs keep pointing to github.io.
const GH_BASE = 'https://nexaflowfrance.github.io/OpenFamily';
let rewritten = 0;
const rewriteAbsoluteUrls = (relativePath) => {
    const target = path.join(OUT, relativePath);
    if (!fs.existsSync(target)) return;
    const before = fs.readFileSync(target, 'utf8');
    const after = before.split(GH_BASE).join(DOMAIN);
    if (after !== before) {
        fs.writeFileSync(target, after, 'utf8');
        rewritten += before.split(GH_BASE).length - 1;
    }
};
['index.html', 'index.fr.html'].forEach(rewriteAbsoluteUrls);
log(`${rewritten} absolute URLs rewritten to ${DOMAIN}`);

// ── 3. Demo, built for /demo/ instead of the GitHub Pages sub-path ───────────
log('building the demo (this takes a few seconds)…');
execSync('npm run build', {
    cwd: path.join(ROOT, 'client'),
    stdio: 'pipe',
    env: { ...process.env, VITE_DEMO: 'true', VITE_DEMO_BASE: '/demo/' },
});
fs.cpSync(path.join(ROOT, 'client', 'dist'), path.join(OUT, 'demo'), { recursive: true });
// The app shell carries its own social-preview meta pointing at GitHub Pages.
rewriteAbsoluteUrls(path.join('demo', 'index.html'));
log('demo built and copied to /demo/');

// ── 4. Apache config (shared hosting) ────────────────────────────────────────
// Protects the waiting-list data, forces HTTPS and gives the SPA its fallback.
const host = DOMAIN.replace(/^https?:\/\//, '');
fs.writeFileSync(path.join(OUT, '.htaccess'), `# OpenFamily — ${host}

Options -Indexes

# Never serve the waiting-list data, backups left by an editor, or the server
# config — case-insensitively, wherever under the root they end up.
<FilesMatch "(?i)\\.(jsonl|log|bak|old|orig|save|swp|sql|ini|dist|inc|tmp)$">
  Require all denied
</FilesMatch>
<Files "config.php">
  Require all denied
</Files>
<Files "config.example.php">
  Require all denied
</Files>

<IfModule mod_rewrite.c>
  RewriteEngine On

  # Force HTTPS on the canonical host. LiteSpeed terminates TLS itself (%{HTTPS});
  # the X-Forwarded-Proto test is only a guard in case a CDN is added later.
  # Both conditions are ANDed, so this can never loop.
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteCond %{HTTPS} !=on
  RewriteRule ^(.*)$ ${DOMAIN}/$1 [R=301,L]

  # Fold www into the apex so there is a single indexable origin.
  RewriteCond %{HTTP_HOST} ^www\\.${host.replace(/\./g, '\\.')}$ [NC]
  RewriteRule ^(.*)$ ${DOMAIN}/$1 [R=301,L]

  # Readable language URLs: /en and /fr. THE_REQUEST matches only what the
  # browser actually asked for, so the redirect can't fight the rewrite below.
  RewriteCond %{THE_REQUEST} \\s/+index\\.html[\\s?] [NC]
  RewriteRule ^ /en [R=301,L]
  RewriteCond %{THE_REQUEST} \\s/+index\\.fr\\.html[\\s?] [NC]
  RewriteRule ^ /fr [R=301,L]

  RewriteRule ^en/?$ /index.html [L]
  RewriteRule ^fr/?$ /index.fr.html [L]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=(), usb=()"
  # frame-ancestors supersedes X-Frame-Options; no script-src/style-src here, so
  # this cannot break the inline scripts of the landing or the demo bundle.
  Header always set Content-Security-Policy "frame-ancestors 'self'; base-uri 'self'; object-src 'none'"
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  # Hashed asset filenames — safe to cache for a long time.
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/png "access plus 1 month"
  ExpiresByType image/svg+xml "access plus 1 month"
  # HTML must stay fresh so a new deploy is picked up immediately.
  ExpiresByType text/html "access plus 0 seconds"
</IfModule>

# A real 404 page: serving the landing instead would answer 200-looking content
# for every typo and hide a broken deploy.
ErrorDocument 404 /404.html
`, 'utf8');
log('.htaccess written (HTTPS, data protection, caching, SPA fallback)');

// ── 5. Zip for a one-shot upload ─────────────────────────────────────────────
const zipPath = path.join(ROOT, 'dist', 'openfamily.fr.zip');
fs.rmSync(zipPath, { force: true });
try {
    execSync(
        `powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`,
        { stdio: 'pipe' }
    );
    log(`zip created: ${path.relative(ROOT, zipPath)}`);
} catch {
    log('zip skipped (Compress-Archive unavailable) — upload the folder instead');
}

// ── 6. Summary ───────────────────────────────────────────────────────────────
const count = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`\n✅ Package ready: ${path.relative(ROOT, OUT)} (${count(OUT)} files)`);
console.log('   Upload its CONTENT into public_html — including the hidden .htaccess.');
console.log('   config.php stays on the server: create it once from docs/config.example.php.\n');
