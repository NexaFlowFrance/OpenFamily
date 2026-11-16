import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const localesRoot = path.resolve(here, '../src/i18n/locales');
const canonicalLanguage = 'en';
const canonicalDir = path.join(localesRoot, canonicalLanguage);

// The languages that must stay complete: a missing string fails the build.
// Any other locale folder is a translation in progress. What it lacks is shown
// in English by the app and only counted here, so that a language can arrive
// one string at a time (a translation platform works that way). What would
// break the app is still refused: invalid JSON, a wrong placeholder, a key
// that does not exist in English.
const completeLanguages = new Set(JSON.parse(fs.readFileSync(path.resolve(here, '../src/i18n/complete-languages.json'), 'utf8')));

const placeholderPattern = /\{\{\s*([^},\s]+)[^}]*\}\}/g;
const errors = [];
// Harmless but worth knowing: reported, never fatal.
const warnings = [];
// For a translation in progress: how many strings English has, and how many
// of them the language does not have yet.
let inProgress = false;
let missingStrings = 0;

const countStrings = (value) => {
    if (typeof value === 'string') return 1;
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + countStrings(item), 0);
    if (value && typeof value === 'object') return Object.values(value).reduce((sum, item) => sum + countStrings(item), 0);
    return 0;
};

const missing = (where, what, canonicalValue) => {
    if (inProgress) missingStrings += countStrings(canonicalValue);
    else errors.push(`${where}: ${what}`);
};

const readJson = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        errors.push(`${file}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
};

const placeholders = (value) => {
    if (typeof value !== 'string') return [];
    const found = new Set();
    for (const match of value.matchAll(placeholderPattern)) found.add(match[1]);
    return [...found].sort();
};

const kind = (value) => {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
};

const compareNode = (canonical, translated, where) => {
    const canonicalKind = kind(canonical);
    const translatedKind = kind(translated);

    if (canonicalKind !== translatedKind) {
        errors.push(`${where}: type mismatch: en=${canonicalKind}, translation=${translatedKind}`);
        return;
    }

    if (canonicalKind === 'object') {
        // Plural forms follow each language's own rules (i18next suffixes):
        // English has _one/_other, Russian adds _few/_many, Chinese needs no
        // suffix at all. Compare plural families, not individual keys.
        const language = where.split('/')[0];
        const categories = new Set(new Intl.PluralRules(language).resolvedOptions().pluralCategories);
        const pluralBase = (key) => {
            const m = key.match(/^(.*)_(zero|one|two|few|many|other)$/);
            return m ? { base: m[1], category: m[2] } : null;
        };
        const canonicalFamilies = new Map();
        for (const key of Object.keys(canonical)) {
            const p = pluralBase(key);
            if (p && typeof canonical[key] === 'string') {
                if (!canonicalFamilies.has(p.base)) canonicalFamilies.set(p.base, []);
                canonicalFamilies.get(p.base).push(key);
            }
        }

        for (const key of Object.keys(canonical)) {
            const p = pluralBase(key);
            if (p && canonicalFamilies.has(p.base)) continue;
            if (!(key in translated)) {
                missing(`${where}.${key}`, 'missing key', canonical[key]);
                continue;
            }
            compareNode(canonical[key], translated[key], `${where}.${key}`);
        }

        for (const [base, variants] of canonicalFamilies) {
            const forms = Object.keys(translated).filter((key) => key === base || pluralBase(key)?.base === base);
            if (forms.length === 0) {
                missing(`${where}.${base}`, 'missing plural forms', variants.map((key) => canonical[key]));
                continue;
            }
            const allowed = new Set(variants.flatMap((key) => placeholders(canonical[key])));
            for (const form of forms) {
                const category = pluralBase(form)?.category;
                if (category && !categories.has(category)) {
                    warnings.push(`${where}.${form}: "${category}" is not a plural form of ${language} (never used)`);
                }
                const extra = placeholders(translated[form]).filter((name) => !allowed.has(name));
                if (extra.length) {
                    errors.push(`${where}.${form}: interpolation mismatch: unknown ${JSON.stringify(extra)}`);
                }
            }
        }

        for (const key of Object.keys(translated)) {
            if (key in canonical) continue;
            const p = pluralBase(key);
            if (canonicalFamilies.has(key) || (p && canonicalFamilies.has(p.base))) continue;
            errors.push(`${where}.${key}: extra key`);
        }
        return;
    }

    if (canonicalKind === 'array') {
        if (canonical.length !== translated.length) {
            errors.push(`${where}: array length mismatch: en=${canonical.length}, translation=${translated.length}`);
            return;
        }
        for (let i = 0; i < canonical.length; i += 1) {
            compareNode(canonical[i], translated[i], `${where}[${i}]`);
        }
        return;
    }

    if (canonicalKind === 'string') {
        // Left empty by a translation in progress: shown in English by the app.
        if (inProgress && translated === '') {
            missingStrings += 1;
            return;
        }
        const expected = placeholders(canonical);
        const actual = placeholders(translated);
        if (expected.join('\0') !== actual.join('\0')) {
            errors.push(`${where}: interpolation mismatch: en=${JSON.stringify(expected)}, translation=${JSON.stringify(actual)}`);
        }
    }
};

if (!fs.existsSync(canonicalDir)) {
    console.error(`[i18n] canonical locale directory not found: ${canonicalDir}`);
    process.exit(1);
}

const canonicalNamespaces = fs.readdirSync(canonicalDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

const languages = fs.readdirSync(localesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const progress = [];

for (const language of languages) {
    if (language === canonicalLanguage) continue;

    inProgress = !completeLanguages.has(language);
    missingStrings = 0;
    let totalStrings = 0;

    const localeDir = path.join(localesRoot, language);
    const localeNamespaces = fs.readdirSync(localeDir)
        .filter((name) => name.endsWith('.json'))
        .sort();

    for (const namespace of canonicalNamespaces) {
        const canonical = readJson(path.join(canonicalDir, namespace));
        totalStrings += countStrings(canonical);
        if (!localeNamespaces.includes(namespace)) {
            missing(`${language}/${namespace}`, 'missing namespace', canonical);
        }
    }

    for (const namespace of localeNamespaces) {
        if (!canonicalNamespaces.includes(namespace)) {
            errors.push(`${language}/${namespace}: extra namespace`);
        }
    }

    for (const namespace of canonicalNamespaces) {
        if (!localeNamespaces.includes(namespace)) continue;

        const canonical = readJson(path.join(canonicalDir, namespace));
        const translated = readJson(path.join(localeDir, namespace));
        if (canonical === undefined || translated === undefined) continue;

        compareNode(canonical, translated, `${language}/${namespace}`);
    }

    if (inProgress) {
        const done = totalStrings - missingStrings;
        progress.push(`${language}: ${Math.floor((done / totalStrings) * 100)}% (${done} of ${totalStrings} strings)`);
    }
}

if (warnings.length > 0) {
    console.warn(`[i18n] ${warnings.length} warning(s):`);
    for (const warning of warnings) console.warn(`  - ${warning}`);
}

if (errors.length > 0) {
    console.error(`[i18n] FAILED with ${errors.length} structural issue(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
}

if (progress.length > 0) {
    console.log('[i18n] translations in progress (the rest is shown in English):');
    for (const line of progress) console.log(`  - ${line}`);
}

console.log(`[i18n] OK: ${languages.length} languages, ${canonicalNamespaces.length} namespaces, structure and interpolation parity verified.`);
