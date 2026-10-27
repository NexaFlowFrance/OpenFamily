import { QueryFn } from '../db';
import { parseDisabledModules } from '../routes/userSettings';
import { issueAccessToken } from './authTokens';

export interface AuthPayload {
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        is_owner: boolean;
        currency: string;
        language: string;
        week_start_day: number | null;
        avatar_url: string | null;
        disabled_modules: string[];
    };
    token: string;
}

/**
 * The `{ user, token }` answer of every sign-in (password, SSO, sign-up,
 * refresh). Reads the account fresh, so the token always carries the current
 * family and session version. Pass a transaction's query to read inside it.
 * Returns null when the account no longer exists.
 */
export const buildAuthPayload = async (db: QueryFn, userId: string): Promise<AuthPayload | null> => {
    const result = await db(
        `SELECT id, email, name, role, currency, language, week_start_day, avatar_url,
                disabled_modules, family_owner_id, token_version
         FROM users WHERE id = $1`,
        [userId],
    );
    const row = result.rows[0];
    if (!row) return null;

    const isOwner = !row.family_owner_id;
    // disabled_modules is family-wide: read it from the owner's row (own row if owner).
    const disabled_modules = isOwner
        ? parseDisabledModules(row.disabled_modules)
        : parseDisabledModules(
            (await db('SELECT disabled_modules FROM users WHERE id = $1', [row.family_owner_id])).rows[0]?.disabled_modules,
        );

    return {
        user: {
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role,
            is_owner: isOwner,
            currency: row.currency || 'EUR',
            language: row.language || 'fr',
            week_start_day: row.week_start_day ?? null,
            avatar_url: row.avatar_url ?? null,
            disabled_modules,
        },
        token: issueAccessToken(row),
    };
};
