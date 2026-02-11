import { Router } from 'express';
import { getClient, query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { toNullIfEmpty } from '../lib/normalize';

const router = Router();
router.use(authMiddleware);

const ALLOWED_SCHEDULE_TYPES = new Set(['work', 'school', 'study', 'activity', 'other']);

const normalizeTime = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if (!match) {
        return null;
    }

    return `${match[1]}:${match[2]}:${match[3] || '00'}`;
};

const parseDayOfWeek = (value: unknown): number | null => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) {
        return null;
    }
    return parsed;
};

const parseDayList = (value: unknown): number[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const parsed = value
        .map((item) => parseDayOfWeek(item))
        .filter((item): item is number => item !== null);

    return [...new Set(parsed)].sort((a, b) => a - b);
};

const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + minutes;
};

const ensureMemberBelongsToUser = async (memberId: string, userId: string) => {
    const member = await query(
        'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
        [memberId, userId]
    );

    if (member.rows.length === 0) {
        throw new Error('INVALID_MEMBER');
    }
};

const ensureNoOverlap = async (
    userId: string,
    memberId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string
) => {
    const result = await query(
        `SELECT id
         FROM schedule_entries
         WHERE user_id = $1
           AND family_member_id = $2
           AND day_of_week = $3
           AND start_time < $4::time
           AND end_time > $5::time
           AND ($6::uuid IS NULL OR id <> $6::uuid)
         LIMIT 1`,
        [userId, memberId, dayOfWeek, endTime, startTime, excludeId || null]
    );

    if (result.rows.length > 0) {
        throw new Error('TIME_OVERLAP');
    }
};

