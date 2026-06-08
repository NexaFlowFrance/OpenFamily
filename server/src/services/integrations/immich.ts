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
