// In-browser mock backend for the static GitHub Pages demo. No network, no
// persistence: the store is recreated on every page load. It mirrors the shape
// of the real API responses ({ success, data }).
import { createSeed, type DemoStore } from './seed';

let store: DemoStore = createSeed();

// Family-customizable category lists (mirrors /api/categories). Reset on reload,
// like everything else in the demo. Keep in sync with hooks/useCategories.ts.
let demoCategories: Record<'shopping' | 'recipe' | 'budget', string[]> = {
    shopping: ['Alimentation', 'Bebe', 'Menage', 'Sante', 'Autre'],
    recipe: ['Entrée', 'Plat', 'Dessert', 'Snack'],
    budget: [
        'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
        'Abonnements', 'Assurance', 'Enfants', 'Maison', 'Autre',
    ],
};

type Json = Record<string, unknown>;
const ok = <T,>(data: T) => ({ success: true, data });
const uid = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'id-' + Math.random().toString(36).slice(2));

const stripQuery = (ep: string) => {
    const i = ep.indexOf('?');
    return i >= 0 ? ep.slice(0, i) : ep;
};
const queryParams = (ep: string): Record<string, string> => {
    const i = ep.indexOf('?');
    if (i < 0) return {};
    return Object.fromEntries(new URLSearchParams(ep.slice(i + 1)));
};

const num = (v: unknown): number => {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(n) ? (n as number) : 0;
};

function create(coll: keyof DemoStore, body: Json): Json {
    const item = { id: uid(), created_at: new Date().toISOString(), ...body };
    (store[coll] as Json[]).unshift(item);
    return item;
}
function update(coll: keyof DemoStore, id: string, body: Json): Json | null {
    const arr = store[coll] as Json[];
    const idx = arr.findIndex((x) => x.id === id);
    if (idx < 0) return null;
    arr[idx] = { ...arr[idx], ...body };
    return arr[idx];
}
function remove(coll: keyof DemoStore, id: string): void {
    store[coll] = (store[coll] as Json[]).filter((x) => x.id !== id) as never;
}

// Dates are naive ISO strings ("YYYY-MM-DD…"): parse month/year textually to
// avoid UTC-vs-local shifts. Month is 1-based, like the API's `month` params.
const monthOf = (iso: string) => parseInt(iso.slice(5, 7), 10);
const yearOf = (iso: string) => parseInt(iso.slice(0, 4), 10);

const monthYearOf = (q: Record<string, string>) => {
    const now = new Date();
    return {
        month: q.month ? parseInt(q.month, 10) : now.getMonth() + 1,
        year: q.year ? parseInt(q.year, 10) : now.getFullYear(),
    };
};

const entriesForMonth = (month: number, year: number) =>
    (store.budgetEntries as Json[]).filter(
        (e) => monthOf(e.date as string) === month && yearOf(e.date as string) === year
    );

function dashboard() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const expenses = entriesForMonth(month, year).filter((e) => e.is_expense);
    const spentByCat: Record<string, number> = {};
    for (const e of expenses) spentByCat[e.category as string] = (spentByCat[e.category as string] || 0) + num(e.amount);
    // Like the server: only categories strictly OVER their limit for the current month.
    const budgetAlerts = (store.budgetLimits as Json[]).filter(
        (l) => num(l.month) === month && num(l.year) === year && (spentByCat[l.category as string] || 0) > num(l.monthly_limit)
    ).length;
    // Like the server: appointments starting within the next 7 days.
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
        upcomingAppointments: (store.appointments as Json[]).filter((a) => {
            const start = new Date(a.start_time as string);
            return start >= now && start <= in7Days;
        }).length,
        pendingTasks: (store.tasks as Json[]).filter((t) => !t.is_completed).length,
        shoppingItems: (store.shopping as Json[]).filter((s) => !s.is_checked).length,
        thisMonthExpenses: expenses.reduce((s, e) => s + num(e.amount), 0),
        budgetAlerts,
    };
}

// ── Rewards (gamified kids mode) ─────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const naiveNow = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const rewardTx = () => store.rewardTransactions as Json[];

