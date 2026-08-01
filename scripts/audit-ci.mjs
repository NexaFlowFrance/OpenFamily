// Production dependency audit gate for CI.
//
// `npm audit` has no built-in per-advisory ignore, so we run it here and fail
// on any PROD vulnerability EXCEPT a short, documented allow-list of advisories
// that don't apply to how OpenFamily is deployed. The gate stays strict for
// everything else (any new/other advisory still fails the build).
//
// Note: dismissing a Dependabot alert on GitHub does NOT affect `npm audit`
// (which queries the advisory DB directly) — hence this allow-list lives here.
import { execSync } from 'node:child_process';

// Advisories intentionally tolerated. Keep each entry justified and revisit them.
const ALLOW = new Map([
    [
        'GHSA-qwww-vcr4-c8h2',
        'React Router "RSC Mode CSRF Bypass": only affects React Router RSC / '
        + 'Server-Actions mode. OpenFamily is a client-side SPA (BrowserRouter/'
        + 'HashRouter, no RSC/SSR), so it is not applicable. The only npm fix '
        + 'downgrades to react-router-dom 7.11.0, which reintroduces serious '
        + 'open-redirect/XSS/RCE advisories. Revisit when a forward fix ships.',
    ],
]);

const ghsaOf = (via) => (typeof via === 'object' && via?.url ? via.url.split('/').pop() : null);

let raw;
try {
    raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8' });
} catch (err) {
    // npm audit exits non-zero when vulnerabilities exist; JSON is still emitted.
    raw = err.stdout?.toString() || '';
}

let audit;
try {
    audit = JSON.parse(raw);
} catch {
    console.error('Could not parse `npm audit --json` output:\n' + raw.slice(0, 2000));
    process.exit(1);
}

const vulns = audit.vulnerabilities || {};
const offending = [];
const tolerated = [];

for (const [name, v] of Object.entries(vulns)) {
    const advisories = (v.via || []).filter((x) => typeof x === 'object');
    for (const adv of advisories) {
        const id = ghsaOf(adv);
        if (id && ALLOW.has(id)) {
            tolerated.push(`${id} (${name})`);
        } else {
            offending.push(`${name}: ${adv.title || 'unknown'} — ${adv.url || id || ''}`);
        }
    }
}

if (offending.length > 0) {
    console.error('❌ Production vulnerabilities found (not allow-listed):');
    for (const o of offending) console.error('  - ' + o);
    process.exit(1);
}

if (tolerated.length > 0) {
    console.log('⚠️  Allow-listed production advisories tolerated (see scripts/audit-ci.mjs):');
    for (const t of [...new Set(tolerated)]) console.log('  - ' + t);
}
console.log('✅ Production audit gate passed.');
