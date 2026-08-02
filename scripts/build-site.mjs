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
const SKIP = new Set(['MOBILE.md']); // developer docs, not part of the website
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
fs.writeFileSync(path.join(OUT, '.htaccess'), `# OpenFamily — openfamily.fr

# Never serve the waiting-list data or the server config, whatever their location.
<FilesMatch "\\.(jsonl|log)$">
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

  # Force HTTPS (Hostinger terminates TLS upstream, so trust the forwarded header).
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteCond %{HTTPS} !=on
  RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

  # The demo is a hash-router SPA: send unknown /demo/ paths to its index.html.
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^demo/ /demo/index.html [L]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
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

ErrorDocument 404 /index.html
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
console.log('   Upload its CONTENT into public_html, then create config.php from config.example.php.\n');
