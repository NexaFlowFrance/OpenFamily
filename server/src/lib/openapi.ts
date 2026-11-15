import fs from 'node:fs';
import path from 'node:path';

/**
 * The public description of the API, as an OpenAPI 3.1 document: what another
 * program (Home Assistant, Gladys Assistant, n8n, a script) can do with a
 * personal API token. It is served at /api/openapi.json and explained in
 * API.md.
 *
 * It describes the routes meant for other programs, not every route of the
 * apps: the ones that manage the account, the family's accounts or other
 * credentials are closed to API tokens anyway (lib/apiTokens). A test calls
 * every operation listed here against the real application, so a route that
 * is renamed or removed cannot stay in this document.
 */

type Schema = Record<string, unknown>;

const serverVersion = (): string => {
    try {
        const file = path.join(__dirname, '..', '..', 'package.json');
        return String(JSON.parse(fs.readFileSync(file, 'utf8')).version ?? '0.0.0');
    } catch {
        return '0.0.0';
    }
};

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const nullable = (type: string, extra: Schema = {}): Schema => ({ type: [type, 'null'], ...extra });
const uuid: Schema = { type: 'string', format: 'uuid' };

const LOCAL_TIME = "A wall-clock time in the family's time zone, without a zone: `2026-11-15T09:30:00`.";

/** `{ success: true, data: ... }`, the envelope of every answer. */
const envelope = (data: Schema): Schema => ({
    type: 'object',
    required: ['success', 'data'],
    properties: { success: { type: 'boolean', const: true }, data },
});
const ok = (description: string, data: Schema) => ({
    description,
    content: { 'application/json': { schema: envelope(data) } },
});
const errors = (...codes: number[]) =>
    Object.fromEntries(codes.map((code) => [String(code), { $ref: `#/components/responses/E${code}` }]));
const body = (schema: Schema) => ({ required: true, content: { 'application/json': { schema } } });
const idParam = { name: 'id', in: 'path', required: true, schema: uuid };

interface Operation {
    summary: string;
    tags: string[];
    description?: string;
    parameters?: unknown[];
    requestBody?: unknown;
    responses: Record<string, unknown>;
    security?: unknown[];
}

/** The operations of a plain collection: list, create, update one, delete one. */
const collection = (
    tag: string,
    one: string,
    many: string,
    schema: string,
    input: string,
    listParameters: unknown[] = [],
): Record<string, Record<string, Operation>> => ({
    '': {
        get: {
            summary: `List the ${many}`,
            tags: [tag],
            parameters: listParameters,
            responses: { 200: ok(`The ${many} of the family.`, { type: 'array', items: ref(schema) }), ...errors(401) },
        },
        post: {
            summary: `Add ${one}`,
            tags: [tag],
            requestBody: body(ref(input)),
            responses: { 200: ok(`The new entry.`, ref(schema)), ...errors(400, 401, 403) },
        },
    },
    '/{id}': {
        put: {
            summary: `Change ${one}`,
            tags: [tag],
            description: 'Send only the fields to change.',
            parameters: [idParam],
            requestBody: body(ref(input)),
            responses: { 200: ok('The entry after the change.', ref(schema)), ...errors(400, 401, 403, 404) },
        },
        delete: {
            summary: `Delete ${one}`,
            tags: [tag],
            parameters: [idParam],
            responses: { 200: { description: 'Deleted.' }, ...errors(401, 403, 404) },
        },
    },
});

const prefixed = (prefix: string, paths: Record<string, Record<string, Operation>>) =>
    Object.fromEntries(Object.entries(paths).map(([suffix, operations]) => [`${prefix}${suffix}`, operations]));

const dateRange = [
    { name: 'start_date', in: 'query', schema: { type: 'string' }, description: `Start of the range. ${LOCAL_TIME}` },
    { name: 'end_date', in: 'query', schema: { type: 'string' }, description: 'End of the range, same format.' },
];

