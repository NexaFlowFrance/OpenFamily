import { decryptCredentials } from '../../utils/crypto';
import { safeFetch, readCappedBuffer } from '../../lib/safeFetch';

interface ImmichStats {
    photos: number;
    videos: number;
    usage: number;
}

// Outbound Immich calls go through safeFetch: redirects are re-validated on every
// hop (no SSRF bypass via a 302 to an internal/metadata address) and the request
// is bounded by a hard timeout.
const IMMICH_TIMEOUT_MS = 15_000;
// Cap on the proxied image so a hostile/misconfigured upstream cannot stream
// unbounded data into the server's memory.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function testImmichConnection(baseUrl: string, apiKey: string): Promise<{ success: boolean; message: string; stats?: ImmichStats }> {
    try {
        const resp = await safeFetch(`${baseUrl}/api/server/version`, {
            headers: { 'x-api-key': apiKey },
            timeoutMs: IMMICH_TIMEOUT_MS,
        });
        if (!resp.ok) {
            if (resp.status === 401) return { success: false, message: 'Cle API incorrecte' };
            return { success: false, message: `Erreur HTTP ${resp.status}` };
        }
        const version = await resp.json() as { major?: number; minor?: number; patch?: number };
        const vstr = version.major != null ? `${version.major}.${version.minor}.${version.patch}` : '';

        // Fetch stats
        const statsResp = await safeFetch(`${baseUrl}/api/server/statistics`, {
            headers: { 'x-api-key': apiKey },
            timeoutMs: IMMICH_TIMEOUT_MS,
        });
        if (statsResp.ok) {
            const stats = await statsResp.json() as { photos?: number; videos?: number; usage?: number };
            return {
                success: true,
                message: `Connecte a Immich ${vstr}`.trim(),
                stats: { photos: stats.photos || 0, videos: stats.videos || 0, usage: stats.usage || 0 },
            };
        }

        return { success: true, message: `Connecte a Immich ${vstr}`.trim() };
    } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : 'Impossible de joindre le serveur' };
    }
}

// Which photos the kiosk and its screensaver may show. A family library also
// holds screenshots, scans and private pictures: the family can keep the wall
// display to its favourites, or to chosen albums.
export type ImmichPhotoSource = 'all' | 'favorites' | 'albums';
export interface ImmichPhotoChoice { source: ImmichPhotoSource; albumIds: string[] }

export const IMMICH_MAX_ALBUMS = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The choice kept in the integration's settings; anything unreadable means every photo. */
export const immichPhotoChoice = (config: unknown): ImmichPhotoChoice => {
    const raw = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
    const ids = Array.isArray(raw.photo_album_ids) ? raw.photo_album_ids : [];
    const albumIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))]
        .slice(0, IMMICH_MAX_ALBUMS);
    const source: ImmichPhotoSource = raw.photo_source === 'favorites' ? 'favorites'
        : raw.photo_source === 'albums' && albumIds.length > 0 ? 'albums' : 'all';
    return { source, albumIds: source === 'albums' ? albumIds : [] };
};

/**
 * What a request sets, checked. Returns null when it cannot be kept: an
 * unknown source, an id that is not one, too many albums, or "albums" with
 * none chosen (which would show nothing).
 */
export const parseImmichPhotoChoice = (source: unknown, albumIds: unknown): ImmichPhotoChoice | null => {
    if (source !== 'all' && source !== 'favorites' && source !== 'albums') return null;
    const ids = albumIds === undefined ? [] : albumIds;
    if (!Array.isArray(ids) || ids.length > IMMICH_MAX_ALBUMS) return null;
    if (!ids.every((id) => typeof id === 'string' && UUID.test(id))) return null;
    const unique = [...new Set(ids as string[])];
    if (source === 'albums' && unique.length === 0) return null;
    return { source, albumIds: source === 'albums' ? unique : [] };
};

/** The body of the random search for a choice. */
export const immichRandomSearch = (choice: ImmichPhotoChoice): Record<string, unknown> => ({
    size: 1,
    type: 'IMAGE',
    ...(choice.source === 'favorites' ? { isFavorite: true } : {}),
    ...(choice.source === 'albums' ? { albumIds: choice.albumIds } : {}),
});