// One 'earn' transaction per assigned member, like the server.
function awardTaskPoints(task: Json): void {
    const assigned = (task.assigned_to as string[]) || [];
    for (const memberId of assigned) {
        rewardTx().unshift({
            id: uid(), member_id: memberId, task_id: task.id, points: num(task.points),
            type: 'earn', note: task.title, created_at: naiveNow(),
        });
    }
}

// Consecutive-day streak ending today or yesterday (same rule as the server).
function computeStreak(days: Set<string>): number {
    const key = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const cursor = new Date();
    if (!days.has(key(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
        if (!days.has(key(cursor))) return 0;
    }
    let streak = 0;
    while (days.has(key(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function rewardsSummary() {
    const pointsValue = num((store.rewardSettings as Json).points_value) || 0.1;
    const tasks = store.tasks as Json[];
    const members = (store.familyMembers as Json[]).map((m) => {
        const txs = rewardTx().filter((t) => t.member_id === m.id);
        const balance = txs.reduce((s, t) => s + num(t.points), 0);
        const pending = tasks.filter(
            (t) => t.pending_approval && ((t.assigned_to as string[]) || []).includes(m.id as string)
        ).length;
        const days = new Set<string>();
        for (const t of txs) if (t.type === 'earn') days.add((t.created_at as string).slice(0, 10));
        for (const t of tasks) {
            if (t.is_completed && t.completed_at && ((t.assigned_to as string[]) || []).includes(m.id as string)) {
                days.add((t.completed_at as string).slice(0, 10));
            }
        }
        return {
            id: m.id, name: m.name, color: m.color, role: m.role,
            linked_user_id: (m.linked_user_id as string) ?? null,
            balance,
            currency_value: Math.round(balance * pointsValue * 100) / 100,
            pending_count: pending,
            streak: computeStreak(days),
            has_activity: txs.length > 0,
        };
    });
    const membersById = new Map((store.familyMembers as Json[]).map((m) => [m.id, m]));
    const pendingTasks = tasks.filter((t) => t.pending_approval).map((t) => ({
        id: t.id, title: t.title, points: num(t.points),
        assigned_to_members: ((t.assigned_to as string[]) || [])
            .map((mid) => membersById.get(mid))
            .filter(Boolean)
            .map((m) => ({ id: (m as Json).id, name: (m as Json).name, color: (m as Json).color })),
    }));
    return { points_value: pointsValue, currency: (store.user.currency as string) || 'EUR', members, pending_tasks: pendingTasks };
}

function taskStats() {
    const tasks = store.tasks as Json[];
    const total = tasks.length;
    const completed = tasks.filter((t) => t.is_completed).length;
    const pending = total - completed;
    const byPriority = { Haute: 0, Moyenne: 0, Basse: 0 } as Record<string, number>;
    for (const t of tasks) if (t.priority) byPriority[t.priority as string] = (byPriority[t.priority as string] || 0) + 1;
    return { total, completed, pending, completionRate: total ? Math.round((completed / total) * 100) : 0, byPriority };
}

// Pointing status is tracked per month/year, like the server's
// recurring_expense_logs table. The seed's is_pointed flags are the baseline
// for the current month; other months start unpointed.
const recurringLogs = new Map<string, boolean>();
const logKey = (id: string, month: number, year: number) => `${id}:${month}:${year}`;

function recurringForMonth(month: number, year: number): Json[] {
    const now = new Date();
    const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
    return (store.budgetRecurring as Json[])
        .filter((r) => r.is_active !== false)
        .map((r) => {
            const logged = recurringLogs.get(logKey(r.id as string, month, year));
            return { ...r, is_pointed: logged !== undefined ? logged : isCurrentMonth && Boolean(r.is_pointed) };
        });
}

function budgetForecast(month: number, year: number) {
    const entries = entriesForMonth(month, year);
    const income = entries.filter((e) => !e.is_expense).reduce((s, e) => s + num(e.amount), 0);
    const oneTimeExpenses = entries.filter((e) => e.is_expense).reduce((s, e) => s + num(e.amount), 0);
    const recurring = recurringForMonth(month, year);
    const pointedRecurring = recurring.filter((r) => r.is_pointed).reduce((s, r) => s + num(r.amount), 0);
    const unpointedRecurring = recurring.filter((r) => !r.is_pointed).reduce((s, r) => s + num(r.amount), 0);
    const currentBalance = income - oneTimeExpenses - pointedRecurring;
    return { income, oneTimeExpenses, pointedRecurring, unpointedRecurring, currentBalance, forecastBalance: currentBalance - unpointedRecurring };
}

function budgetStatistics(month: number, year: number) {
    const entries = entriesForMonth(month, year);
    const totalExpenses = entries.filter((e) => e.is_expense).reduce((s, e) => s + num(e.amount), 0);
    const totalIncome = entries.filter((e) => !e.is_expense).reduce((s, e) => s + num(e.amount), 0);
    const byCatMap: Record<string, number> = {};
    for (const e of entries) if (e.is_expense) byCatMap[e.category as string] = (byCatMap[e.category as string] || 0) + num(e.amount);
    const byCategory = Object.entries(byCatMap).map(([category, category_total]) => ({ category, category_total }));
    return { totalExpenses, totalIncome, balance: totalIncome - totalExpenses, byCategory };
}

function budgetMonthly(year: number) {
    return Array.from({ length: 12 }, (_, i) => {
        const stats = budgetStatistics(i + 1, year);
        return {
            month: i + 1,
            totalExpenses: stats.totalExpenses,
            totalIncome: stats.totalIncome,
            balance: stats.balance,
        };
    });
}

async function route(method: string, path: string, q: Record<string, string>, body: Json): Promise<unknown> {
    const seg = path.split('/').filter(Boolean); // e.g. ['api','tasks','123']
    const last = seg[seg.length - 1];

    // ── Auth ──────────────────────────────────────────────────────────────────
    if (path === '/api/auth/me') return ok({ user: store.user });
    if (path === '/api/auth/login' || path === '/api/auth/register' || path === '/api/auth/refresh' || path === '/api/invites/join' || path === '/api/invites/leave')
        return ok({ token: 'demo-token', user: store.user });
    if (path === '/api/auth/currency') { store.user = { ...store.user, currency: body.currency }; return ok({ user: store.user }); }
    if (path === '/api/auth/language') {
        if (body.language !== 'fr' && body.language !== 'en') throw new Error('Invalid language'); // mirrors the server's 400
        store.user = { ...store.user, language: body.language };
        return ok({ user: store.user });
    }
    if (path === '/api/auth/profile') { store.user = { ...store.user, ...body }; return ok({ user: store.user }); }
    if (path === '/api/auth/modules') {
        if (method === 'PUT') {
            const list = Array.isArray(body.disabled_modules) ? (body.disabled_modules as string[]) : [];
            const cleaned = Array.from(new Set(list));
            store.user = { ...store.user, disabled_modules: cleaned };
            return ok({ disabled_modules: cleaned });
        }
        return ok({ disabled_modules: (store.user.disabled_modules as string[]) ?? [] });
    }

    // ── Categories (family-customizable lists) ───────────────────────────────
    if (path === '/api/categories') {
        if (method === 'PUT') {
            const mod = body.module as string;
            const list = Array.isArray(body.categories) ? (body.categories as string[]) : [];
            if ((mod === 'shopping' || mod === 'recipe' || mod === 'budget') && list.length > 0) {
                demoCategories = { ...demoCategories, [mod]: list.map((c) => String(c).trim()).filter(Boolean) };
            }
        }
        return ok({ categories: demoCategories });
    }

    // ── Dashboard ───────────────────────────────────────────────────────────
    if (path === '/api/dashboard') return ok(dashboard());

    // ── Shopping ──────────────────────────────────────────────────────────────
    if (path === '/api/shopping' && method === 'GET') return ok(store.shopping);
    if (path === '/api/shopping' && method === 'POST') return ok(create('shopping', { is_checked: false, ...body }));
    if (path === '/api/shopping/templates' && method === 'GET') return ok(store.shoppingTemplates);
    if (path === '/api/shopping/templates' && method === 'POST') return ok(create('shoppingTemplates', body));
    if (path === '/api/shopping/checked/clear') { store.shopping = (store.shopping as Json[]).filter((s) => !s.is_checked) as never; return ok({}); }
    if (seg[1] === 'shopping' && seg[2] === 'templates' && seg[4] === 'apply') {
        const tpl = (store.shoppingTemplates as Json[]).find((t) => t.id === seg[3]);
        const items = (tpl?.items as Json[]) || [];
        for (const it of items) create('shopping', { is_checked: false, ...it });
        return ok({});
    }
    if (seg[1] === 'shopping' && seg[2] === 'templates' && method === 'DELETE') { remove('shoppingTemplates', seg[3]); return ok({}); }
    if (seg[1] === 'shopping' && seg.length === 3) {
        if (method === 'PUT') return ok(update('shopping', seg[2], body));
        if (method === 'DELETE') { remove('shopping', seg[2]); return ok({}); }
    }

    // ── Family ────────────────────────────────────────────────────────────────
    if (path === '/api/family' && method === 'GET') return ok(store.familyMembers);
    if (path === '/api/family' && method === 'POST') return ok(create('familyMembers', body));
    // Link a member profile to a user account (one profile per account, like the server).
    if (seg[1] === 'family' && seg.length === 4 && seg[3] === 'link' && method === 'PUT') {
        const targetUserId = (body.user_id as string) || null;
        if (targetUserId) {
            for (const m of store.familyMembers as Json[]) {
                if (m.linked_user_id === targetUserId && m.id !== seg[2]) m.linked_user_id = null;
            }
        }
        return ok(update('familyMembers', seg[2], { linked_user_id: targetUserId }));
    }
    if (seg[1] === 'family' && seg.length === 3) {
        if (method === 'PUT') return ok(update('familyMembers', seg[2], body));
        if (method === 'DELETE') { remove('familyMembers', seg[2]); return ok({}); }
    }

    // ── Tasks ─────────────────────────────────────────────────────────────────
    if (path === '/api/tasks' && method === 'GET') return ok(store.tasks);
    if (path === '/api/tasks' && method === 'POST') return ok(create('tasks', { is_completed: false, points: 0, pending_approval: false, ...body }));
    if (path === '/api/tasks/statistics') return ok(taskStats());
    // Parent approval of a child-completed chore (the demo account is a parent).
    if (seg[1] === 'tasks' && seg.length === 4 && (seg[3] === 'approve' || seg[3] === 'reject') && method === 'POST') {
        const task = (store.tasks as Json[]).find((x) => x.id === seg[2]);
        if (!task) return ok(null);
        if (seg[3] === 'approve') {
            if (task.pending_approval && num(task.points) > 0) awardTaskPoints(task);
            return ok(update('tasks', seg[2], { pending_approval: false }));
        }
        return ok(update('tasks', seg[2], { pending_approval: false, is_completed: false, completed_at: undefined }));
    }
    if (seg[1] === 'tasks' && seg.length === 3) {
        if (method === 'PUT') {
            const existing = (store.tasks as Json[]).find((x) => x.id === seg[2]);
            const wasCompleted = Boolean(existing?.is_completed);
            const updated = update('tasks', seg[2], body);
            if (updated && body.is_completed === true && !wasCompleted) {
                updated.completed_at = naiveNow();
                // The demo user is a parent → award immediately (false→true only).
                if (num(updated.points) > 0 && ((updated.assigned_to as string[]) || []).length > 0) {
                    awardTaskPoints(updated);
                }
            }
            if (updated && body.is_completed === false && wasCompleted) {
                // Reverse the current completion: drop its earn transactions.
                const since = (existing?.completed_at as string) || '';
                store.rewardTransactions = rewardTx().filter(
                    (t) => !(t.task_id === seg[2] && t.type === 'earn' && (t.created_at as string) >= since)
                ) as never;
                updated.pending_approval = false;
                updated.completed_at = undefined;
            }
            return ok(updated);
        }
        if (method === 'DELETE') { remove('tasks', seg[2]); return ok({}); }
    }

    // ── Rewards ─────────────────────────────────────────────────────────────────
    if (path === '/api/rewards/summary') return ok(rewardsSummary());
    if (path === '/api/rewards/transactions') {
        let list = rewardTx();
        if (q.member_id) list = list.filter((t) => t.member_id === q.member_id);
        return ok([...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50));
    }
    if (path === '/api/rewards/adjust' && method === 'POST') {
        const item = { id: uid(), member_id: body.member_id, task_id: null, points: num(body.points), type: 'adjust', note: body.note || null, created_at: naiveNow() };
        rewardTx().unshift(item);
        return ok(item);
    }
    if (path === '/api/rewards/redeem' && method === 'POST') {
        const item = { id: uid(), member_id: body.member_id, task_id: null, points: -Math.abs(num(body.points)), type: 'redeem', note: body.note || null, created_at: naiveNow() };
        rewardTx().unshift(item);
        return ok(item);
    }
    if (path === '/api/rewards/settings' && method === 'GET') return ok({ points_value: num((store.rewardSettings as Json).points_value) || 0.1 });
    if (path === '/api/rewards/settings' && method === 'PUT') {
        store.rewardSettings = { points_value: num(body.points_value) };
        return ok({ points_value: num(body.points_value) });
    }
    // Savings goals (one active goal per member, like the server).
    if (path === '/api/rewards/goals' && method === 'GET') return ok(store.rewardGoals);
    if (path === '/api/rewards/goals' && method === 'POST') {
        const hasActive = (store.rewardGoals as Json[]).some((g) => g.member_id === body.member_id && g.status === 'active');
        if (hasActive) throw new Error('An active goal already exists for this member');
        return ok(create('rewardGoals', {
            member_id: body.member_id,
            title: String(body.title || '').trim(),
            emoji: body.emoji ? String(body.emoji).trim().slice(0, 16) : null,
            target_amount: Math.round(num(body.target_amount) * 100) / 100,
            status: 'active',
            achieved_at: null,
        }));
    }
    // Parent marks the goal achieved → auto-redeem the equivalent points, capped at the balance.
    if (seg[1] === 'rewards' && seg[2] === 'goals' && seg.length === 5 && seg[4] === 'achieve' && method === 'POST') {
        const goal = (store.rewardGoals as Json[]).find((g) => g.id === seg[3] && g.status === 'active');
        if (!goal) return ok(null);
        update('rewardGoals', seg[3], { status: 'achieved', achieved_at: naiveNow() });
        const pointsValue = num((store.rewardSettings as Json).points_value) || 0.1;
        const balance = rewardTx().filter((t) => t.member_id === goal.member_id).reduce((s, t) => s + num(t.points), 0);
        const redeemPoints = Math.min(Math.max(Math.round(num(goal.target_amount) / pointsValue), 0), Math.max(balance, 0));
        if (redeemPoints > 0) {
            rewardTx().unshift({
                id: uid(), member_id: goal.member_id, task_id: null, points: -redeemPoints,
                type: 'redeem', note: goal.emoji ? `${goal.emoji} ${goal.title}` : goal.title, created_at: naiveNow(),
            });
        }
        return ok({ ...goal, redeemed_points: redeemPoints });
    }
    if (seg[1] === 'rewards' && seg[2] === 'goals' && seg.length === 4) {
        if (method === 'PUT') return ok(update('rewardGoals', seg[3], {
            ...(body.title !== undefined ? { title: String(body.title || '').trim() } : {}),
            ...(body.emoji !== undefined ? { emoji: body.emoji ? String(body.emoji).trim().slice(0, 16) : null } : {}),
            ...(body.target_amount !== undefined ? { target_amount: Math.round(num(body.target_amount) * 100) / 100 } : {}),
        }));
        if (method === 'DELETE') { remove('rewardGoals', seg[3]); return ok({}); }
    }

    // ── Appointments / calendar ────────────────────────────────────────────────
    if (path === '/api/appointments' && method === 'GET') {
        let list = store.appointments as Json[];
        // Like the server, match any appointment OVERLAPPING the range:
        // COALESCE(end_time, start_time) >= start_date AND start_time <= end_date.
        // Timestamps are naive "YYYY-MM-DDTHH:mm:ss" strings, so plain string
        // comparison is correct.
        if (q.start_date) list = list.filter((a) => ((a.end_time as string) || (a.start_time as string)) >= q.start_date);
        if (q.end_date) list = list.filter((a) => (a.start_time as string) <= q.end_date);
        return ok(list);
    }
    if (path === '/api/appointments' && method === 'POST') return ok(create('appointments', body));
    if (seg[1] === 'appointments' && seg.length === 3) {
        if (method === 'PUT') return ok(update('appointments', seg[2], body));
        if (method === 'DELETE') { remove('appointments', seg[2]); return ok({}); }
    }
    if (path === '/api/calendar/token' || path === '/api/calendar/token/reset') return ok({ token: 'demo-ical-token' });

    // ── Planning ────────────────────────────────────────────────────────────────
    if (path === '/api/planning' && method === 'GET') return ok(store.planning);
    if (path === '/api/planning' && method === 'POST') return ok(create('planning', body));
    if (path === '/api/planning/bulk') {
        const days = (body.day_of_week_list as number[]) || [];
        const created = days.map((d) => create('planning', { ...body, day_of_week: d }));
        return ok({ entries: created, created: created.length, updated: 0, conflicts: [] });
    }
    if (seg[1] === 'planning' && seg.length === 3) {
        if (method === 'PUT') return ok(update('planning', seg[2], body));
        if (method === 'DELETE') { remove('planning', seg[2]); return ok({}); }
    }

    // ── Recipes ─────────────────────────────────────────────────────────────────
    if (path === '/api/recipes/import-url' && method === 'POST') {
        // Static demo: no server to fetch/parse the page (CORS would block it
        // anyway), so return a canned parsed recipe after a realistic delay.
        await new Promise((resolve) => setTimeout(resolve, 900));
        return ok({
            name: 'Ratatouille traditionnelle',
            category: 'Plat',
            description: 'La ratatouille provençale mijotée : des légumes du soleil fondants, parfumés au thym et à l\'huile d\'olive.',
            ingredients: [
                '2 aubergines',
                '3 courgettes',
                '2 poivrons (1 rouge, 1 jaune)',
                '4 tomates bien mûres',
                '2 oignons',
                '3 gousses d\'ail',
                '4 c. à soupe d\'huile d\'olive',
                '1 bouquet garni (thym, laurier)',
                'Sel et poivre du moulin',
            ],
            instructions: [
                'Laver et couper tous les légumes en dés réguliers.',
                'Faire revenir les oignons et l\'ail émincés dans l\'huile d\'olive.',
                'Ajouter les poivrons, puis les aubergines et les courgettes, et faire dorer 10 minutes.',
                'Incorporer les tomates concassées et le bouquet garni, saler et poivrer.',
                'Couvrir et laisser mijoter 45 minutes à feu doux en remuant de temps en temps.',
                'Rectifier l\'assaisonnement et servir bien chaud, ou tiède avec un filet d\'huile d\'olive.',
            ],
            prep_time: 25,
            cook_time: 55,
            servings: 6,
            difficulty: null,
            tags: ['provençal', 'légumes', 'été', 'végétarien'],
            image_url: null,
        });
    }
    if (path === '/api/recipes' && method === 'GET') return ok(store.recipes);
    if (path === '/api/recipes' && method === 'POST') return ok(create('recipes', body));
    if (seg[1] === 'recipes' && seg.length === 3) {
        if (method === 'PUT') return ok(update('recipes', seg[2], body));
        if (method === 'DELETE') { remove('recipes', seg[2]); return ok({}); }
    }

    // ── Meal plans ──────────────────────────────────────────────────────────────
    if (path === '/api/meal-plans' && method === 'GET') {
        let list = store.mealPlans as Json[];
        if (q.start_date && q.end_date) {
            list = list.filter((mp) => (mp.date as string) >= q.start_date && (mp.date as string) <= q.end_date);
        }
        return ok(list);
    }
    if (path === '/api/meal-plans' && method === 'POST') {
        const recipe = (store.recipes as Json[]).find((r) => r.id === body.recipe_id);
        return ok(create('mealPlans', { ...body, recipe: recipe ? { id: recipe.id, name: recipe.name } : undefined }));
    }
    if (seg[1] === 'meal-plans' && seg.length === 3) {
        if (method === 'PUT') {
            const recipe = (store.recipes as Json[]).find((r) => r.id === body.recipe_id);
            return ok(update('mealPlans', seg[2], { ...body, recipe: recipe ? { id: recipe.id, name: recipe.name } : undefined }));
        }
        if (method === 'DELETE') { remove('mealPlans', seg[2]); return ok({}); }
    }

    // ── Budget ──────────────────────────────────────────────────────────────────
    if (path === '/api/budget/forecast') { const { month, year } = monthYearOf(q); return ok(budgetForecast(month, year)); }
    if (path === '/api/budget/statistics') { const { month, year } = monthYearOf(q); return ok(budgetStatistics(month, year)); }
    if (path === '/api/budget/statistics/monthly') return ok(budgetMonthly(monthYearOf(q).year));
    if (path === '/api/budget/recurring' && method === 'GET') { const { month, year } = monthYearOf(q); return ok(recurringForMonth(month, year)); }
    if (path === '/api/budget/recurring' && method === 'POST') return ok(create('budgetRecurring', { is_active: true, is_pointed: false, ...body }));
    if (seg[1] === 'budget' && seg[2] === 'recurring' && seg[4] === 'point') {
        const now = new Date();
        const month = num(body.month) || now.getMonth() + 1;
        const year = num(body.year) || now.getFullYear();
        recurringLogs.set(logKey(seg[3], month, year), Boolean(body.is_pointed));
        const item = (store.budgetRecurring as Json[]).find((r) => r.id === seg[3]);
        return ok({ ...item, is_pointed: Boolean(body.is_pointed) });
    }
    if (seg[1] === 'budget' && seg[2] === 'recurring' && seg.length === 4) {
        if (method === 'PUT') return ok(update('budgetRecurring', seg[3], body));
        if (method === 'DELETE') { remove('budgetRecurring', seg[3]); return ok({}); }
    }
    if (path === '/api/budget/entries' && method === 'GET') {
        let list = store.budgetEntries as Json[];
        if (q.start_date) list = list.filter((e) => (e.date as string) >= q.start_date);
        if (q.end_date) list = list.filter((e) => (e.date as string) <= q.end_date);
        return ok(list);
    }
    if (path === '/api/budget/entries' && method === 'POST') return ok(create('budgetEntries', body));
    if (seg[1] === 'budget' && seg[2] === 'entries' && seg.length === 4) {
        if (method === 'PUT') return ok(update('budgetEntries', seg[3], body));
        if (method === 'DELETE') { remove('budgetEntries', seg[3]); return ok({}); }
    }
    if (path === '/api/budget/limits' && method === 'GET') {
        let list = store.budgetLimits as Json[];
        if (q.month) list = list.filter((l) => num(l.month) === parseInt(q.month, 10));
        if (q.year) list = list.filter((l) => num(l.year) === parseInt(q.year, 10));
        return ok(list);
    }
    if (path === '/api/budget/limits' && method === 'POST') {
        const existing = (store.budgetLimits as Json[]).find((l) => l.category === body.category);
        if (existing) return ok(update('budgetLimits', existing.id as string, body));
        return ok(create('budgetLimits', body));
    }

    // ── AI assistant ────────────────────────────────────────────────────────────
    // The demo pretends a local Ollama is configured so the ✨ features show up.
    if (path === '/api/ai/settings' && method === 'GET') {
        return ok({ configured: true, enabled: true, provider: 'ollama', base_url: 'http://localhost:11434', model: 'llama3.1', has_api_key: false });
    }
    if (path === '/api/ai/settings' && method === 'PUT') {
        return ok({
            configured: true,
            enabled: body.enabled !== false,
            provider: (body.provider as string) || 'ollama',
            base_url: (body.base_url as string) ?? null,
            model: (body.model as string) || 'llama3.1',
            has_api_key: Boolean(body.api_key),
        });
    }
    if (path === '/api/ai/test' && method === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return { success: true, message: 'OK' };
    }
    if (path === '/api/ai/parse' && method === 'POST') {
        // Canned heuristic: no model runs in the browser — derive 2 plausible
        // proposals from the note so the review→confirm flow can be demoed.
        await new Promise((resolve) => setTimeout(resolve, 900));
        const text = String(body.text || '').trim();
        const firstWords = text.split(/\s+/).slice(0, 4).join(' ') || 'Lasagnes';
        const label = firstWords.charAt(0).toUpperCase() + firstWords.slice(1);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowIso = `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`;
        return ok({
            items: [
                { type: 'shopping_item', name: label, category: 'Alimentation', quantity: null, unit: null },
                { type: 'task', title: `Rappel : ${label}`, description: null, due_date: tomorrowIso, priority: 'Moyenne', frequency: 'Une fois', assigned_to: ['m-kid1'], member_names: ['Mia'] },
            ],
        });
    }
    if (path === '/api/ai/suggest-meals' && method === 'POST') {
        // Assign the seeded recipes round-robin to the week's dinner-less days.
        await new Promise((resolve) => setTimeout(resolve, 900));
        const weekStartIso = String(body.week_start || '').slice(0, 10);
        const weekStartDate = new Date(`${weekStartIso}T12:00:00`);
        const recipePool = store.recipes as Json[];
        if (Number.isNaN(weekStartDate.getTime()) || recipePool.length === 0) return ok({ proposals: [] });
        const plannedDinners = new Set(
            (store.mealPlans as Json[]).filter((mp) => mp.meal_type === 'Dîner').map((mp) => mp.date as string)
        );
        const proposals: Json[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStartDate);
            d.setDate(d.getDate() + i);
            const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
            if (plannedDinners.has(iso)) continue;
            const recipe = recipePool[proposals.length % recipePool.length];
            proposals.push({ date: iso, meal_type: 'Dîner', recipe_id: recipe.id, recipe_name: recipe.name });
        }
        return ok({ proposals });
    }

    // ── Integrations ────────────────────────────────────────────────────────────
    if (path === '/api/integrations' && method === 'GET') return ok(store.integrations);
    if (path === '/api/integrations/test') return { success: true, message: 'Connection successful (demo).' };
    if (path === '/api/integrations' && method === 'POST') return ok(create('integrations', { display_name: body.type, base_url: body.base_url, status: 'connected', last_synced_at: new Date().toISOString(), last_error: null, ...body }));
    if (seg[1] === 'integrations' && seg[3] === 'sync') return ok({});
    if (seg[1] === 'integrations' && seg.length === 3 && method === 'DELETE') { remove('integrations', seg[2]); return ok({}); }

    // ── Invites (read-only-ish in demo) ─────────────────────────────────────────
    if (path === '/api/invites/members') return ok([{ id: store.user.id, name: store.user.name, email: store.user.email, is_owner: true, role: 'parent' }]);
    if (path === '/api/invites/requests') return ok([]);
    if (path === '/api/invites/requests/mine') return ok(null);
    if (path === '/api/invites' && method === 'POST') return ok({ token: 'demo-invite-token' });
    if (seg[1] === 'invites') return ok({});

    // ── Family notes (fridge post-its) ──────────────────────────────────────────
    if (path === '/api/notes' && method === 'GET') {
        // Like the server: drop expired notes, newest first (naive local strings
        // compare correctly as plain strings).
        const cutoff = naiveNow();
        const list = (store.notes as Json[]).filter((n) => !n.expires_at || (n.expires_at as string) > cutoff);
        return ok([...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
    }
    if (path === '/api/notes' && method === 'POST') {
        return ok(create('notes', {
            author_name: store.user.name,
            content: String(body.content || '').trim().slice(0, 500),
            color: body.color || 'yellow',
            expires_at: (body.expires_at as string) || null,
            created_at: naiveNow(),
        }));
    }
    if (seg[1] === 'notes' && seg.length === 3) {
        if (method === 'PUT') return ok(update('notes', seg[2], body));
        if (method === 'DELETE') { remove('notes', seg[2]); return ok({}); }
    }

    // ── Notifications ───────────────────────────────────────────────────────────
    if (path === '/api/notifications' && method === 'GET') return ok(store.notifications);
    if (path === '/api/notifications/unread-count') return ok({ count: (store.notifications as Json[]).filter((n) => !n.is_read).length });
    if (path === '/api/notifications/vapid-public-key') return ok('');
    if (path === '/api/notifications/subscribe') return ok({});
    if (path === '/api/notifications/read-all') { store.notifications = (store.notifications as Json[]).map((n) => ({ ...n, is_read: true })) as never; return ok({}); }
    if (seg[1] === 'notifications' && last === 'read') { update('notifications', seg[2], { is_read: true }); return ok({}); }

    // ── Data export/import ──────────────────────────────────────────────────────
    if (path === '/api/data/export') return ok(store);
    if (path === '/api/data/import') return ok({ imported: {} });

    // Fallback: empty success so the UI never crashes in the demo.
    return ok([]);
}

export async function mockRequest<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const path = stripQuery(endpoint);
    const q = queryParams(endpoint);
    const result = await route(method.toUpperCase(), path, q, (body as Json) || {});
    return result as T;
}