export const buildOpenApiDocument = (): Record<string, unknown> => ({
    openapi: '3.1.0',
    info: {
        title: 'OpenFamily API',
        version: serverVersion(),
        summary: 'Read and add to a family\'s data from another program.',
        description: [
            'Authenticate with a personal API token, created by a parent in Settings, then API tokens.',
            'Send it as `Authorization: Bearer ofk_...`. A token is read-only or read-and-write, and never reaches the account itself.',
            '',
            'Every answer is `{ "success": true, "data": ... }` or `{ "success": false, "error": "..." }`.',
            'Times are stored as the family types them, with no zone; appointments also carry the same moments as instants (`start_at`, `end_at`).',
            'See API.md in the repository for the guide: real-time updates, webhooks, examples.',
        ].join('\n'),
        license: { name: 'AGPL-3.0-only', identifier: 'AGPL-3.0-only' },
    },
    servers: [{ url: '/', description: 'This OpenFamily server' }],
    security: [{ apiToken: [] }],
    tags: [
        { name: 'Account', description: 'Which account and family the token stands for.' },
        { name: 'Shopping', description: 'The shopping list.' },
        { name: 'Tasks' },
        { name: 'Appointments', description: 'The family calendar.' },
        { name: 'Meals', description: 'The meal plan.' },
        { name: 'Recipes' },
        { name: 'Family', description: 'The members of the family.' },
        { name: 'Planning', description: 'The weekly planning: work and school hours.' },
        { name: 'Notes', description: 'The family notes.' },
        { name: 'Feeds', description: 'Addresses read without a token: each carries its own.' },
    ],
    paths: {
        '/api/auth/me': {
            get: {
                summary: 'The account the token stands for',
                tags: ['Account'],
                description: 'The quickest way to check a token, and to learn the family\'s time zone.',
                responses: {
                    200: ok('The account.', { type: 'object', required: ['user'], properties: { user: ref('Account') } }),
                    ...errors(401),
                },
            },
        },
        ...prefixed('/api/shopping', collection('Shopping', 'an item', 'items', 'ShoppingItem', 'ShoppingItemInput')),
        '/api/shopping/checked/clear': {
            delete: {
                summary: 'Remove every checked item',
                tags: ['Shopping'],
                responses: { 200: { description: 'Removed.' }, ...errors(401, 403) },
            },
        },
        ...prefixed('/api/tasks', collection('Tasks', 'a task', 'tasks', 'Task', 'TaskInput')),
        ...prefixed('/api/appointments', collection('Appointments', 'an appointment', 'appointments', 'Appointment', 'AppointmentInput', dateRange)),
        ...prefixed('/api/meal-plans', collection('Meals', 'a meal', 'planned meals', 'MealPlan', 'MealPlanInput', dateRange)),
        '/api/recipes': {
            get: {
                summary: 'List the recipes',
                tags: ['Recipes'],
                parameters: [
                    { name: 'category', in: 'query', schema: { type: 'string' } },
                    { name: 'difficulty', in: 'query', schema: { type: 'string' } },
                ],
                responses: { 200: ok('The recipes of the family.', { type: 'array', items: ref('Recipe') }), ...errors(401) },
            },
        },
        '/api/recipes/{id}': {
            get: {
                summary: 'One recipe',
                tags: ['Recipes'],
                parameters: [idParam],
                responses: { 200: ok('The recipe.', ref('Recipe')), ...errors(401, 404) },
            },
        },
        '/api/family': {
            get: {
                summary: 'List the family members',
                tags: ['Family'],
                description: 'The people of the family, as profiles: the ids used in `family_member_ids` and `assigned_to`.',
                responses: { 200: ok('The members.', { type: 'array', items: ref('FamilyMember') }), ...errors(401) },
            },
        },
        '/api/planning': {
            get: {
                summary: 'List the weekly planning',
                tags: ['Planning'],
                parameters: [
                    { name: 'week_start', in: 'query', schema: { type: 'string', format: 'date' }, description: 'First day of the week to read: one-off entries and cancelled dates are those of that week.' },
                    { name: 'member_id', in: 'query', schema: uuid },
                    { name: 'day_of_week', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 7 }, description: 'Monday = 1 ... Sunday = 7.' },
                ],
                responses: { 200: ok('The entries.', { type: 'array', items: ref('PlanningEntry') }), ...errors(401) },
            },
        },
        '/api/notes': {
            get: {
                summary: 'List the family notes',
                tags: ['Notes'],
                responses: { 200: ok('The notes that have not expired.', { type: 'array', items: ref('Note') }), ...errors(401) },
            },
            post: {
                summary: 'Add a note',
                tags: ['Notes'],
                requestBody: body(ref('NoteInput')),
                responses: { 200: ok('The new note.', ref('Note')), ...errors(400, 401, 403) },
            },
        },
        '/api/notes/{id}': {
            delete: {
                summary: 'Delete a note',
                tags: ['Notes'],
                parameters: [idParam],
                responses: { 200: { description: 'Deleted.' }, ...errors(401, 403, 404) },
            },
        },
        '/api/calendar/{token}/openfamily.ics': {
            get: {
                summary: 'The family calendar as an iCalendar feed',
                tags: ['Feeds'],
                description: 'For a calendar application. The address is shown in the app, on the Appointments page; its token is the key, no API token is sent. Events are instants in UTC, whole days are days, a recurring appointment is one event per occurrence.',
                security: [],
                parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'The calendar.', content: { 'text/calendar': { schema: { type: 'string' } } } }, 404: { description: 'Unknown address.' } },
            },
        },
        '/api/display/{token}': {
            get: {
                summary: 'The family\'s day as a page, for a screen that cannot sign in',
                tags: ['Feeds'],
                description: 'A display link made in Settings: a complete HTML page, no script. Its token is the key, no API token is sent.',
                security: [],
                parameters: [
                    { name: 'token', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'show', in: 'query', schema: { type: 'string' }, description: 'Blocks to show, in order: schedule, meals, planning, tasks, shopping, notes.' },
                    { name: 'scale', in: 'query', schema: { type: 'number', minimum: 0.5, maximum: 2.5 } },
                    { name: 'refresh', in: 'query', schema: { type: 'integer' }, description: 'Seconds before the page reloads itself; 0 for never.' },
                    { name: 'lang', in: 'query', schema: { type: 'string' } },
                ],
                responses: { 200: { description: 'The page.', content: { 'text/html': { schema: { type: 'string' } } } }, 404: { description: 'Unknown or revoked link.' } },
            },
        },
        '/api/openapi.json': {
            get: {
                summary: 'This document',
                tags: ['Account'],
                security: [],
                responses: { 200: { description: 'The OpenAPI description of this server\'s API.', content: { 'application/json': { schema: { type: 'object' } } } } },
            },
        },
    },
    components: {
        securitySchemes: {
            apiToken: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'ofk_...',
                description: 'A personal API token, made by a parent in Settings, then API tokens.',
            },
        },
        responses: {
            E400: { description: 'The request is not valid.', content: { 'application/json': { schema: ref('Error') } } },
            E401: { description: 'No token, or a token that is unknown or revoked.', content: { 'application/json': { schema: ref('Error') } } },
            E403: { description: '`read_only_token`: a write with a read-only token. `api_token_forbidden`: a route closed to API tokens.', content: { 'application/json': { schema: ref('Error') } } },
            E404: { description: 'No such entry in this family.', content: { 'application/json': { schema: ref('Error') } } },
        },
        schemas: {
            Error: {
                type: 'object',
                required: ['success', 'error'],
                properties: { success: { type: 'boolean', const: false }, error: { type: 'string' } },
            },
            Account: {
                type: 'object',
                properties: {
                    id: uuid,
                    name: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string', description: '`parent` or `enfant` (child).' },
                    is_owner: { type: 'boolean' },
                    language: { type: 'string' },
                    currency: { type: 'string' },
                    timezone: { type: 'string', description: 'The family\'s time zone (IANA name): the one stored times are in.', examples: ['Europe/Paris'] },
                    disabled_modules: { type: 'array', items: { type: 'string' } },
                },
            },
            ShoppingItem: {
                type: 'object',
                properties: {
                    id: uuid,
                    name: { type: 'string' },
                    category: { type: 'string' },
                    quantity: nullable('string', { description: 'A decimal number, as text.' }),
                    unit: nullable('string'),
                    price: nullable('string'),
                    notes: nullable('string'),
                    is_checked: { type: 'boolean' },
                    created_at: { type: 'string', format: 'date-time' },
                },
            },
            ShoppingItemInput: {
                type: 'object',
                description: '`name` and `category` are required to add an item.',
                properties: {
                    name: { type: 'string' },
                    category: { type: 'string', examples: ['Autre'] },
                    quantity: { type: ['number', 'string', 'null'] },
                    unit: nullable('string'),
                    price: { type: ['number', 'string', 'null'] },
                    notes: nullable('string'),
                    is_checked: { type: 'boolean', description: 'When changing an item: check it off.' },
                },
            },
            Task: {
                type: 'object',
                properties: {
                    id: uuid,
                    title: { type: 'string' },
                    description: nullable('string'),
                    is_completed: { type: 'boolean' },
                    due_date: nullable('string', { format: 'date' }),
                    priority: nullable('string'),
                    frequency: nullable('string'),
                    category: nullable('string'),
                    points: nullable('integer'),
                    assigned_to: { type: 'array', items: uuid, description: 'Family member ids.' },
                    pending_approval: { type: 'boolean', description: 'Completed by a child, waiting for a parent.' },
                },
            },
            TaskInput: {
                type: 'object',
                description: '`title` is required to add a task.',
                properties: {
                    title: { type: 'string' },
                    description: nullable('string'),
                    due_date: nullable('string', { format: 'date' }),
                    priority: nullable('string'),
                    frequency: nullable('string'),
                    category: nullable('string'),
                    points: nullable('integer'),
                    assigned_to: { type: 'array', items: uuid },
                    is_completed: { type: 'boolean', description: 'When changing a task: mark it done, or not.' },
                },
            },
            Appointment: {
                type: 'object',
                description: 'Asked with a range, a recurring appointment comes as one entry per occurrence.',
                properties: {
                    id: uuid,
                    title: { type: 'string' },
                    start_time: { type: 'string', description: LOCAL_TIME },
                    end_time: nullable('string', { description: LOCAL_TIME }),
                    start_at: nullable('string', { format: 'date-time', description: 'The same start as an instant, in UTC.' }),
                    end_at: nullable('string', { format: 'date-time' }),
                    is_all_day: { type: 'boolean' },
                    location: nullable('string'),
                    notes: nullable('string'),
                    color: nullable('string'),
                    family_member_ids: { type: 'array', items: uuid },
                    family_members_data: { type: 'array', items: ref('FamilyMember') },
                    reminder_minutes: { type: 'array', items: { type: 'integer' }, description: 'Minutes before the start, up to five.' },
                    recurrence_frequency: { type: 'string', description: '`none`, `daily`, `weekly`, `monthly` or `yearly`.' },
                    occurrence_id: { type: 'string', description: 'On an occurrence of a series: the series id and the date.' },
                    occurrence_date: { type: 'string', format: 'date' },
                },
            },
            AppointmentInput: {
                type: 'object',
                description: '`title` and `start_time` are required to add an appointment.',
                properties: {
                    title: { type: 'string' },
                    start_time: { type: 'string', description: LOCAL_TIME },
                    end_time: nullable('string'),
                    is_all_day: { type: 'boolean' },
                    location: nullable('string'),
                    notes: nullable('string'),
                    color: nullable('string'),
                    family_member_ids: { type: 'array', items: uuid },
                    reminder_minutes: { type: 'array', items: { type: 'integer' } },
                    recurrence_frequency: { type: 'string' },
                    recurrence_interval: { type: 'integer', minimum: 1 },
                    recurrence_until: nullable('string', { format: 'date' }),
                },
            },
            MealPlan: {
                type: 'object',
                properties: {
                    id: uuid,
                    date: { type: 'string', format: 'date' },
                    meal_type: { type: 'string', enum: ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Snack'], description: 'Breakfast, lunch, dinner, snack: stored under their French names.' },
                    recipe_id: nullable('string', { format: 'uuid' }),
                    custom_meal: nullable('string', { description: 'A meal typed in, when it is not a recipe.' }),
                    notes: nullable('string'),
                },
            },
            MealPlanInput: {
                type: 'object',
                description: '`date`, `meal_type` and one of `recipe_id` or `custom_meal` to plan a meal.',
                properties: {
                    date: { type: 'string', format: 'date' },
                    meal_type: { type: 'string', enum: ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Snack'] },
                    recipe_id: nullable('string', { format: 'uuid' }),
                    custom_meal: nullable('string'),
                    notes: nullable('string'),
                },
            },
            Recipe: {
                type: 'object',
                properties: {
                    id: uuid,
                    name: { type: 'string' },
                    category: { type: 'string' },
                    description: nullable('string'),
                    ingredients: { type: 'array', items: {} },
                    instructions: { type: 'array', items: {} },
                    prep_time: nullable('integer', { description: 'Minutes.' }),
                    cook_time: nullable('integer', { description: 'Minutes.' }),
                    servings: nullable('integer'),
                    difficulty: nullable('string'),
                },
            },
            FamilyMember: {
                type: 'object',
                properties: { id: uuid, name: { type: 'string' }, color: { type: 'string', examples: ['#16A34A'] } },
            },
            PlanningEntry: {
                type: 'object',
                properties: {
                    id: uuid,
                    title: { type: 'string' },
                    schedule_type: { type: 'string' },
                    day_of_week: { type: 'integer', minimum: 1, maximum: 7 },
                    start_time: { type: 'string', examples: ['09:00:00'] },
                    end_time: { type: 'string', examples: ['17:30:00'] },
                    family_member_name: { type: 'string' },
                    family_member_color: { type: 'string' },
                    location: nullable('string'),
                },
            },
            Note: {
                type: 'object',
                properties: {
                    id: uuid,
                    content: { type: 'string' },
                    author_name: { type: 'string' },
                    color: nullable('string'),
                    expires_at: nullable('string'),
                    created_at: { type: 'string', format: 'date-time' },
                },
            },
            NoteInput: {
                type: 'object',
                required: ['content'],
                properties: { content: { type: 'string', maxLength: 500 }, color: nullable('string'), expires_at: nullable('string') },
            },
        },
    },
});
