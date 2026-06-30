// Seed data for the static GitHub Pages demo. Everything lives in memory and is
// regenerated on every page load — nothing is persisted. Dates are computed
// relative to "now" so the demo always looks current.

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const y = now.getFullYear();
const m = now.getMonth(); // 0-based

const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const atTime = (d: Date, h: number, min = 0) =>
    `${isoDate(d)}T${pad(h)}:${pad(min)}:00`;
const dayInMonth = (day: number) => new Date(y, m, day);
const addDays = (base: Date, days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
};

// Monday of the current week
const monday = (() => {
    const d = new Date(now);
    const diff = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
})();

export interface DemoStore {
    user: Record<string, unknown>;
    familyMembers: Record<string, unknown>[];
    shopping: Record<string, unknown>[];
    shoppingTemplates: Record<string, unknown>[];
    tasks: Record<string, unknown>[];
    appointments: Record<string, unknown>[];
    planning: Record<string, unknown>[];
    recipes: Record<string, unknown>[];
    mealPlans: Record<string, unknown>[];
    budgetEntries: Record<string, unknown>[];
    budgetRecurring: Record<string, unknown>[];
    budgetLimits: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
    notes: Record<string, unknown>[];
    integrations: Record<string, unknown>[];
    rewardTransactions: Record<string, unknown>[];
    rewardSettings: Record<string, unknown>;
    rewardGoals: Record<string, unknown>[];
}

