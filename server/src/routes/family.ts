import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getClient, query } from '../db';
import { authMiddleware, AuthRequest, requireFamilyOwner } from '../middleware/auth';
import {
    parseStringArray,
    serializeStringArray,
    toNullIfEmpty,
    normalizeEmail,
} from '../lib/normalize';
import { sendInvitationEmail } from '../email/EmailService';
import { EmailError } from '../email/errors';
import logger from '../lib/logger';

const router = Router();
router.use(authMiddleware);

const DEFAULT_ROLE = 'Autre';
const DEFAULT_COLOR = '#FF4466';

const isValidHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// 12 random bytes → 16 url-safe chars. Comfortably above the 8-char minimum and
// not user-typed for long (forced reset on first login via must_change_password).
const generateTempPassword = (): string => crypto.randomBytes(12).toString('base64url');

interface AccountProvisionResult {
    accountUserId: string;
    temporaryPassword: string;
}

// Create a login account for a member card (or reset the password of an existing
// one) inside an open transaction. The caller owns BEGIN/COMMIT and the email
// send (done after COMMIT so an SMTP hiccup never rolls back the account).
const provisionMemberAccount = async (
    client: PoolClient,
    params: {
        ownerUserId: string;
        memberId: string;
        memberName: string;
        normalizedEmail: string;
        existingAccountUserId: string | null;
    },
): Promise<AccountProvisionResult> => {
    const { ownerUserId, memberId, memberName, normalizedEmail, existingAccountUserId } = params;
    const temporaryPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    if (existingAccountUserId) {
        // Resend flow: rotate the password and force a fresh change.
        await client.query(
            'UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2',
            [passwordHash, existingAccountUserId],
        );
        return { accountUserId: existingAccountUserId, temporaryPassword };
    }

    const inserted = await client.query(
        `INSERT INTO users (email, password_hash, name, family_owner_id, must_change_password)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [normalizedEmail, passwordHash, memberName, ownerUserId],
    );
    const accountUserId = inserted.rows[0].id as string;

    await client.query(
        'UPDATE family_members SET account_user_id = $1, email = $2 WHERE id = $3 AND user_id = $4',
        [accountUserId, normalizedEmail, memberId, ownerUserId],
    );

    return { accountUserId, temporaryPassword };
};

// Resolve the family owner's display name for the invitation email's "X added
// you" copy. The owner is always req.userId for owner-only routes.
const getOwnerName = async (ownerUserId: string): Promise<string> => {
    const result = await query('SELECT name FROM users WHERE id = $1', [ownerUserId]);
    return result.rows[0]?.name ?? 'Votre famille';
};

// Send the invitation email after the account transaction has committed.
// Returns whether delivery succeeded — the route surfaces the temp password to
// the owner when it didn't (EMAIL_ENABLED=false or an SMTP error) so they can
// relay it manually.
const deliverInvitation = async (params: {
    ownerName: string;
    memberName: string;
    email: string;
    temporaryPassword: string;
}): Promise<boolean> => {
    try {
        await sendInvitationEmail(
            { email: params.email, name: params.memberName },
            { inviterName: params.ownerName, temporaryPassword: params.temporaryPassword },
        );
        return true;
    } catch (error) {
        logger.warn('family.invitation_email_failed', {
            code: error instanceof EmailError ? error.code : undefined,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
};

const ALLOWED_REGIMES = new Set(['omnivore', 'vegetarian', 'vegan', 'halal', 'kosher', 'no_pork']);
const ALLOWED_SPICE = new Set(['none', 'mild', 'medium', 'hot']);

// Coerces whatever the client sends into the schemaless DietaryPreferences shape
// stored in jsonb. Unknown enum values are dropped (not rejected) to keep the
// route forgiving — the AI prompt only consumes recognised fields anyway.
const sanitizeDietaryPreferences = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== 'object') return {};
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    if (typeof src.regime === 'string' && ALLOWED_REGIMES.has(src.regime)) {
        out.regime = src.regime;
    }
    if (typeof src.spice_level === 'string' && ALLOWED_SPICE.has(src.spice_level)) {
        out.spice_level = src.spice_level;
    }
    const dislikes = Array.isArray(src.dislikes)
        ? src.dislikes.filter((s) => typeof s === 'string' && s.trim()).slice(0, 30)
        : [];
    if (dislikes.length) out.dislikes = dislikes.map((s) => (s as string).trim());
    const favorites = Array.isArray(src.favorites)
        ? src.favorites.filter((s) => typeof s === 'string' && s.trim()).slice(0, 30)
        : [];
    if (favorites.length) out.favorites = favorites.map((s) => (s as string).trim());
    if (typeof src.notes === 'string' && src.notes.trim()) {
        out.notes = src.notes.trim().slice(0, 500);
    }

    return out;
};

const parseDietaryPreferences = (raw: unknown): Record<string, unknown> => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw))
        return raw as Record<string, unknown>;
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
};

const serializeEmergencyContact = (name: string | null, phone: string | null): string | null => {
    if (!name && !phone) {
        return null;
    }

    return JSON.stringify({ name, phone });
};

const parseEmergencyContact = (
    emergencyContactName: unknown,
    emergencyContactPhone: unknown,
    emergencyContactRaw: unknown,
): { name: string | null; phone: string | null } => {
    const name = toNullIfEmpty(emergencyContactName as string | null);
    const phone = toNullIfEmpty(emergencyContactPhone as string | null);

    if (name || phone) {
        return {
            name: (name as string | null) ?? null,
            phone: (phone as string | null) ?? null,
        };
    }

    if (typeof emergencyContactRaw === 'string' && emergencyContactRaw.trim()) {
        try {
            const parsed = JSON.parse(emergencyContactRaw);
            return {
                name: toNullIfEmpty(parsed?.name) as string | null,
                phone: toNullIfEmpty(parsed?.phone) as string | null,
            };
        } catch {
            return {
                name: emergencyContactRaw.trim(),
                phone: null,
            };
        }
    }

    return { name: null, phone: null };
};

const mapFamilyMember = (row: any) => {
    const emergency = parseEmergencyContact(
        row.emergency_contact_name,
        row.emergency_contact_phone,
        row.emergency_contact,
    );

    return {
        id: row.id,
        name: row.name,
        role: row.role || DEFAULT_ROLE,
        color: row.color || DEFAULT_COLOR,
        birthdate: row.birth_date || null,
        allergies: parseStringArray(row.allergies),
        medications: parseStringArray(row.medications ?? row.vaccines),
        emergency_contact_name: emergency.name,
        emergency_contact_phone: emergency.phone,
        notes: row.notes ?? row.medical_notes ?? null,
        dietary_preferences: parseDietaryPreferences(row.dietary_preferences),
        email: row.email ?? null,
        has_account: !!row.account_user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
};

// Get all family members
router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM family_members WHERE user_id = $1 ORDER BY name ASC',
            [req.userId],
        );
        res.json({ success: true, data: result.rows.map(mapFamilyMember) });
    } catch (error) {
        logger.error('family.get_family_members_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get single family member
router.get('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query('SELECT * FROM family_members WHERE id = $1 AND user_id = $2', [
            id,
            req.userId,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Family member not found' });
        }

        res.json({ success: true, data: mapFamilyMember(result.rows[0]) });
    } catch (error) {
        logger.error('family.get_family_member_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create family member. Owner-only: members can use the family but not change
// its composition.
router.post('/', requireFamilyOwner, async (req: AuthRequest, res) => {
    try {
        const {
            name,
            role,
            birthdate,
            color,
            allergies,
            medications,
            emergency_contact_name,
            emergency_contact_phone,
            notes,
            dietary_preferences,
            has_account,
            email,
        } = req.body;

        const cleanedName = typeof name === 'string' ? name.trim() : '';
        if (!cleanedName) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        const cleanedColor =
            typeof color === 'string' && color.trim() ? color.trim() : DEFAULT_COLOR;
        if (!isValidHexColor(cleanedColor)) {
            return res.status(400).json({ success: false, error: 'Invalid color format' });
        }

        // When the owner opts to give this member an account, validate the email
        // and confirm it isn't already taken BEFORE we touch the database.
        const wantsAccount = has_account === true;
        let normalizedEmail = '';
        if (wantsAccount) {
            normalizedEmail = normalizeEmail(typeof email === 'string' ? email : '');
            if (!isValidEmail(normalizedEmail)) {
                return res.status(400).json({ success: false, error: 'A valid email is required' });
            }
            const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [
                normalizedEmail,
            ]);
            if (existing.rows.length > 0) {
                return res
                    .status(409)
                    .json({ success: false, error: 'An account with this email already exists' });
            }
        }

        const roleValue = typeof role === 'string' && role.trim() ? role.trim() : DEFAULT_ROLE;
        const birthDateValue = toNullIfEmpty(birthdate);
        const allergiesValue = serializeStringArray(allergies);
        const medicationsValue = serializeStringArray(medications);
        const emergencyName = toNullIfEmpty(emergency_contact_name) as string | null;
        const emergencyPhone = toNullIfEmpty(emergency_contact_phone) as string | null;
        const notesValue = toNullIfEmpty(notes);
        const dietaryValue = sanitizeDietaryPreferences(dietary_preferences);

        const insertSql = `INSERT INTO family_members (
          user_id, name, role, birth_date, color, allergies, medications, vaccines,
          emergency_contact_name, emergency_contact_phone, emergency_contact,
          notes, medical_notes, dietary_preferences
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`;
        const insertParams = [
            req.userId,
            cleanedName,
            roleValue,
            birthDateValue,
            cleanedColor,
            allergiesValue,
            medicationsValue,
            medicationsValue,
            emergencyName,
            emergencyPhone,
            serializeEmergencyContact(emergencyName, emergencyPhone),
            notesValue,
            notesValue,
            JSON.stringify(dietaryValue),
        ];

        // Simple path: no account requested.
        if (!wantsAccount) {
            const result = await query(insertSql, insertParams);
            return res.json({ success: true, data: mapFamilyMember(result.rows[0]) });
        }

        // Account path: member insert + account creation must be atomic.
        const client = await getClient();
        let member;
        let provision: AccountProvisionResult;
        try {
            await client.query('BEGIN');
            const inserted = await client.query(insertSql, insertParams);
            member = inserted.rows[0];
            provision = await provisionMemberAccount(client, {
                ownerUserId: req.userId!,
                memberId: member.id,
                memberName: cleanedName,
                normalizedEmail,
                existingAccountUserId: null,
            });
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }

        // Re-read so the response reflects account_user_id/email set in the tx.
        const refreshed = await query('SELECT * FROM family_members WHERE id = $1', [member.id]);
        const ownerName = await getOwnerName(req.userId!);
        const emailDelivered = await deliverInvitation({
            ownerName,
            memberName: cleanedName,
            email: normalizedEmail,
            temporaryPassword: provision.temporaryPassword,
        });

        return res.json({
            success: true,
            data: mapFamilyMember(refreshed.rows[0]),
            account: {
                email: normalizedEmail,
                emailDelivered,
                // Only expose the temp password when we couldn't email it, so the
                // owner can pass it on manually (self-host without SMTP, etc.).
                ...(emailDelivered ? {} : { temporaryPassword: provision.temporaryPassword }),
            },
        });
    } catch (error) {
        logger.error('family.create_family_member_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Give an existing member card a login (or resend/reset its temporary password).
// Owner-only. Body may include `email` for a first-time invite; for a resend the
// member's existing account email is reused.
router.post('/:id/invite', requireFamilyOwner, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;

        const memberResult = await query(
            'SELECT * FROM family_members WHERE id = $1 AND user_id = $2',
            [id, req.userId],
        );
        if (memberResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Family member not found' });
        }
        const member = memberResult.rows[0];
        const existingAccountUserId: string | null = member.account_user_id ?? null;

        // First-time invite needs a fresh email; resend reuses the account's one.
        let normalizedEmail: string;
        if (existingAccountUserId) {
            normalizedEmail = normalizeEmail(member.email ?? '');
        } else {
            normalizedEmail = normalizeEmail(typeof email === 'string' ? email : '');
            if (!isValidEmail(normalizedEmail)) {
                return res.status(400).json({ success: false, error: 'A valid email is required' });
            }
            const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [
                normalizedEmail,
            ]);
            if (existing.rows.length > 0) {
                return res
                    .status(409)
                    .json({ success: false, error: 'An account with this email already exists' });
            }
        }

        const client = await getClient();
        let provision: AccountProvisionResult;
        try {
            await client.query('BEGIN');
            provision = await provisionMemberAccount(client, {
                ownerUserId: req.userId!,
                memberId: id,
                memberName: member.name,
                normalizedEmail,
                existingAccountUserId,
            });
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }

        const refreshed = await query('SELECT * FROM family_members WHERE id = $1', [id]);
        const ownerName = await getOwnerName(req.userId!);
        const emailDelivered = await deliverInvitation({
            ownerName,
            memberName: member.name,
            email: normalizedEmail,
            temporaryPassword: provision.temporaryPassword,
        });

        return res.json({
            success: true,
            data: mapFamilyMember(refreshed.rows[0]),
            account: {
                email: normalizedEmail,
                emailDelivered,
                ...(emailDelivered ? {} : { temporaryPassword: provision.temporaryPassword }),
            },
        });
    } catch (error) {
        logger.error('family.invite_family_member_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update family member. Owner-only.
router.put('/:id', requireFamilyOwner, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            role,
            birthdate,
            color,
            allergies,
            medications,
            emergency_contact_name,
            emergency_contact_phone,
            notes,
            dietary_preferences,
        } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        const pushUpdate = (field: string, value: any) => {
            values.push(value);
            updates.push(`${field} = $${values.length}`);
        };

        if (name !== undefined) {
            const cleanedName = typeof name === 'string' ? name.trim() : '';
            if (!cleanedName) {
                return res.status(400).json({ success: false, error: 'Name cannot be empty' });
            }
            pushUpdate('name', cleanedName);
        }

        if (role !== undefined) {
            const roleValue = typeof role === 'string' && role.trim() ? role.trim() : DEFAULT_ROLE;
            pushUpdate('role', roleValue);
        }

        if (birthdate !== undefined) {
            pushUpdate('birth_date', toNullIfEmpty(birthdate));
        }

        if (color !== undefined) {
            const cleanedColor = typeof color === 'string' ? color.trim() : '';
            if (!cleanedColor || !isValidHexColor(cleanedColor)) {
                return res.status(400).json({ success: false, error: 'Invalid color format' });
            }
            pushUpdate('color', cleanedColor);
        }

        if (allergies !== undefined) {
            pushUpdate('allergies', serializeStringArray(allergies));
        }

        if (medications !== undefined) {
            const medicationsValue = serializeStringArray(medications);
            pushUpdate('medications', medicationsValue);
            pushUpdate('vaccines', medicationsValue);
        }

        const emergencyName =
            emergency_contact_name !== undefined
                ? (toNullIfEmpty(emergency_contact_name) as string | null)
                : undefined;
        const emergencyPhone =
            emergency_contact_phone !== undefined
                ? (toNullIfEmpty(emergency_contact_phone) as string | null)
                : undefined;

        if (emergencyName !== undefined) {
            pushUpdate('emergency_contact_name', emergencyName);
        }

        if (emergencyPhone !== undefined) {
            pushUpdate('emergency_contact_phone', emergencyPhone);
        }

        if (emergencyName !== undefined || emergencyPhone !== undefined) {
            const current = await query(
                'SELECT emergency_contact_name, emergency_contact_phone FROM family_members WHERE id = $1 AND user_id = $2',
                [id, req.userId],
            );

            if (current.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Family member not found' });
            }

            const fallbackName =
                emergencyName !== undefined
                    ? emergencyName
                    : current.rows[0].emergency_contact_name;
            const fallbackPhone =
                emergencyPhone !== undefined
                    ? emergencyPhone
                    : current.rows[0].emergency_contact_phone;
            pushUpdate('emergency_contact', serializeEmergencyContact(fallbackName, fallbackPhone));
        }

        if (notes !== undefined) {
            const notesValue = toNullIfEmpty(notes);
            pushUpdate('notes', notesValue);
            pushUpdate('medical_notes', notesValue);
        }

        if (dietary_preferences !== undefined) {
            pushUpdate(
                'dietary_preferences',
                JSON.stringify(sanitizeDietaryPreferences(dietary_preferences)),
            );
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const result = await query(
            `UPDATE family_members
       SET ${updates.join(', ')}
       WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
       RETURNING *`,
            [...values, id, req.userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Family member not found' });
        }

        res.json({ success: true, data: mapFamilyMember(result.rows[0]) });
    } catch (error) {
        logger.error('family.update_family_member_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete family member. Owner-only. If the member has a linked login account we
// delete that account too, so removing someone from the family also revokes
// their access (otherwise the orphaned account could still read family data).
router.delete('/:id', requireFamilyOwner, async (req: AuthRequest, res) => {
    const client = await getClient();
    try {
        const { id } = req.params;

        await client.query('BEGIN');
        const result = await client.query(
            'DELETE FROM family_members WHERE id = $1 AND user_id = $2 RETURNING account_user_id',
            [id, req.userId],
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Family member not found' });
        }

        const accountUserId: string | null = result.rows[0].account_user_id ?? null;
        if (accountUserId) {
            // Only ever delete a member account of THIS family — never an owner.
            await client.query('DELETE FROM users WHERE id = $1 AND family_owner_id = $2', [
                accountUserId,
                req.userId,
            ]);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Family member deleted' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        logger.error('family.delete_family_member_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        client.release();
    }
});

export default router;