const mapEntryRow = (row: any) => ({
    id: row.id,
    family_member_id: row.family_member_id,
    family_member_name: row.family_member_name,
    family_member_color: row.family_member_color,
    family_member_role: row.family_member_role,
    schedule_type: row.schedule_type,
    title: row.title,
    day_of_week: Number(row.day_of_week),
    start_time: row.start_time,
    end_time: row.end_time,
    location: row.location,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const getEntryById = async (id: string, userId: string) => {
    const result = await query(
        `SELECT se.*, fm.name as family_member_name, fm.color as family_member_color, fm.role as family_member_role
         FROM schedule_entries se
         JOIN family_members fm ON se.family_member_id = fm.id
         WHERE se.id = $1 AND se.user_id = $2`,
        [id, userId]
    );

    return result.rows[0] || null;
};

router.get('/', async (req: AuthRequest, res) => {
    try {
        const { member_id, day_of_week, schedule_type } = req.query;
        const params: any[] = [req.userId];
        let queryText = `
            SELECT se.*, fm.name as family_member_name, fm.color as family_member_color, fm.role as family_member_role
            FROM schedule_entries se
            JOIN family_members fm ON se.family_member_id = fm.id
            WHERE se.user_id = $1
        `;

        if (member_id) {
            params.push(member_id);
            queryText += ` AND se.family_member_id = $${params.length}`;
        }

        if (day_of_week !== undefined) {
            const parsedDay = parseDayOfWeek(day_of_week);
            if (parsedDay === null) {
                return res.status(400).json({ success: false, error: 'day_of_week must be between 1 and 7' });
            }
            params.push(parsedDay);
            queryText += ` AND se.day_of_week = $${params.length}`;
        }

        if (schedule_type) {
            const cleanedType = String(schedule_type).trim().toLowerCase();
            if (!ALLOWED_SCHEDULE_TYPES.has(cleanedType)) {
                return res.status(400).json({ success: false, error: 'Invalid schedule_type' });
            }
            params.push(cleanedType);
            queryText += ` AND se.schedule_type = $${params.length}`;
        }

        queryText += ' ORDER BY se.day_of_week ASC, se.start_time ASC';

        const result = await query(queryText, params);
        return res.json({ success: true, data: result.rows.map(mapEntryRow) });
    } catch (error) {
        console.error('Get planning entries error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        const {
            family_member_id,
            schedule_type,
            title,
            day_of_week,
            start_time,
            end_time,
            location,
            notes,
        } = req.body;

        const memberId = toNullIfEmpty(family_member_id) as string | null;
        const cleanedTitle = typeof title === 'string' ? title.trim() : '';
        const cleanedType = typeof schedule_type === 'string' ? schedule_type.trim().toLowerCase() : '';
        const parsedDay = parseDayOfWeek(day_of_week);
        const startTime = normalizeTime(start_time);
        const endTime = normalizeTime(end_time);

        if (!memberId || !cleanedTitle || !parsedDay || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'family_member_id, title, day_of_week, start_time and end_time are required',
            });
        }

        if (!ALLOWED_SCHEDULE_TYPES.has(cleanedType)) {
            return res.status(400).json({ success: false, error: 'Invalid schedule_type' });
        }

        if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
            return res.status(400).json({ success: false, error: 'end_time must be after start_time' });
        }

        await ensureMemberBelongsToUser(memberId, req.userId!);
        await ensureNoOverlap(req.userId!, memberId, parsedDay, startTime, endTime);

        const inserted = await query(
            `INSERT INTO schedule_entries (
                user_id, family_member_id, schedule_type, title, day_of_week, start_time, end_time, location, notes
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING id`,
            [
                req.userId,
                memberId,
                cleanedType,
                cleanedTitle,
                parsedDay,
                startTime,
                endTime,
                toNullIfEmpty(location),
                toNullIfEmpty(notes),
            ]
        );

        const row = await getEntryById(inserted.rows[0].id, req.userId!);
        return res.json({ success: true, data: mapEntryRow(row) });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Family member not found' });
        }
        if (error instanceof Error && error.message === 'TIME_OVERLAP') {
            return res.status(409).json({
                success: false,
                error: 'Conflicting schedule for this member at the same time',
            });
        }

        console.error('Create planning entry error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/bulk', async (req: AuthRequest, res) => {
    const client = await getClient();
    try {
        const {
            family_member_id,
            schedule_type,
            title,
            day_of_week_list,
            start_time,
            end_time,
            location,
            notes,
            replace_conflicts,
            source_entry_id,
        } = req.body;

        const memberId = toNullIfEmpty(family_member_id) as string | null;
        const cleanedTitle = typeof title === 'string' ? title.trim() : '';
        const cleanedType = typeof schedule_type === 'string' ? schedule_type.trim().toLowerCase() : '';
        const startTime = normalizeTime(start_time);
        const endTime = normalizeTime(end_time);
        const dayList = parseDayList(day_of_week_list);
        const replaceConflicts = Boolean(replace_conflicts);
        const sourceId = toNullIfEmpty(source_entry_id) as string | null;

        if (!memberId || !cleanedTitle || !startTime || !endTime || dayList.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'family_member_id, title, start_time, end_time and day_of_week_list are required',
            });
        }

        if (!ALLOWED_SCHEDULE_TYPES.has(cleanedType)) {
            return res.status(400).json({ success: false, error: 'Invalid schedule_type' });
        }

        if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
            return res.status(400).json({ success: false, error: 'end_time must be after start_time' });
        }

        await ensureMemberBelongsToUser(memberId, req.userId!);

        let sourceEntry: any = null;
        if (sourceId) {
            const existing = await query(
                'SELECT * FROM schedule_entries WHERE id = $1 AND user_id = $2',
                [sourceId, req.userId]
            );

            if (existing.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Planning entry not found' });
            }
            sourceEntry = existing.rows[0];
        }

        await client.query('BEGIN');

        const conflicts: Array<{ day_of_week: number; conflict_ids: string[] }> = [];
        const touchedIds: string[] = [];
        let createdCount = 0;
        let updatedCount = 0;

        const findOverlaps = async (dayOfWeek: number, excludeId?: string) => {
            const conflict = await client.query(
                `SELECT id
                 FROM schedule_entries
                 WHERE user_id = $1
                   AND family_member_id = $2
                   AND day_of_week = $3
                   AND start_time < $4::time
                   AND end_time > $5::time
                   AND ($6::uuid IS NULL OR id <> $6::uuid)`,
                [req.userId, memberId, dayOfWeek, endTime, startTime, excludeId || null]
            );
            return conflict.rows.map((row) => row.id as string);
        };

        for (const dayOfWeek of dayList) {
            const isSourceDay = sourceEntry && dayOfWeek === Number(sourceEntry.day_of_week);
            const excludeId = isSourceDay ? sourceEntry.id : undefined;

            const overlapIds = await findOverlaps(dayOfWeek, excludeId);

            if (overlapIds.length > 0 && !replaceConflicts) {
                conflicts.push({ day_of_week: dayOfWeek, conflict_ids: overlapIds });
                continue;
            }

            if (overlapIds.length > 0 && replaceConflicts) {
                await client.query(
                    `DELETE FROM schedule_entries
                     WHERE user_id = $1
                       AND family_member_id = $2
                       AND day_of_week = $3
                       AND start_time < $4::time
                       AND end_time > $5::time
                       AND ($6::uuid IS NULL OR id <> $6::uuid)`,
                    [req.userId, memberId, dayOfWeek, endTime, startTime, excludeId || null]
                );
            }

            if (isSourceDay) {
                await client.query(
                    `UPDATE schedule_entries
                     SET family_member_id = $1,
                         schedule_type = $2,
                         title = $3,
                         day_of_week = $4,
                         start_time = $5,
                         end_time = $6,
                         location = $7,
                         notes = $8
                     WHERE id = $9 AND user_id = $10`,
                    [
                        memberId,
                        cleanedType,
                        cleanedTitle,
                        dayOfWeek,
                        startTime,
                        endTime,
                        toNullIfEmpty(location),
                        toNullIfEmpty(notes),
                        sourceEntry.id,
                        req.userId,
                    ]
                );
                touchedIds.push(sourceEntry.id);
                updatedCount += 1;
                continue;
            }

            const inserted = await client.query(
                `INSERT INTO schedule_entries (
                    user_id, family_member_id, schedule_type, title, day_of_week, start_time, end_time, location, notes
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                RETURNING id`,
                [
                    req.userId,
                    memberId,
                    cleanedType,
                    cleanedTitle,
                    dayOfWeek,
                    startTime,
                    endTime,
                    toNullIfEmpty(location),
                    toNullIfEmpty(notes),
                ]
            );

            touchedIds.push(inserted.rows[0].id);
            createdCount += 1;
        }

        await client.query('COMMIT');

        let mappedRows: any[] = [];
        if (touchedIds.length > 0) {
            const rows = await query(
                `SELECT se.*, fm.name as family_member_name, fm.color as family_member_color, fm.role as family_member_role
                 FROM schedule_entries se
                 JOIN family_members fm ON se.family_member_id = fm.id
                 WHERE se.user_id = $1
                   AND se.id = ANY($2::uuid[])
                 ORDER BY se.day_of_week ASC, se.start_time ASC`,
                [req.userId, touchedIds]
            );
            mappedRows = rows.rows.map(mapEntryRow);
        }

        return res.json({
            success: true,
            data: {
                entries: mappedRows,
                created: createdCount,
                updated: updatedCount,
                conflicts,
            },
        });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Family member not found' });
        }
        console.error('Bulk planning update error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        client.release();
    }
});