export interface ImmichAlbum { id: string; name: string; count: number }

/** The albums the API key can see, by name. */
export async function listImmichAlbums(baseUrl: string, encryptedCredentials: string): Promise<ImmichAlbum[]> {
    const apiKey = decryptCredentials(encryptedCredentials).apiKey;
    if (!apiKey) throw new Error('Cle API manquante');
    const resp = await safeFetch(`${baseUrl}/api/albums`, { headers: { 'x-api-key': apiKey }, timeoutMs: IMMICH_TIMEOUT_MS });
    if (!resp.ok) throw new Error(`Immich API error: ${resp.status}`);
    const albums = await resp.json() as { id?: unknown; albumName?: unknown; assetCount?: unknown }[];
    return (Array.isArray(albums) ? albums : [])
        .filter((album): album is { id: string; albumName?: unknown; assetCount?: unknown } => typeof album?.id === 'string' && UUID.test(album.id))
        .map((album) => ({
            id: album.id,
            name: typeof album.albumName === 'string' ? album.albumName.slice(0, 200) : '',
            count: Number.isFinite(Number(album.assetCount)) ? Number(album.assetCount) : 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fetches one random photo from the family's Immich instance and returns the
 * image bytes so the route can proxy them (the API key never reaches the browser).
 *
 * API choice: POST /api/search/random ({ size: 1, type: 'IMAGE' }) — this is the
 * supported way to get random assets on current Immich versions (the old
 * GET /api/assets/random was deprecated in v1.116 and later removed). We then
 * download the asset's preview thumbnail (GET /api/assets/:id/thumbnail?size=preview,
 * ~1440px) which is plenty for a wall display and far lighter than the original.
 */
export async function fetchImmichRandomPhoto(
    baseUrl: string,
    encryptedCredentials: string,
    choice: ImmichPhotoChoice = { source: 'all', albumIds: [] },
): Promise<{ buffer: Buffer; contentType: string }> {
    const creds = decryptCredentials(encryptedCredentials);
    const apiKey = creds.apiKey;
    if (!apiKey) throw new Error('Cle API manquante');

    const randomResp = await safeFetch(`${baseUrl}/api/search/random`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        // An album that is empty or gone gives no photo: never one from outside the choice.
        body: JSON.stringify(immichRandomSearch(choice)),
        timeoutMs: IMMICH_TIMEOUT_MS,
    });
    if (!randomResp.ok) throw new Error(`Immich API error: ${randomResp.status}`);

    const assets = await randomResp.json() as { id?: string }[];
    const assetId = Array.isArray(assets) && assets.length > 0 ? assets[0]?.id : undefined;
    if (!assetId) throw new Error('Aucune photo disponible');

    const thumbResp = await safeFetch(`${baseUrl}/api/assets/${assetId}/thumbnail?size=preview`, {
        headers: { 'x-api-key': apiKey },
        timeoutMs: IMMICH_TIMEOUT_MS,
    });
    if (!thumbResp.ok) throw new Error(`Immich API error: ${thumbResp.status}`);

    const contentType = thumbResp.headers.get('content-type') || 'image/jpeg';
    // Cap the proxied image so an oversized/hostile upstream can't exhaust memory.
    const buffer = await readCappedBuffer(thumbResp, MAX_IMAGE_BYTES);
    return { buffer, contentType };
}

export async function syncImmich(
    _integrationId: string,
    _userId: string,
    baseUrl: string,
    encryptedCredentials: string
): Promise<{ imported: number; errors: number; stats?: ImmichStats }> {
    const creds = decryptCredentials(encryptedCredentials);
    const apiKey = creds.apiKey;
    if (!apiKey) throw new Error('Cle API manquante');

    const statsResp = await safeFetch(`${baseUrl}/api/server/statistics`, {
        headers: { 'x-api-key': apiKey },
        timeoutMs: IMMICH_TIMEOUT_MS,
    });
    if (!statsResp.ok) throw new Error(`Immich API error: ${statsResp.status}`);

    const stats = await statsResp.json() as { photos?: number; videos?: number; usage?: number };
    return {
        imported: 0,
        errors: 0,
        stats: { photos: stats.photos || 0, videos: stats.videos || 0, usage: stats.usage || 0 },
    };
}
