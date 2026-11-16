import type { Transaction } from '../db';

/**
 * Where a family's data lives, for the one operation that has to know all of
 * it: handing the family to another member (routes/familyInvites.ts).
 *
 * A family is keyed by its owner's user id. Its rows carry that id, and a few
 * family-wide settings sit on the owner's own row in `users`. When ownership
 * moves, every one of them has to follow; anything left behind is lost to the
 * family, because the application only ever reads through the current owner.
 *
 * Every column that references `users` is listed here once, as the family's
 * or as an account's. A test reads the database's foreign keys and fails when
 * a new one is in neither list: the next table cannot be forgotten.
 */

/** Rows that belong to the family: re-keyed to the new owner. */
export const FAMILY_TABLES: ReadonlyArray<{ table: string; column: string }> = [
    { table: 'family_members', column: 'user_id' },
    { table: 'family_posts', column: 'user_id' },
    { table: 'family_notes', column: 'user_id' },
    { table: 'shopping_items', column: 'user_id' },
    { table: 'shopping_list_templates', column: 'user_id' },
    { table: 'pantry_items', column: 'user_id' },
    { table: 'tasks', column: 'user_id' },
    { table: 'appointments', column: 'user_id' },
    { table: 'calendar_subscriptions', column: 'user_id' },
    { table: 'schedule_entries', column: 'user_id' },
    { table: 'recipes', column: 'user_id' },
    { table: 'meal_plans', column: 'user_id' },
    { table: 'budget_entries', column: 'user_id' },
    { table: 'budget_limits', column: 'user_id' },
    { table: 'recurring_expenses', column: 'user_id' },
    { table: 'recurring_expense_logs', column: 'user_id' },
    { table: 'kakeibo_months', column: 'user_id' },
    { table: 'reward_transactions', column: 'user_id' },
    { table: 'reward_settings', column: 'user_id' },
    { table: 'reward_goals', column: 'user_id' },
    { table: 'integrations', column: 'family_id' },
    { table: 'ai_settings', column: 'user_id' },
    { table: 'display_links', column: 'user_id' },
    { table: 'api_tokens', column: 'user_id' },
    { table: 'webhooks', column: 'user_id' },
];

/**
 * Family-wide settings kept on the owner's row of `users`, with the value a
 * row goes back to when it stops being the owner's. calendar_token is the key
 * of the family's calendar feed: the address subscribed in a phone must keep
 * working after a transfer.
 */
export const FAMILY_USER_COLUMNS: ReadonlyArray<{ column: string; reset: string }> = [
    { column: 'disabled_modules', reset: "'[]'" },
    { column: 'custom_categories', reset: 'NULL' },
    { column: 'kakeibo_pillars', reset: 'NULL' },
    { column: 'calendar_token', reset: 'NULL' },
    { column: 'timezone', reset: 'NULL' },
];

/**
 * References to `users` that name an account, not a family, and stay with
 * that account whoever owns the family: who is notified, who wrote a post,
 * who made a token, who signs in how.
 */
export const ACCOUNT_REFERENCES: ReadonlyArray<string> = [
    'notifications.user_id',
    'push_subscriptions.user_id',
    'password_resets.user_id',
    'user_identities.user_id',
    'oidc_flows.link_user_id',
    'family_members.linked_user_id',
    'family_posts.author_user_id',
    'family_post_seen.user_id',
    'family_join_requests.requester_id',
    'display_links.created_by',
    'api_tokens.created_by',
    'webhooks.created_by',
];

/**
 * References the transfer route moves itself, next to the membership swap:
 * who belongs to which family, and the invitations and requests in progress.
 */
export const MEMBERSHIP_REFERENCES: ReadonlyArray<string> = [
    'users.family_owner_id',
    'family_invites.owner_id',
    'family_join_requests.owner_id',
];

/**
 * Moves everything the family owns from one owner to the other, inside the
 * caller's transaction. Rows the new owner had as a standalone account before
 * joining are unreachable since then; they are dropped first, so that they
 * cannot clash with the family's (one settings row, one meal per slot...).
 */
export const moveFamilyData = async (tx: Transaction, oldOwnerId: string, newOwnerId: string): Promise<void> => {
    for (const { table, column } of FAMILY_TABLES) {
        await tx.query(`DELETE FROM ${table} WHERE ${column} = $1`, [newOwnerId]);
        await tx.query(`UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [newOwnerId, oldOwnerId]);
    }

    const columns = FAMILY_USER_COLUMNS.map((entry) => entry.column);
    const current = await tx.query(`SELECT ${columns.join(', ')} FROM users WHERE id = $1`, [oldOwnerId]);
    const values = columns.map((column) => current.rows[0]?.[column] ?? null);
    // The former owner's row is emptied first: calendar_token is unique.
    await tx.query(
        `UPDATE users SET ${FAMILY_USER_COLUMNS.map((entry) => `${entry.column} = ${entry.reset}`).join(', ')} WHERE id = $1`,
        [oldOwnerId],
    );
    await tx.query(
        `UPDATE users SET ${columns.map((column, index) => `${column} = COALESCE($${index + 2}, ${FAMILY_USER_COLUMNS[index].reset})`).join(', ')} WHERE id = $1`,
        [newOwnerId, ...values],
    );
};
