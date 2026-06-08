import WebSocket from 'ws';
import { query } from '../../db';
import { decryptCredentials } from '../../utils/crypto';

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
        const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
        const msgId = 1;
        let authenticated = false;

        const timeout = setTimeout(() => {
            ws.terminate();
            reject(new Error('Timeout connexion WebSocket Home Assistant'));
        }, 10000);

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString()) as { type: string; id?: number; success?: boolean; result?: Record<string, { items: HATodoItem[] }>; error?: { message: string } };

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
                        const items = msg.result[entityId]?.items || [];
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

export async function testHomeAssistantConnection(baseUrl: string, token: string): Promise<{ success: boolean; message: string }> {
    try {
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        const resp = await fetch(`${baseUrl}/api/`, { headers });

        if (!resp.ok) {
            if (resp.status === 401) return { success: false, message: 'Token invalide ou expiré' };
            return { success: false, message: `Erreur HTTP ${resp.status}` };
        }

        // Check which shopping API is available and warn accordingly
        const slResp = await fetch(`${baseUrl}/api/shopping_list`, { headers });
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
    let imported = 0;
    let errors = 0;

    // Resolve entity_id from config (user can override) or fall back to default
    const entityId = (config.ha_entity_id as string) || 'todo.shopping_list';

    // Strategy 1: legacy REST shopping_list endpoint
    const slResp = await fetch(`${baseUrl}/api/shopping_list`, { headers });
    if (slResp.ok) {
        const items = await slResp.json() as HAShoppingItem[];
        for (const item of items) {
            if (item.complete) continue;
            try {
                const existing = await query(
                    'SELECT id FROM shopping_items WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
                    [userId, item.name]
                );
                if (existing.rows.length === 0) {
                    await query('INSERT INTO shopping_items (user_id, name, category, is_checked) VALUES ($1, $2, $3, false)', [userId, item.name, 'Autre']);
                    imported++;
                }
            } catch {
                errors++;
            }
        }
        return { imported, errors };
    }

    // Strategy 2: modern todo entity via WebSocket
    const todoItems = await getTodoItemsViaWebSocket(baseUrl, token, entityId);
    for (const item of todoItems) {
        if (item.status === 'completed') continue;
        try {
            const existing = await query(
                'SELECT id FROM shopping_items WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
                [userId, item.summary]
            );
            if (existing.rows.length === 0) {
                await query('INSERT INTO shopping_items (user_id, name, category, is_checked) VALUES ($1, $2, $3, false)', [userId, item.summary, 'Autre']);
                imported++;
            }
        } catch {
            errors++;
        }
    }

    return { imported, errors };
}
