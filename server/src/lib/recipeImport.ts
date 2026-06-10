/**
 * Recipe import from a public URL.
 *
 * Fetches a web page (Marmiton, 750g, blogs…) and extracts its
 * schema.org/Recipe JSON-LD block, normalized to OpenFamily's recipe shape.
 * Pure parsing functions are kept separate from the fetch so they can be
 * unit-tested without network access.
 */

export interface ImportedRecipe {
    name: string;
    category: string;
    description: string | null;
    ingredients: string[];
    instructions: string[];
    prep_time: number | null;
    cook_time: number | null;
    servings: number | null;
    difficulty: string | null;
    tags: string[];
    image_url: string | null;
}

// ── Text cleanup (French recipe sites are full of HTML entities) ─────────────

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
    agrave: 'à', aacute: 'á', acirc: 'â', auml: 'ä',
    igrave: 'ì', icirc: 'î', iuml: 'ï',
    ograve: 'ò', ocirc: 'ô', ouml: 'ö',
    ugrave: 'ù', ucirc: 'û', uuml: 'ü',
    ccedil: 'ç', oelig: 'œ', aelig: 'æ',
    Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Acirc: 'Â', Ccedil: 'Ç', OElig: 'Œ',
    deg: '°', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
    laquo: '«', raquo: '»', ndash: '–', mdash: '—', times: '×', middot: '·', bull: '•',
    frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³', copy: '©', reg: '®', trade: '™',
};

const safeFromCodePoint = (code: number): string => {
    try {
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    } catch {
        return '';
    }
};

export const decodeHtmlEntities = (text: string): string =>
    text
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
        .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) =>
            NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? match);

/** Strips HTML tags, decodes entities and collapses whitespace. */
export const cleanText = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    // Strip raw tags BEFORE decoding so "&lt;b&gt;" stays literal text.
    return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
};

// ── Field normalizers ─────────────────────────────────────────────────────────

/** ISO 8601 duration (PT1H30M, P0DT45M…) → minutes. Tolerates plain numbers and "45 min". */
export const parseDurationToMinutes = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
        const n = Math.round(parseFloat(raw));
        return n > 0 ? n : null;
    }
    const iso = raw.match(/^-?P(?:[\d.]+Y)?(?:[\d.]+M)?(?:[\d.]+W)?(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?$/i);
    if (iso) {
        const [, d, h, m, s] = iso;
        const minutes = Math.round(
            (parseFloat(d || '0') * 24 * 60) + (parseFloat(h || '0') * 60) + parseFloat(m || '0') + (parseFloat(s || '0') / 60)
        );
        return minutes > 0 ? minutes : null;
    }
    const loose = raw.match(/(\d+)\s*min/i);
    if (loose) {
        const n = parseInt(loose[1], 10);
        return n > 0 ? n : null;
    }
    return null;
};

/** recipeYield ("4 personnes", ["6"], 4) → first positive integer. */
export const parseServings = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
    if (Array.isArray(value)) {
        for (const item of value) {
            const n = parseServings(item);
            if (n) return n;
        }
        return null;
    }
    if (typeof value !== 'string') return null;
    const match = value.match(/\d+/);
    if (!match) return null;
    const n = parseInt(match[0], 10);
    return n > 0 ? n : null;
};

/** image as string | { url } | ImageObject | array of any of those → first http(s) URL. */
export const parseImageUrl = (value: unknown): string | null => {
    if (typeof value === 'string') {
        const url = value.trim();
        return /^https?:\/\//i.test(url) ? url : null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const url = parseImageUrl(item);
            if (url) return url;
        }
        return null;
    }
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        return parseImageUrl(obj.url ?? obj.contentUrl);
    }
    return null;
};

const toStringArray = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    return [];
};

/** keywords as comma-separated string or array → cleaned tags (capped at 8). */
export const parseKeywords = (value: unknown): string[] => {
    const parts = typeof value === 'string'
        ? value.split(',')
        : toStringArray(value);
    const tags: string[] = [];
    for (const part of parts) {
        const tag = cleanText(part);
        if (tag && tag.length <= 40 && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            tags.push(tag);
        }
        if (tags.length >= 8) break;
    }
    return tags;
};

/** Best-effort mapping of recipeCategory/keywords to the app's fixed categories. */
export const mapCategory = (recipeCategory: unknown, keywords: string[]): string => {
    const hay = [...toStringArray(recipeCategory).map(cleanText), ...keywords].join(' ').toLowerCase();
    if (/dessert|g[âa]teau|tarte sucr|p[âa]tisserie|cake|cookie|biscuit|sweet|sucr[ée]/.test(hay)) return 'Dessert';
    if (/entr[ée]e|starter|appetizer|ap[ée]ritif|amuse|soupe|velout[ée]|salade|soup/.test(hay)) return 'Entrée';
    if (/snack|go[ûu]ter|encas|en-cas|breakfast|petit[- ]d[ée]jeuner|brunch/.test(hay)) return 'Snack';
    return 'Plat';
};

