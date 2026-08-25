#!/usr/bin/env node
/**
 * Guards the public repository against anything that belongs to the hosted
 * offering or to a private machine.
 *
 * The core of OpenFamily is developed here and merged downstream into the
 * hosted build, never the other way round. That direction is what keeps the
 * two apart; this check is the mechanical proof, so a mistaken cherry-pick or
 * a copied file fails the build instead of reaching a public clone.
 *
 * Deliberately narrow. Words like "subscription" (Web Push), "billing" and
 * "purchase" (the privacy policy describes the hosted plan, and must) appear
 * here legitimately, so matching them would produce noise that gets ignored,
 * which is worse than no check at all. Only unambiguous identifiers and paths
 * are listed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/** Files that only ever exist in the hosted build. Presence alone is a failure. */
const FORBIDDEN_PATHS = [
    /^server\/src\/routes\/billing\.ts$/,
    /^server\/src\/lib\/(billingReconciler|googlePlay|quotas)\.ts$/,
    /^server\/src\/middleware\/subscription\.ts$/,
    /^client\/src\/pages\/Paywall\.tsx$/,
    /^client\/src\/lib\/billing\.ts$/,
    /^client\/src\/i18n\/locales\/[^/]+\/billing\.json$/,
];

/** Identifiers that carry no meaning outside the hosted build. */
const FORBIDDEN_MARKERS = [
    { re: /\bCLOUD_MODE\b/, what: 'hosted-mode switch' },
    { re: /\bRTDN_SECRET\b/, what: 'Play real-time developer notifications secret' },
    { re: /\bGOOGLE_SERVICE_ACCOUNT_JSON\b/, what: 'Play service account credentials' },
    { re: /\bGOOGLE_PLAY_PRODUCT_ID\b/, what: 'Play product identifier' },
    { re: /\bbillingReconciler\b/, what: 'billing reconciler' },
    { re: /\bsubscription_required\b/, what: 'paywall response code' },
    { re: /\bcordova-plugin-purchase\b/, what: 'in-app purchase plugin' },
    { re: /\bPaywall\b/, what: 'paywall component' },
];

/** Credentials, wherever they come from. */
const SECRET_PATTERNS = [
    { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: 'private key' },
    { re: /"type"\s*:\s*"service_account"/, what: 'Google service account key' },
    { re: /\bAIza[0-9A-Za-z_-]{35}\b/, what: 'Google API key' },
    { re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, what: 'GitHub token' },
    { re: /\bsk_(live|test)_[A-Za-z0-9]{20,}\b/, what: 'Stripe secret key' },
    { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, what: 'signed JWT' },
];

/** Generated, vendored or binary; scanning them only yields false positives. */
const SKIP = [
    // This file spells the patterns out, so it would always match itself.
    /^scripts\/check-public-safe\.mjs$/,
    /^package-lock\.json$/,
    /^client\/android\/gradlew/,
    /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|jks|keystore|woff2?|ttf|eot|mp4|webm)$/i,
];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !SKIP.some((re) => re.test(f)));

const failures = [];

for (const file of FORBIDDEN_PATHS) {
    const hit = files.find((f) => file.test(f));
    if (hit) failures.push(`${hit}: belongs to the hosted build only`);
}

for (const file of files) {
    let size;
    try {
        size = statSync(file).size;
    } catch {
        continue; // listed but absent: a deleted file staged elsewhere
    }
    if (size > 2 * 1024 * 1024) continue;

    let text;
    try {
        text = readFileSync(file, 'utf8');
    } catch {
        continue;
    }
    if (text.includes('\0')) continue; // binary despite the extension

    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
        for (const { re, what } of FORBIDDEN_MARKERS) {
            if (re.test(line)) failures.push(`${file}:${i + 1}: ${what}`);
        }
        for (const { re, what } of SECRET_PATTERNS) {
            if (re.test(line)) failures.push(`${file}:${i + 1}: ${what}`);
        }
    });
}

if (failures.length > 0) {
    console.error('This change cannot be published:\n');
    for (const f of failures) console.error(`  ${f}`);
    console.error(
        '\nThe core is developed here and merged downstream into the hosted build.',
        '\nIf one of these is a false positive, narrow the pattern in',
        'scripts/check-public-safe.mjs rather than deleting the check.'
    );
    process.exit(1);
}

console.log(`Public-safety check passed (${files.length} files scanned).`);
