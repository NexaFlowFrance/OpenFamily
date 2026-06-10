import { decryptCredentials } from '../../utils/crypto';

interface ImmichStats {
    photos: number;
    videos: number;
    usage: number;
}

export async function testImmichConnection(baseUrl: string, apiKey: string): Promise<{ success: boolean; message: string; stats?: ImmichStats }> {
    try {
        const resp = await fetch(`${baseUrl}/api/server/version`, {
            headers: { 'x-api-key': apiKey },
        });
        if (!resp.ok) {
            if (resp.status === 401) return { success: false, message: 'Cle API incorrecte' };
            return { success: false, message: `Erreur HTTP ${resp.status}` };
        }
        const version = await resp.json() as { major?: number; minor?: number; patch?: number };
        const vstr = version.major != null ? `${version.major}.${version.minor}.${version.patch}` : '';

        // Fetch stats
        const statsResp = await fetch(`${baseUrl}/api/server/statistics`, {
            headers: { 'x-api-key': apiKey },
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
    encryptedCredentials: string
): Promise<{ buffer: Buffer; contentType: string }> {
    const creds = decryptCredentials(encryptedCredentials);
    const apiKey = creds.apiKey;
    if (!apiKey) throw new Error('Cle API manquante');

    const randomResp = await fetch(`${baseUrl}/api/search/random`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 1, type: 'IMAGE' }),
    });
    if (!randomResp.ok) throw new Error(`Immich API error: ${randomResp.status}`);

    const assets = await randomResp.json() as { id?: string }[];
    const assetId = Array.isArray(assets) && assets.length > 0 ? assets[0]?.id : undefined;
    if (!assetId) throw new Error('Aucune photo disponible');

    const thumbResp = await fetch(`${baseUrl}/api/assets/${assetId}/thumbnail?size=preview`, {
        headers: { 'x-api-key': apiKey },
    });
    if (!thumbResp.ok) throw new Error(`Immich API error: ${thumbResp.status}`);

    const contentType = thumbResp.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await thumbResp.arrayBuffer());
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

    const statsResp = await fetch(`${baseUrl}/api/server/statistics`, {
        headers: { 'x-api-key': apiKey },
    });
    if (!statsResp.ok) throw new Error(`Immich API error: ${statsResp.status}`);

    const stats = await statsResp.json() as { photos?: number; videos?: number; usage?: number };
    return {
        imported: 0,
        errors: 0,
        stats: { photos: stats.photos || 0, videos: stats.videos || 0, usage: stats.usage || 0 },
    };
}
