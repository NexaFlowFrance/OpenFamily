import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query, registerWithPassword, resetState, startSuite, stopSuite } from './helpers';
import { parseTodoEntityIds, syncHomeAssistant } from '../src/services/integrations/homeassistant';
import { encryptCredentials } from '../src/utils/crypto';

// Importing shopping lists from Home Assistant: one todo entity or several
// (issue #134), read from a stand-in for Home Assistant's WebSocket API.

type TodoItem = { summary: string; status: 'needs_action' | 'completed' };

const TOKEN = 'long-lived-test-token';
const LISTS: Record<string, TodoItem[]> = {
    'todo.coop': [
        { summary: 'Milk', status: 'needs_action' },
        { summary: 'Bread', status: 'completed' },
    ],
    'todo.lidl': [
        { summary: 'milk', status: 'needs_action' },
        { summary: 'Apples', status: 'needs_action' },
    ],
};

let homeAssistant: WebSocketServer;
let baseUrl: string;
let asked: string[] = [];
let userId: string;

beforeAll(async () => {
    await startSuite();
    homeAssistant = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/api/websocket' });
    homeAssistant.on('connection', (socket) => {
        socket.send(JSON.stringify({ type: 'auth_required' }));
        socket.on('message', (raw) => {
            const message = JSON.parse(raw.toString()) as { type: string; id?: number; access_token?: string; entity_id?: string };
            if (message.type === 'auth') {
                socket.send(JSON.stringify({ type: message.access_token === TOKEN ? 'auth_ok' : 'auth_invalid' }));
            } else if (message.type === 'todo/item/list') {
                asked.push(String(message.entity_id));
                const items = LISTS[String(message.entity_id)];
                socket.send(JSON.stringify(items
                    ? { id: message.id, type: 'result', success: true, result: { items } }
                    : { id: message.id, type: 'result', success: false, error: { code: 'not_found', message: 'Entity not found' } }));
            }
        });
    });
    await new Promise<void>((resolve) => homeAssistant.once('listening', () => resolve()));
    baseUrl = `http://127.0.0.1:${(homeAssistant.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => homeAssistant.close(() => resolve()));
    await stopSuite();
});

beforeEach(async () => {
    await resetState();
    asked = [];
    userId = (await registerWithPassword('parent@example.org')).user.id;
});

const sync = (entities: string) =>
    syncHomeAssistant('integration-id', userId, baseUrl, encryptCredentials({ token: TOKEN }), { ha_entity_id: entities });

const shoppingList = async (): Promise<string[]> =>
    (await query('SELECT name FROM shopping_items WHERE user_id = $1 ORDER BY LOWER(name)', [userId])).rows.map((row) => row.name);

describe('the todo entities field', () => {
    it('still reads a single entity', () => {
        expect(parseTodoEntityIds('todo.shopping_list')).toEqual(['todo.shopping_list']);
    });

    it.each([
        ['commas', 'todo.coop, todo.lidl'],
        ['semicolons', 'todo.coop;todo.lidl'],
        ['spaces and line breaks', ' todo.coop \n todo.lidl '],
        ['a trailing separator', 'todo.coop, todo.lidl,'],
    ])('reads several entities separated by %s', (_label, value) => {
        expect(parseTodoEntityIds(value)).toEqual(['todo.coop', 'todo.lidl']);
    });

    it('keeps each entity once, whatever its case', () => {
        expect(parseTodoEntityIds('todo.coop, TODO.Coop; todo.coop')).toEqual(['todo.coop']);
    });

    it.each([[undefined], [null], [''], ['  ,; '], [42]])('is empty for %j', (value) => {
        expect(parseTodoEntityIds(value)).toEqual([]);
    });
});

describe('syncing with Home Assistant', () => {
    it('imports one list, as before', async () => {
        expect(await sync('todo.lidl')).toEqual({ imported: 2, errors: 0 });
        expect(asked).toEqual(['todo.lidl']);
        expect(await shoppingList()).toEqual(['Apples', 'milk']);
    });

    it('imports several lists into the shopping list, each item once and none that is done', async () => {
        expect(await sync('todo.coop; todo.lidl')).toEqual({ imported: 2, errors: 0 });
        expect(asked).toEqual(['todo.coop', 'todo.lidl']);
        // "Milk" and "milk" are the same item; "Bread" is already ticked off over there.
        expect(await shoppingList()).toEqual(['Apples', 'Milk']);
    });

    it('adds nothing twice on the next sync', async () => {
        await sync('todo.coop, todo.lidl');
        expect(await sync('todo.coop, todo.lidl')).toEqual({ imported: 0, errors: 0 });
        expect(await shoppingList()).toEqual(['Apples', 'Milk']);
    });

    it('names the list it cannot read, and imports nothing', async () => {
        await expect(sync('todo.coop, todo.gone')).rejects.toThrow(/todo\.gone/);
        expect(await shoppingList()).toEqual([]);
    });
});
