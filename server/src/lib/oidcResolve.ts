import { DatabaseError } from 'pg';
import { query, QueryFn, withTransaction } from '../db';
import { getAuthConfig } from '../config/authConfig';
import { AuthPayload, buildAuthPayload } from './authPayload';
import { acceptInviteForNewUser, checkInvite } from './invites';
import { normalizeEmail } from './normalize';

/**
 * Turns a completed sign-in at the identity provider into an OpenFamily
 * account. An account is known by the provider's (issuer, subject) pair; the
 * email only matters the first time, to link an existing account or to create
 * a new one.
 */

/** What the callback kept from the validated ID token (or UserInfo). */
export interface OidcClaims {
    iss: string;
    sub: string;
    email?: string;
    /** True only when the provider sent the JSON boolean `true` with that same email. */
    emailVerified: boolean;
    name?: string;
    givenName?: string;
    familyName?: string;
    preferredUsername?: string;
    locale?: string;
}

export type ResolveErrorCode =
    | 'email_required'
    | 'email_unverified'
    | 'account_conflict'
    | 'identity_in_use'
    | 'already_linked'
    | 'registration_closed'
    | 'invite_invalid'
    | 'invalid_code'
    | 'try_again';

export type ResolveOutcome =
    | { kind: 'login'; payload: AuthPayload; created: boolean }
    | { kind: 'linked'; email: string | null }
    | { kind: 'error'; code: ResolveErrorCode };

class Outcome extends Error {
    constructor(readonly code: ResolveErrorCode) {
        super(code);
    }
}

/** Another request created the same identity between our read and our insert. */
class IdentityRace extends Error {}

const SUPPORTED_LANGUAGES = new Set(['fr', 'en', 'pt', 'ru', 'zh', 'es', 'de']);

const languageFromLocale = (locale: string | undefined): string | null => {
    const primary = locale?.trim().toLowerCase().split(/[-_]/)[0];
    return primary && SUPPORTED_LANGUAGES.has(primary) ? primary : null;
};

const displayName = (claims: OidcClaims, email: string): string => {
    const candidates = [
        claims.name,
        [claims.givenName, claims.familyName].filter(Boolean).join(' '),
        claims.preferredUsername,
        email.split('@')[0],
    ];
    const name = candidates.map((value) => value?.trim()).find((value) => value);
    return (name || email).slice(0, 255);
};

// Only a verified email is worth remembering next to the identity; it is shown
// in Settings and never used to sign anyone in.
const verifiedEmail = (claims: OidcClaims): string | null =>
    claims.email && claims.emailVerified ? normalizeEmail(claims.email) : null;

const isUniqueViolation = (error: unknown, constraint: string): boolean =>
    error instanceof DatabaseError && error.code === '23505' && error.constraint === constraint;

const signIn = async (claims: OidcClaims, inviteToken: string | null): Promise<ResolveOutcome> => {
    const config = getAuthConfig();

    return withTransaction(async (tx): Promise<ResolveOutcome> => {
        const existing = await tx.query(
            'SELECT user_id FROM user_identities WHERE issuer = $1 AND subject = $2',
            [claims.iss, claims.sub],
        );
        if (existing.rows.length > 0) {
            const userId = existing.rows[0].user_id as string;
            await tx.query(
                'UPDATE user_identities SET last_login_at = NOW(), email = COALESCE($2, email) WHERE issuer = $3 AND subject = $4 AND user_id = $1',
                [userId, verifiedEmail(claims), claims.iss, claims.sub],
            );
            const payload = await buildAuthPayload(tx.query, userId);
            if (!payload) throw new Outcome('invalid_code');
            return { kind: 'login', payload, created: false };
        }

        // From here on a new link or a new account is made, both of which need an email.
        if (!claims.email) throw new Outcome('email_required');
        const email = normalizeEmail(claims.email);

        const matches = await tx.query('SELECT id FROM users WHERE LOWER(email) = $1 FOR UPDATE', [email]);
        if (matches.rows.length > 1) throw new Outcome('account_conflict');

        if (matches.rows.length === 1) {
            const userId = matches.rows[0].id as string;
            // Linking an existing account on the provider's word alone needs a
            // verified address, the operator's consent, and an account not yet
            // linked to this provider (a recycled address must not take it over).
            if (!claims.emailVerified || !config.oidc?.linkByEmail) throw new Outcome('account_conflict');
            const linked = await tx.query('SELECT 1 FROM user_identities WHERE user_id = $1 AND issuer = $2', [userId, claims.iss]);
            if (linked.rows.length > 0) throw new Outcome('account_conflict');

            await insertIdentity(tx.query, userId, claims);
            const payload = await buildAuthPayload(tx.query, userId);
            if (!payload) throw new Outcome('invalid_code');
            return { kind: 'login', payload, created: false };
        }

        // A new account. Its email becomes the account's address for password
        // reset and invitations, so the provider must vouch for it.
        if (!claims.emailVerified) throw new Outcome('email_unverified');

        let invite = null;
        if (inviteToken) {
            const check = await checkInvite(tx.query, inviteToken, email);
            if (!check.ok) throw new Outcome('invite_invalid');
            invite = check.invite;
        } else if (!config.oidcSignup) {
            throw new Outcome('registration_closed');
        }

        const created = await tx.query(
            `INSERT INTO users (email, password_hash, name, role, language)
             VALUES ($1, NULL, $2, $3, COALESCE($4, 'fr')) RETURNING id`,
            [email, displayName(claims, email), invite ? invite.role : 'parent', languageFromLocale(claims.locale)],
        );
        const userId = created.rows[0].id as string;
        await insertIdentity(tx.query, userId, claims);
        if (invite && !(await acceptInviteForNewUser(tx.query, invite, userId))) {
            throw new Outcome('invite_invalid');
        }

        const payload = await buildAuthPayload(tx.query, userId);
        if (!payload) throw new Outcome('invalid_code');
        return { kind: 'login', payload, created: true };
    });
};

