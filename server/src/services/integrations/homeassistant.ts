import WebSocket from 'ws';
import { query } from '../../db';
import { decryptCredentials } from '../../utils/crypto';
import { safeFetch } from '../../lib/safeFetch';

// Outbound Home Assistant REST calls go through safeFetch: redirects are re-validated
// on every hop (no SSRF bypass via a 302 to an internal/metadata address) and each
// request is bounded by a hard timeout. The live-sync WebSocket below is intentionally
// left on the native `ws` client and is NOT routed through safeFetch.
const HA_TIMEOUT_MS = 15_000;

interface HAShoppingItem {
    name: string;
    complete: boolean;
}

interface HATodoItem {
    summary: string;
    status: 'needs_action' | 'completed';
}

// HA WebSocket todo/item/list for modern HA (2023.6+)
function getTodoItemsViaWebSocket(baseUrl: string, token: string, entityId: string): Promise<HATodoItem[]> {
    return new Promise((resolve, reject) => {
        const wsUrl = baseUrl.replace(/^https?/, (p) => (p === 'https' ? 'wss' : 'ws')) + '/api/websocket';
        // TLS certificates are verified (no rejectUnauthorized bypass) — consistent
        // with the REST calls to the same server, which also verify certificates.
        const ws = new WebSocket(wsUrl);
        const msgId = 1;
        let authenticated = false;

        const timeout = setTimeout(() => {
            ws.terminate();
            reject(new Error('Timeout connexion WebSocket Home Assistant'));
        }, 10000);

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString()) as { type: string; id?: number; success?: boolean; result?: { items?: HATodoItem[] }; error?: { message: string } };

                if (msg.type === 'auth_required') {
                    ws.send(JSON.stringify({ type: 'auth', access_token: token }));
                } else if (msg.type === 'auth_ok') {
                    authenticated = true;
                    ws.send(JSON.stringify({ id: msgId, type: 'todo/item/list', entity_id: entityId }));
                } else if (msg.type === 'auth_invalid') {
                    clearTimeout(timeout);
                    ws.terminate();
                    reject(new Error('Token Home Assistant invalide'));
                } else if (msg.type === 'result' && msg.id === msgId) {
                    clearTimeout(timeout);
                    ws.terminate();
                    if (msg.success && msg.result) {
                        // `todo/item/list` answers { items: [...] } for the requested entity
                        // (it is not keyed by entity_id, unlike `todo.get_items`).
                        const items = msg.result.items || [];
                        resolve(items);
                    } else {
                        reject(new Error(msg.error?.message || `Entité "${entityId}" introuvable dans Home Assistant`));
                    }
                }
            } catch {
                // ignore parse errors
            }
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            if (!authenticated) {
                reject(new Error(`Impossible de se connecter au WebSocket HA : ${err.message}`));
            }
        });

        ws.on('close', () => {
            clearTimeout(timeout);
        });
    });
}

// The todo entities the user typed in the form, if any: one, or several separated by
// commas, semicolons or spaces ("todo.coop, todo.lidl"). An entity id contains none of
// those characters, so the split is unambiguous. When set, they are the lists to sync:
// the legacy shopping_list integration is still loaded on many installs (HA sets it up
// during onboarding) and must not take precedence over an explicit choice.
export function parseTodoEntityIds(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    const ids = value.split(/[\s,;]+/).map((id) => id.toLowerCase()).filter(Boolean);
    return Array.from(new Set(ids));
}

// Each list is read over its own connection, one after the other: plenty for the
// handful of lists a household keeps, and a bound on how long a sync can run.
export const MAX_TODO_ENTITIES = 20;
export const TOO_MANY_TODO_ENTITIES = `${MAX_TODO_ENTITIES} listes Home Assistant au maximum`;

// With several lists, an error has to say which one it is about.
function entityError(entityId: string, error: unknown, several: boolean): string {
    const message = error instanceof Error && error.message
        ? error.message
        : `Entité "${entityId}" introuvable dans Home Assistant`;
    return several && !message.includes(entityId) ? `${entityId} : ${message}` : message;
}