export function createSeed(): DemoStore {
    const dad = { id: 'm-dad', name: 'Alex', role: 'Parent', color: '#2563EB', birthdate: '1986-04-12' };
    const mom = { id: 'm-mom', name: 'Sam', role: 'Parent', color: '#DB2777', birthdate: '1988-09-03' };
    const kid1 = { id: 'm-kid1', name: 'Mia', role: 'Enfant', color: '#16A34A', birthdate: `${y - 9}-02-18`, allergies: ['Peanuts'] };
    const kid2 = { id: 'm-kid2', name: 'Noah', role: 'Enfant', color: '#F97316', birthdate: `${y - 6}-11-27` };

    return {
        user: {
            id: 'demo-user',
            email: 'demo@openfamily.app',
            name: 'Demo Family',
            currency: 'EUR',
            is_owner: true,
            role: 'parent',
            avatar_url: null,
            // Nothing hidden by default → the demo shows every module.
            disabled_modules: [],
        },
        familyMembers: [dad, mom, kid1, kid2],
        shopping: [
            { id: 's1', name: 'Milk', category: 'Alimentation', quantity: 2, unit: 'L', price: 1.2, is_checked: false },
            { id: 's2', name: 'Bread', category: 'Alimentation', quantity: 1, price: 1.5, is_checked: false },
            { id: 's3', name: 'Apples', category: 'Alimentation', quantity: 6, price: 0.4, is_checked: false },
            { id: 's4', name: 'Pasta', category: 'Alimentation', quantity: 3, price: 0.9, is_checked: true },
            { id: 's5', name: 'Diapers', category: 'Bebe', quantity: 1, price: 12.9, is_checked: false },
            { id: 's6', name: 'Dish soap', category: 'Menage', quantity: 1, price: 2.3, is_checked: false },
            { id: 's7', name: 'Toothpaste', category: 'Sante', quantity: 2, price: 2.1, is_checked: false },
        ],
        shoppingTemplates: [
            {
                id: 't1', name: 'Weekly basics', items: [
                    { name: 'Milk', category: 'Alimentation', quantity: 2, unit: 'L' },
                    { name: 'Bread', category: 'Alimentation', quantity: 1 },
                    { name: 'Eggs', category: 'Alimentation', quantity: 12 },
                ],
            },
        ],
        tasks: [
            { id: 'tk1', title: 'Take out the trash', is_completed: false, frequency: 'Hebdomadaire', priority: 'Moyenne', assigned_to: ['m-kid1'], assigned_to_members: [kid1], due_date: atTime(addDays(now, 1), 18), created_at: atTime(now, 9), points: 5, pending_approval: false },
            { id: 'tk2', title: 'Homework — math', is_completed: false, frequency: 'Quotidien', priority: 'Haute', assigned_to: ['m-kid1'], assigned_to_members: [kid1], due_date: atTime(now, 17), created_at: atTime(now, 9), points: 10, pending_approval: false },
            { id: 'tk3', title: 'Water the plants', is_completed: true, frequency: 'Une fois', priority: 'Basse', assigned_to: ['m-mom'], assigned_to_members: [mom], completed_at: atTime(now, 8), created_at: atTime(addDays(now, -1), 9), points: 0, pending_approval: false },
            { id: 'tk4', title: 'Book dentist appointment', is_completed: false, frequency: 'Une fois', priority: 'Moyenne', assigned_to: ['m-dad'], assigned_to_members: [dad], created_at: atTime(now, 10), points: 0, pending_approval: false },
            // Completed by a child — waiting for a parent's approval (showcases the queue).
            { id: 'tk5', title: 'Tidy up the bedroom', is_completed: true, frequency: 'Hebdomadaire', priority: 'Moyenne', assigned_to: ['m-kid2'], assigned_to_members: [kid2], completed_at: atTime(now, 10, 30), created_at: atTime(addDays(now, -1), 9), points: 8, pending_approval: true },
        ],
        appointments: [
            { id: 'a1', title: 'Dentist — Mia', start_time: atTime(dayInMonth(now.getDate()), 15), end_time: atTime(dayInMonth(now.getDate()), 16), location: 'City Dental', family_member_ids: ['m-kid1'], family_members_data: [kid1], reminder_30min: true, reminder_1hour: false },
            { id: 'a2', title: 'Football practice', start_time: atTime(addDays(now, 2), 18), end_time: atTime(addDays(now, 2), 19, 30), location: 'Stadium', family_member_ids: ['m-kid2'], family_members_data: [kid2], reminder_30min: false, reminder_1hour: true },
            { id: 'a3', title: 'Family dinner', start_time: atTime(addDays(now, 5), 20), location: 'Home', family_member_ids: ['m-dad', 'm-mom', 'm-kid1', 'm-kid2'], family_members_data: [dad, mom, kid1, kid2], reminder_30min: false, reminder_1hour: false },
        ],
        planning: [
            { id: 'p1', family_member_id: 'm-dad', family_member_name: 'Alex', family_member_color: '#2563EB', family_member_role: 'Parent', schedule_type: 'work', title: 'Office', day_of_week: 1, start_time: '09:00', end_time: '17:30' },
            { id: 'p2', family_member_id: 'm-dad', family_member_name: 'Alex', family_member_color: '#2563EB', family_member_role: 'Parent', schedule_type: 'work', title: 'Office', day_of_week: 2, start_time: '09:00', end_time: '17:30' },
            { id: 'p3', family_member_id: 'm-kid1', family_member_name: 'Mia', family_member_color: '#16A34A', family_member_role: 'Enfant', schedule_type: 'school', title: 'School', day_of_week: 1, start_time: '08:30', end_time: '16:30' },
            { id: 'p4', family_member_id: 'm-kid1', family_member_name: 'Mia', family_member_color: '#16A34A', family_member_role: 'Enfant', schedule_type: 'school', title: 'School', day_of_week: 2, start_time: '08:30', end_time: '16:30' },
            { id: 'p5', family_member_id: 'm-kid2', family_member_name: 'Noah', family_member_color: '#F97316', family_member_role: 'Enfant', schedule_type: 'activity', title: 'Football', day_of_week: 3, start_time: '18:00', end_time: '19:30' },
        ],
        recipes: [
            { id: 'r1', name: 'Spaghetti Bolognese', category: 'Plat', description: 'A family classic everyone loves.', ingredients: ['400g spaghetti', '500g minced beef', '1 onion', '2 cans chopped tomatoes', 'Olive oil', 'Salt & pepper'], instructions: ['Brown the beef and onion.', 'Add the tomatoes and simmer 20 min.', 'Cook the spaghetti.', 'Combine and serve.'], prep_time: 15, cook_time: 30, servings: 4, difficulty: 'Facile', tags: ['quick', 'family'] },
            { id: 'r2', name: 'Apple Pie', category: 'Dessert', description: 'Warm and comforting.', ingredients: ['6 apples', '200g flour', '100g butter', '100g sugar', '1 egg'], instructions: ['Make the dough.', 'Slice the apples.', 'Assemble and bake at 180°C for 40 min.'], prep_time: 30, cook_time: 40, servings: 6, difficulty: 'Moyen', tags: ['dessert'] },
            { id: 'r3', name: 'Garden Salad', category: 'Entrée', description: 'Fresh and light.', ingredients: ['Lettuce', 'Tomatoes', 'Cucumber', 'Olive oil', 'Vinegar'], instructions: ['Chop the vegetables.', 'Dress and toss.'], prep_time: 10, cook_time: 0, servings: 4, difficulty: 'Facile', tags: ['vegetarian', 'healthy'] },
        ],
        mealPlans: [
            { id: 'mp1', date: isoDate(now), meal_type: 'Petit-déjeuner', custom_meal: 'Pancakes & fruit' },
            { id: 'mp2', date: isoDate(now), meal_type: 'Déjeuner', recipe_id: 'r3', recipe: { id: 'r3', name: 'Garden Salad' } },
            { id: 'mp3', date: isoDate(now), meal_type: 'Dîner', recipe_id: 'r1', recipe: { id: 'r1', name: 'Spaghetti Bolognese' } },
            { id: 'mp4', date: isoDate(monday), meal_type: 'Dîner', custom_meal: 'Homemade pizza' },
            { id: 'mp5', date: isoDate(addDays(monday, 4)), meal_type: 'Dîner', recipe_id: 'r3', recipe: { id: 'r3', name: 'Garden Salad' } },
            { id: 'mp6', date: isoDate(addDays(monday, 5)), meal_type: 'Snack', recipe_id: 'r2', recipe: { id: 'r2', name: 'Apple Pie' } },
        ],
        budgetEntries: [
            { id: 'b1', category: 'Alimentation', amount: 84.3, description: 'Weekly groceries', date: isoDate(dayInMonth(3)), is_expense: true },
            { id: 'b2', category: 'Transport', amount: 60, description: 'Fuel', date: isoDate(dayInMonth(6)), is_expense: true },
            { id: 'b3', category: 'Loisirs', amount: 32, description: 'Cinema', date: isoDate(dayInMonth(9)), is_expense: true },
            { id: 'b4', category: 'Enfants', amount: 45, description: 'School supplies', date: isoDate(dayInMonth(11)), is_expense: true },
            { id: 'b5', category: 'Logement', amount: 2600, description: 'Salary', date: isoDate(dayInMonth(1)), is_expense: false },
        ],
        budgetRecurring: [
            { id: 'rc1', label: 'Rent', amount: 950, category: 'Logement', debit_day: 5, is_active: true, is_pointed: true },
            { id: 'rc2', label: 'Electricity', amount: 110, category: 'Logement', debit_day: 10, is_active: true, is_pointed: false },
            { id: 'rc3', label: 'Internet', amount: 39.9, category: 'Abonnements', debit_day: 15, is_active: true, is_pointed: false },
            { id: 'rc4', label: 'Insurance', amount: 75, category: 'Assurance', debit_day: 8, is_active: true, is_pointed: true },
        ],
        budgetLimits: [
            { id: 'l1', category: 'Alimentation', monthly_limit: 400, month: m + 1, year: y },
            { id: 'l2', category: 'Loisirs', monthly_limit: 100, month: m + 1, year: y },
        ],
        notifications: [
            { id: 'n1', title: 'Reminder', message: 'Dentist appointment for Mia at 3:00 PM', type: 'appointment', is_read: false, related_id: 'a1', created_at: atTime(now, 8) },
            { id: 'n2', title: 'Task due', message: 'Homework — math is due today', type: 'task', is_read: false, related_id: 'tk2', created_at: atTime(now, 7, 30) },
            { id: 'n3', title: 'Budget alert', message: 'Leisure spending is at 80% of the monthly limit', type: 'budget', is_read: true, related_id: null, created_at: atTime(addDays(now, -1), 19) },
        ],
        // Fridge post-its (no expiry so they always show in the demo)
        notes: [
            { id: 'fn1', author_name: 'Alex', content: 'Papi & Mamie arrivent samedi midi', color: 'yellow', expires_at: null, created_at: atTime(now, 8, 5) },
            { id: 'fn2', author_name: 'Sam', content: 'Pensez au sac de piscine pour mercredi 🏊', color: 'pink', expires_at: null, created_at: atTime(addDays(now, -1), 18, 40) },
        ],
        integrations: [],
        // Pocket-money ledger: Mia has a streak going, Noah just started.
        rewardTransactions: [
            // Birthday bonus weeks ago: brings Mia's balance to 100 pts (20 €) so her
            // savings-goal bar sits at ~67% of the 30 € target below.
            { id: 'rt0', member_id: 'm-kid1', task_id: null, points: 90, type: 'adjust', note: 'Birthday money 🎂', created_at: atTime(addDays(now, -12), 11) },
            { id: 'rt1', member_id: 'm-kid1', task_id: 'tk1', points: 5, type: 'earn', note: 'Take out the trash', created_at: atTime(addDays(now, -3), 18, 15) },
            { id: 'rt2', member_id: 'm-kid1', task_id: 'tk2', points: 10, type: 'earn', note: 'Homework — math', created_at: atTime(addDays(now, -2), 17, 40) },
            { id: 'rt3', member_id: 'm-kid1', task_id: 'tk2', points: 10, type: 'earn', note: 'Homework — math', created_at: atTime(addDays(now, -1), 17, 5) },
            { id: 'rt4', member_id: 'm-kid1', task_id: null, points: 5, type: 'adjust', note: 'Helped carry the groceries', created_at: atTime(addDays(now, -1), 19) },
            { id: 'rt5', member_id: 'm-kid1', task_id: null, points: -20, type: 'redeem', note: 'Pocket money — comic book', created_at: atTime(addDays(now, -1), 19, 30) },
            { id: 'rt6', member_id: 'm-kid2', task_id: null, points: 5, type: 'earn', note: 'Set the table', created_at: atTime(addDays(now, -2), 19) },
        ],
        rewardSettings: { points_value: 0.2 },
        // Savings goal: Mia is saving for a video game (100 pts × 0.2 € = 20 € of 30 €).
        rewardGoals: [
            { id: 'g1', member_id: 'm-kid1', title: 'Jeu vidéo', emoji: '🎮', target_amount: 30, status: 'active', created_at: atTime(addDays(now, -14), 10), achieved_at: null },
        ],
    };
}