const insertIdentity = async (db: QueryFn, userId: string, claims: OidcClaims): Promise<void> => {
    const inserted = await db(
        `INSERT INTO user_identities (user_id, issuer, subject, email, last_login_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (issuer, subject) DO NOTHING
         RETURNING id`,
        [userId, claims.iss, claims.sub, verifiedEmail(claims)],
    );
    if (inserted.rows.length === 0) throw new IdentityRace();
};

const link = (claims: OidcClaims, userId: string): Promise<ResolveOutcome> =>
    withTransaction(async (tx): Promise<ResolveOutcome> => {
        const user = await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (user.rows.length === 0) throw new Outcome('invalid_code');

        // A link never signs in: whoever owns the identity already, this
        // session stays the account that asked for the link.
        const owner = await tx.query(
            'SELECT user_id FROM user_identities WHERE issuer = $1 AND subject = $2',
            [claims.iss, claims.sub],
        );
        if (owner.rows.length > 0) {
            throw new Outcome(owner.rows[0].user_id === userId ? 'already_linked' : 'identity_in_use');
        }
        const own = await tx.query('SELECT 1 FROM user_identities WHERE user_id = $1 AND issuer = $2', [userId, claims.iss]);
        if (own.rows.length > 0) throw new Outcome('already_linked');

        try {
            await insertIdentity(tx.query, userId, claims);
        } catch (error) {
            if (error instanceof IdentityRace) throw new Outcome('identity_in_use');
            throw error;
        }
        return { kind: 'linked', email: verifiedEmail(claims) };
    });

/**
 * Resolves the account for a sign-in (`linkUserId` null) or links the identity
 * to `linkUserId`. Concurrent first sign-ins with the same identity are settled
 * by the unique constraints: the loser rolls back and runs once more, by then
 * finding the identity the winner created.
 */
export const resolveIdentity = async (
    claims: OidcClaims,
    options: { linkUserId: string | null; inviteToken: string | null },
): Promise<ResolveOutcome> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            return options.linkUserId ? await link(claims, options.linkUserId) : await signIn(claims, options.inviteToken);
        } catch (error) {
            if (error instanceof Outcome) return { kind: 'error', code: error.code };
            if (options.linkUserId) {
                if (isUniqueViolation(error, 'user_identities_user_issuer_key')) return { kind: 'error', code: 'already_linked' };
                if (isUniqueViolation(error, 'user_identities_issuer_subject_key')) return { kind: 'error', code: 'identity_in_use' };
                throw error;
            }
            if (error instanceof IdentityRace || isUniqueViolation(error, 'user_identities_issuer_subject_key')) {
                continue;
            }
            // Another sign-in claimed the same email or the same account first.
            // If it was this very identity (the same person, twice at once), the
            // retry signs in to the account it created; otherwise it is a
            // different identity and the account is not ours to take.
            if (isUniqueViolation(error, 'users_email_key') || isUniqueViolation(error, 'user_identities_user_issuer_key')) {
                const sameIdentity = await query(
                    'SELECT 1 FROM user_identities WHERE issuer = $1 AND subject = $2',
                    [claims.iss, claims.sub],
                );
                if (sameIdentity.rows.length > 0) continue;
                return { kind: 'error', code: 'account_conflict' };
            }
            throw error;
        }
    }
    return { kind: 'error', code: 'try_again' };
};