/**
 * recipeInstructions: string | string[] | HowToStep[] | HowToSection[]
 * (with itemListElement) → flat list of step texts.
 */
export const flattenInstructions = (value: unknown): string[] => {
    const out: string[] = [];
    const visit = (node: unknown, depth: number): void => {
        if (!node || depth > 4) return;
        if (typeof node === 'string') {
            // A single string may contain several steps separated by newlines.
            for (const part of node.split(/\r?\n+/)) {
                const text = cleanText(part);
                if (text) out.push(text);
            }
            return;
        }
        if (Array.isArray(node)) {
            for (const item of node) visit(item, depth + 1);
            return;
        }
        if (typeof node === 'object') {
            const obj = node as Record<string, unknown>;
            // HowToSection / ItemList: recurse into its steps (skip the section title).
            if (Array.isArray(obj.itemListElement)) {
                for (const item of obj.itemListElement) visit(item, depth + 1);
                return;
            }
            // HowToStep: prefer `text`, fall back to `name`.
            const text = cleanText(obj.text ?? obj.name);
            if (text) out.push(text);
        }
    };
    visit(value, 0);
    return out;
};

// ── JSON-LD discovery ─────────────────────────────────────────────────────────

const LDJSON_SCRIPT_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const isRecipeType = (type: unknown): boolean => {
    if (typeof type === 'string') return type.trim().toLowerCase() === 'recipe';
    if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && t.trim().toLowerCase() === 'recipe');
    return false;
};

const searchRecipeNode = (node: unknown, depth: number): Record<string, unknown> | null => {
    if (!node || depth > 4) return null;
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = searchRecipeNode(item, depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (isRecipeType(obj['@type'])) return obj;
        if (obj['@graph']) return searchRecipeNode(obj['@graph'], depth + 1);
        if (obj.mainEntity) return searchRecipeNode(obj.mainEntity, depth + 1);
    }
    return null;
};

/**
 * Scans every <script type="application/ld+json"> block of an HTML page and
 * returns the first schema.org Recipe node (top-level object, array, @graph,
 * @type as string or array — case-insensitive). Per-block parse failures are
 * silently skipped.
 */
export const findRecipeJsonLd = (html: string): Record<string, unknown> | null => {
    for (const match of html.matchAll(LDJSON_SCRIPT_RE)) {
        const raw = match[1].trim().replace(/^<!--/, '').replace(/-->$/, '')
            .replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
        if (!raw) continue;
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            continue;
        }
        const node = searchRecipeNode(parsed, 0);
        if (node) return node;
    }
    return null;
};

/** Normalizes a schema.org Recipe node to OpenFamily's recipe shape. */
export const normalizeJsonLdRecipe = (node: Record<string, unknown>): ImportedRecipe => {
    const tags = parseKeywords(node.keywords);
    const ingredients = toStringArray(node.recipeIngredient ?? node.ingredients)
        .map(cleanText)
        .filter(Boolean);
    return {
        name: cleanText(node.name),
        category: mapCategory(node.recipeCategory, tags),
        description: cleanText(node.description) || null,
        ingredients,
        instructions: flattenInstructions(node.recipeInstructions),
        prep_time: parseDurationToMinutes(node.prepTime),
        cook_time: parseDurationToMinutes(node.cookTime),
        servings: parseServings(node.recipeYield),
        difficulty: null,
        tags,
        image_url: parseImageUrl(node.image),
    };
};

// ── Page fetch (capped, timed out, SSRF-checked on every redirect hop) ───────

const MAX_HTML_BYTES = 2 * 1024 * 1024; // ~2 MB is plenty for any recipe page
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
// Many recipe sites (Marmiton…) block default fetch/bot user agents.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const readBodyCapped = async (response: Response): Promise<string> => {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let html = '';
    let received = 0;
    while (received < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) return html + decoder.decode();
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => undefined);
    return html;
};

/**
 * Fetches an HTML page with a 10s timeout per request, a ~2 MB body cap and
 * manual redirect handling: `assertSafe` is re-run on every redirect target so
 * a public site cannot bounce the server to a private/metadata address.
 */
export async function fetchHtmlPage(
    url: string,
    assertSafe: (target: string) => Promise<void>
): Promise<string> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertSafe(current);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(current, {
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': BROWSER_UA,
                    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7',
                },
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                await response.body?.cancel().catch(() => undefined);
                if (!location) throw new Error(`HTTP ${response.status} sans en-tête Location`);
                current = new URL(location, current).toString();
                continue;
            }

            if (!response.ok) {
                await response.body?.cancel().catch(() => undefined);
                throw new Error(`HTTP ${response.status}`);
            }

            return await readBodyCapped(response);
        } finally {
            clearTimeout(timer);
        }
    }
    throw new Error('Trop de redirections');
}