router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        const existing = await query(
            'SELECT * FROM schedule_entries WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Planning entry not found' });
        }

        const current = existing.rows[0];

        const memberId = (req.body.family_member_id !== undefined
            ? toNullIfEmpty(req.body.family_member_id)
            : current.family_member_id) as string | null;
        const cleanedTitle = typeof req.body.title === 'string'
            ? req.body.title.trim()
            : current.title;
        const cleanedType = typeof req.body.schedule_type === 'string'
            ? req.body.schedule_type.trim().toLowerCase()
            : current.schedule_type;
        const parsedDay = req.body.day_of_week !== undefined
            ? parseDayOfWeek(req.body.day_of_week)
            : Number(current.day_of_week);
        const startTime = req.body.start_time !== undefined
            ? normalizeTime(req.body.start_time)
            : current.start_time;
        const endTime = req.body.end_time !== undefined
            ? normalizeTime(req.body.end_time)
            : current.end_time;

        if (!memberId || !cleanedTitle || !parsedDay || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'family_member_id, title, day_of_week, start_time and end_time are required',
            });
        }

        if (!ALLOWED_SCHEDULE_TYPES.has(cleanedType)) {
            return res.status(400).json({ success: false, error: 'Invalid schedule_type' });
        }

        if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
            return res.status(400).json({ success: false, error: 'end_time must be after start_time' });
        }

        await ensureMemberBelongsToUser(memberId, req.userId!);
        await ensureNoOverlap(req.userId!, memberId, parsedDay, startTime, endTime, id);

        await query(
            `UPDATE schedule_entries
             SET family_member_id = $1,
                 schedule_type = $2,
                 title = $3,
                 day_of_week = $4,
                 start_time = $5,
                 end_time = $6,
                 location = $7,
                 notes = $8
             WHERE id = $9 AND user_id = $10`,
            [
                memberId,
                cleanedType,
                cleanedTitle,
                parsedDay,
                startTime,
                endTime,
                req.body.location !== undefined ? toNullIfEmpty(req.body.location) : current.location,
                req.body.notes !== undefined ? toNullIfEmpty(req.body.notes) : current.notes,
                id,
                req.userId,
            ]
        );

        const row = await getEntryById(id, req.userId!);
        return res.json({ success: true, data: mapEntryRow(row) });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_MEMBER') {
            return res.status(400).json({ success: false, error: 'Family member not found' });
        }
        if (error instanceof Error && error.message === 'TIME_OVERLAP') {
            return res.status(409).json({
                success: false,
                error: 'Conflicting schedule for this member at the same time',
            });
        }

        console.error('Update planning entry error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            'DELETE FROM schedule_entries WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Planning entry not found' });
        }

        return res.json({ success: true, message: 'Planning entry deleted' });
    } catch (error) {
        console.error('Delete planning entry error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
