import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty } from '../lib/normalize';

const router = Router();
router.use(authMiddleware);

const ensureMembersBelongToUser = async (memberIds: string[], userId: string) => {
    for (const memberId of memberIds) {
        const member = await query(
            'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
            [memberId, userId]
        );
        if (member.rows.length === 0) {
            throw new Error('INVALID_MEMBER');
        }
    }
};

const enrichAppointmentsWithMembers = async (appointments: any[], userId: string) => {
    if (appointments.length === 0) return appointments;
    const membersResult = await query(
        'SELECT id, name, color FROM family_members WHERE user_id = $1',
        [userId]
    );
    const membersById = new Map(membersResult.rows.map((m: any) => [m.id, m]));
    return appointments.map((apt) => {
        const familyMemberIds: string[] = Array.isArray(apt.family_member_ids) ? apt.family_member_ids : [];
        return {
            ...apt,
            family_member_ids: familyMemberIds,
            family_members_data: familyMemberIds.map((id) => membersById.get(id)).filter(Boolean),
        };
    });
};

// Get all appointments
router.get('/', async (req: AuthRequest, res) => {
    try {
        const { start_date, end_date } = req.query;

        let queryText = 'SELECT * FROM appointments WHERE user_id = $1';
        const params: any[] = [req.userId];

        if (start_date) {
            params.push(start_date);
            queryText += ` AND start_time >= $${params.length}`;
        }

        if (end_date) {
            params.push(end_date);
            queryText += ` AND start_time <= $${params.length}`;
        }

        queryText += ' ORDER BY start_time ASC';

        const result = await query(queryText, params);
        const appointments = await enrichAppointmentsWithMembers(result.rows, req.userId!);
        res.json({ success: true, data: appointments });
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
            family_member_ids,
            reminder_30min,
            reminder_1hour,
            notes,
        } = req.body;

        const cleanedTitle = typeof title === 'string' ? title.trim() : '';
        const startTime = toNullIfEmpty(start_time);

        if (!cleanedTitle || !startTime) {
            return res.status(400).json({ success: false, error: 'Title and start_time are required' });
        }

        const memberIds: string[] = Array.isArray(family_member_ids)
            ? family_member_ids.filter((id: any) => typeof id === 'string' && id.trim())
            : [];
        await ensureMembersBelongToUser(memberIds, req.userId!);

        const result = await query(
            `INSERT INTO appointments (user_id, title, description, start_time, end_time, location, family_member_ids, reminder_30min, reminder_1hour, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10) RETURNING *`,
            [
                req.userId,
                cleanedTitle,
                toNullIfEmpty(description),
                startTime,
                toNullIfEmpty(end_time),
                toNullIfEmpty(location),
                JSON.stringify(memberIds),
                Boolean(reminder_30min),
                Boolean(reminder_1hour),
                toNullIfEmpty(notes),
            ]
        );

        const [enriched] = await enrichAppointmentsWithMembers([result.rows[0]], req.userId!);
        res.json({ success: true, data: enriched });
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
            family_member_ids,
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

        if (family_member_ids !== undefined) {
            const memberIds: string[] = Array.isArray(family_member_ids)
                ? family_member_ids.filter((mid: any) => typeof mid === 'string' && mid.trim())
                : [];
            await ensureMembersBelongToUser(memberIds, req.userId!);
            values.push(JSON.stringify(memberIds));
            updates.push(`family_member_ids = $${values.length}::jsonb`);
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

        const [enriched] = await enrichAppointmentsWithMembers([result.rows[0]], req.userId!);
        res.json({ success: true, data: enriched });
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
