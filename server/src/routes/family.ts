import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { parseStringArray, serializeStringArray, toNullIfEmpty } from '../lib/normalize';

const router = Router();
router.use(authMiddleware);

const DEFAULT_ROLE = 'Autre';
const DEFAULT_COLOR = '#FF4466';

const isValidHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

const serializeEmergencyContact = (name: string | null, phone: string | null): string | null => {
    if (!name && !phone) {
        return null;
    }

    return JSON.stringify({ name, phone });
};

const parseEmergencyContact = (
    emergencyContactName: unknown,
    emergencyContactPhone: unknown,
    emergencyContactRaw: unknown
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
        row.emergency_contact
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
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
};

// Get all family members
router.get('/', async (req: AuthRequest, res) => {
    try {
        const result = await query(
            'SELECT * FROM family_members WHERE user_id = $1 ORDER BY name ASC',
            [req.userId]
        );
        res.json({ success: true, data: result.rows.map(mapFamilyMember) });
    } catch (error) {
        console.error('Get family members error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get single family member
router.get('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'SELECT * FROM family_members WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Family member not found' });
        }

        res.json({ success: true, data: mapFamilyMember(result.rows[0]) });
    } catch (error) {
        console.error('Get family member error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create family member
router.post('/', async (req: AuthRequest, res) => {
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
        } = req.body;

        const cleanedName = typeof name === 'string' ? name.trim() : '';
        if (!cleanedName) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        const cleanedColor = typeof color === 'string' && color.trim() ? color.trim() : DEFAULT_COLOR;
        if (!isValidHexColor(cleanedColor)) {
            return res.status(400).json({ success: false, error: 'Invalid color format' });
        }

        const roleValue = typeof role === 'string' && role.trim() ? role.trim() : DEFAULT_ROLE;
        const birthDateValue = toNullIfEmpty(birthdate);
        const allergiesValue = serializeStringArray(allergies);
        const medicationsValue = serializeStringArray(medications);
        const emergencyName = toNullIfEmpty(emergency_contact_name) as string | null;
        const emergencyPhone = toNullIfEmpty(emergency_contact_phone) as string | null;
        const notesValue = toNullIfEmpty(notes);

        const result = await query(
            `INSERT INTO family_members (
          user_id,
          name,
          role,
          birth_date,
          color,
          allergies,
          medications,
          vaccines,
          emergency_contact_name,
          emergency_contact_phone,
          emergency_contact,
          notes,
          medical_notes
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13
        ) RETURNING *`,
            [
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
            ]
        );

        res.json({ success: true, data: mapFamilyMember(result.rows[0]) });
    } catch (error) {
        console.error('Create family member error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update family member
router.put('/:id', async (req: AuthRequest, res) => {
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
                [id, req.userId]
            );

            if (current.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Family member not found' });
            }

            const fallbackName = emergencyName !== undefined ? emergencyName : current.rows[0].emergency_contact_name;
            const fallbackPhone = emergencyPhone !== undefined ? emergencyPhone : current.rows[0].emergency_contact_phone;
            pushUpdate('emergency_contact', serializeEmergencyContact(fallbackName, fallbackPhone));
        }

        if (notes !== undefined) {
            const notesValue = toNullIfEmpty(notes);
            pushUpdate('notes', notesValue);
            pushUpdate('medical_notes', notesValue);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const result = await query(
            `UPDATE family_members
       SET ${updates.join(', ')}
       WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
       RETURNING *`,
            [...values, id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Family member not found' });
        }

        res.json({ success: true, data: mapFamilyMember(result.rows[0]) });
    } catch (error) {
        console.error('Update family member error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete family member
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM family_members WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Family member not found' });
        }

        res.json({ success: true, message: 'Family member deleted' });
    } catch (error) {
        console.error('Delete family member error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