export async function testHomeAssistantConnection(baseUrl: string, token: string, haEntityId?: string): Promise<{ success: boolean; message: string }> {
    try {
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        const resp = await safeFetch(`${baseUrl}/api/`, { headers, timeoutMs: HA_TIMEOUT_MS });

        if (!resp.ok) {
            if (resp.status === 401) return { success: false, message: 'Token invalide ou expiré' };
            return { success: false, message: `Erreur HTTP ${resp.status}` };
        }

        const entityIds = parseTodoEntityIds(haEntityId);
        if (entityIds.length > MAX_TODO_ENTITIES) return { success: false, message: TOO_MANY_TODO_ENTITIES };
        if (entityIds.length > 0) {
            const found: string[] = [];
            for (const entityId of entityIds) {
                try {
                    const items = await getTodoItemsViaWebSocket(baseUrl, token, entityId);
                    found.push(`${entityId}, ${items.length} element${items.length > 1 ? 's' : ''}`);
                } catch (e) {
                    return { success: false, message: entityError(entityId, e, entityIds.length > 1) };
                }
            }
            return { success: true, message: `Connecté a Home Assistant (${found.join(' ; ')})` };
        }

        // Check which shopping API is available and warn accordingly
        const slResp = await safeFetch(`${baseUrl}/api/shopping_list`, { headers, timeoutMs: HA_TIMEOUT_MS });
        if (slResp.ok) {
            return { success: true, message: 'Connecté a Home Assistant (integration shopping_list détectée)' };
        }

        // Legacy not available -- check WebSocket todo
        try {
            const items = await getTodoItemsViaWebSocket(baseUrl, token, 'todo.shopping_list');
            return { success: true, message: `Connecté a Home Assistant (todo entity détectée, ${items.length} element${items.length > 1 ? 's' : ''})` };
        } catch {
            return {
                success: true,
                message: 'Connecté a Home Assistant. Ni "shopping_list" ni "todo.shopping_list" détecté. Vérifiez que l\'une de ces intégrations est activée, ou renseignez l\'identifiant de votre entité todo.',
            };
        }
    } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : 'Impossible de joindre le serveur' };
    }
}

// Adds the names that are not on the family's shopping list yet.
async function importShoppingNames(userId: string, names: string[]): Promise<{ imported: number; errors: number }> {
    let imported = 0;
    let errors = 0;
    for (const name of names) {
        try {
            const existing = await query(
                'SELECT id FROM shopping_items WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
                [userId, name]
            );
            if (existing.rows.length === 0) {
                await query('INSERT INTO shopping_items (user_id, name, category, is_checked) VALUES ($1, $2, $3, false)', [userId, name, 'Autre']);
                imported++;
            }
        } catch {
            errors++;
        }
    }
    return { imported, errors };
}

export async function syncHomeAssistant(
    _integrationId: string,
    userId: string,
    baseUrl: string,
    encryptedCredentials: string,
    config: Record<string, unknown>
): Promise<{ imported: number; errors: number }> {
    const creds = decryptCredentials(encryptedCredentials);
    const token = creds.token;
    if (!token) throw new Error('Token manquant');

    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // The entities from the config (the user can name one or several) or the default one.
    const entityIds = parseTodoEntityIds(config.ha_entity_id);
    if (entityIds.length > MAX_TODO_ENTITIES) throw new Error(TOO_MANY_TODO_ENTITIES);

    // Strategy 1: legacy REST shopping_list endpoint, only when no entity was configured
    const slResp = entityIds.length > 0
        ? null
        : await safeFetch(`${baseUrl}/api/shopping_list`, { headers, timeoutMs: HA_TIMEOUT_MS });
    if (slResp?.ok) {
        const items = await slResp.json() as HAShoppingItem[];
        return importShoppingNames(userId, items.filter((item) => !item.complete).map((item) => item.name));
    }

    // Strategy 2: modern todo entities via WebSocket. Every list is read before anything
    // is written: a list that cannot be read (renamed, removed) fails the sync under its
    // own name, instead of leaving the family with part of what it asked for.
    const targets = entityIds.length > 0 ? entityIds : ['todo.shopping_list'];
    const names: string[] = [];
    for (const entityId of targets) {
        let items: HATodoItem[];
        try {
            items = await getTodoItemsViaWebSocket(baseUrl, token, entityId);
        } catch (e) {
            throw new Error(entityError(entityId, e, targets.length > 1));
        }
        for (const item of items) {
            if (item.status !== 'completed') names.push(item.summary);
        }
    }
    return importShoppingNames(userId, names);
}
