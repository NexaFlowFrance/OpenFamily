import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty } from '../lib/normalize';

const router = Router();
router.use(authMiddleware);

const ensureMemberBelongsToUser = async (memberId: string | null, userId: string) => {
    if (!memberId) {
        return;
    }

    const member = await query(
        'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
        [memberId, userId]
    );

    if (member.rows.length === 0) {
        throw new Error('INVALID_MEMBER');
    }
};

// Get all appointments
router.get('/', async (req: AuthRequest, res) => {
    try {
        const { start_date, end_date } = req.query;

        let queryText = `
      SELECT a.*, fm.name as family_member_name, fm.color as family_member_color
      FROM appointments a
      LEFT JOIN family_members fm ON a.family_member_id = fm.id
      WHERE a.user_id = $1
    `;
        const params: any[] = [req.userId];

        if (start_date) {
            params.push(start_date);
            queryText += ` AND a.start_time >= $${params.length}`;
        }

        if (end_date) {
            params.push(end_date);
            queryText += ` AND a.start_time <= $${params.length}`;
        }

        queryText += ' ORDER BY a.start_time ASC';

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get appointments error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create appointment
router.post('/', async (req: AuthRequest, res) => {
    try {
        const {
            title,
            description,
            start_time,
            end_time,
            location,
            family_member_id,
            reminder_30min,
            reminder_1hour,
            notes,
        } = req.body;

        const cleanedTitle = typeof title === 'string' ? title.trim() : '';
        const startTime = toNullIfEmpty(start_time);

        if (!cleanedTitle || !startTime) {
            return res.status(400).json({ success: false, error: 'Title and start_time are required' });
        }

        const familyMemberId = toNullIfEmpty(family_member_id) as string | null;
        await ensureMemberBelongsToUser(familyMemberId, req.userId!);

        const result = await query(
            `INSERT INTO appointments (user_id, title, description, start_time, end_time, location, family_member_id, reminder_30min, reminder_1hour, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
                req.userId,
                cleanedTitle,
                toNullIfEmpty(description),
                startTime,
                toNullIfEmpty(end_time),
                toNullIfEmpty(location),
                familyMemberId,
                Boolean(reminder_30min),
                Boolean(reminder_1hour),
                toNullIfEmpty(notes),
            ]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Family member not found' });
        }

        console.error('Create appointment error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update appointment
router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            start_time,
            end_time,
            location,
            family_member_id,
            reminder_30min,
            reminder_1hour,
            notes,
        } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        const pushUpdate = (field: string, value: any) => {
            values.push(value);
            updates.push(`${field} = $${values.length}`);
        };

        if (title !== undefined) {
            const cleanedTitle = typeof title === 'string' ? title.trim() : '';
            if (!cleanedTitle) {
                return res.status(400).json({ success: false, error: 'Title cannot be empty' });
            }
            pushUpdate('title', cleanedTitle);
        }

        if (description !== undefined) {
            pushUpdate('description', toNullIfEmpty(description));
        }

        if (start_time !== undefined) {
            const startTime = toNullIfEmpty(start_time);
            if (!startTime) {
                return res.status(400).json({ success: false, error: 'start_time cannot be empty' });
            }
            pushUpdate('start_time', startTime);
        }

        if (end_time !== undefined) {
            pushUpdate('end_time', toNullIfEmpty(end_time));
        }

        if (location !== undefined) {
            pushUpdate('location', toNullIfEmpty(location));
        }

        if (family_member_id !== undefined) {
            const familyMemberId = toNullIfEmpty(family_member_id) as string | null;
            await ensureMemberBelongsToUser(familyMemberId, req.userId!);
            pushUpdate('family_member_id', familyMemberId);
        }

        if (reminder_30min !== undefined) {
            pushUpdate('reminder_30min', Boolean(reminder_30min));
        }

        if (reminder_1hour !== undefined) {
            pushUpdate('reminder_1hour', Boolean(reminder_1hour));
        }

        if (notes !== undefined) {
            pushUpdate('notes', toNullIfEmpty(notes));
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const result = await query(
            `UPDATE appointments
       SET ${updates.join(', ')}
       WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
       RETURNING *`,
            [...values, id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Family member not found' });
        }

        console.error('Update appointment error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete appointment
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM appointments WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        res.json({ success: true, message: 'Appointment deleted' });
    } catch (error) {
        console.error('Delete appointment error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
