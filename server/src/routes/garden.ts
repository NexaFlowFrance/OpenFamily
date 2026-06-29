import { Router } from 'express';
import { getClient, query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
    careBodySchema,
    careListQuerySchema,
    carePatchSchema,
    observationBodySchema,
    observationListQuerySchema,
    plantBodySchema,
    plantListQuerySchema,
    plantPatchSchema,
    zoneBodySchema,
    zoneListQuerySchema,
    zonePatchSchema,
} from '../schemas/garden';
import logger from '../lib/logger';

// =============================================================================
// /api/garden — "Jardin & Pelouse" module
//
// Four resources, all auth-gated and scoped to the calling user:
//   - garden_zones        — lawn/vegetable/flower areas of the property
//   - garden_plants       — plants/cultures, optionally filed under a zone
//   - garden_care         — recurring care tasks (watering, mowing, …)
//   - garden_observations — health/state log for tracking over time
//
// Plus a read-only /statistics aggregator for the page dashboard.
//
// Recurrence policy (mirrors house_maintenance but in DAYS): when a care row
// gets its performed_date set (NULL→date) AND has a non-null recurrence_days,
// the PATCH .../complete handler inserts a fresh planned occurrence at
// performed_date + N days inside the same transaction.
// =============================================================================

const router = Router();
router.use(authMiddleware);

// Build a partial UPDATE from a validated patch body. Shared by every PATCH.
const buildUpdate = (body: Record<string, unknown>) => {
    const updates: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
        values.push(val);
        updates.push(`${col} = $${values.length}`);
    };
    for (const [k, v] of Object.entries(body)) {
        if (v === undefined) continue;
        push(k, v);
    }
    return { updates, values };
};

// Ownership guards for the optional FKs on plants/care/observations.
const ensureZoneBelongsToUserOrNull = async (
    zoneId: string | null | undefined,
    userId: string,
): Promise<void> => {
    if (!zoneId) return;
    const r = await query('SELECT id FROM garden_zones WHERE id = $1 AND user_id = $2', [
        zoneId,
        userId,
    ]);
    if (r.rows.length === 0) throw new Error('INVALID_ZONE');
};

const ensurePlantBelongsToUserOrNull = async (
    plantId: string | null | undefined,
    userId: string,
): Promise<void> => {
    if (!plantId) return;
    const r = await query('SELECT id FROM garden_plants WHERE id = $1 AND user_id = $2', [
        plantId,
        userId,
    ]);
    if (r.rows.length === 0) throw new Error('INVALID_PLANT');
};

// Maps FK validation errors to a 400; returns true if it handled the error.
const handleFkError = (error: unknown, res: import('express').Response): boolean => {
    if (error instanceof Error && error.message === 'INVALID_ZONE') {
        res.status(400).json({ success: false, error: 'Zone not found' });
        return true;
    }
    if (error instanceof Error && error.message === 'INVALID_PLANT') {
        res.status(400).json({ success: false, error: 'Plant not found' });
        return true;
    }
    return false;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const mapZone = (row: any) => ({
    id: row.id as string,
    name: row.name as string,
    zone_type: row.zone_type as string,
    location: row.location ?? null,
    area_m2: row.area_m2 !== null && row.area_m2 !== undefined ? Number(row.area_m2) : null,
    sun_exposure: row.sun_exposure ?? null,
    soil_type: row.soil_type ?? null,
    notes: row.notes ?? null,
    plants_count: row.plants_count !== undefined ? Number(row.plants_count) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const mapPlant = (row: any) => ({
    id: row.id as string,
    zone_id: row.zone_id ?? null,
    zone_name: row.zone_name ?? null,
    name: row.name as string,
    plant_type: row.plant_type as string,
    variety: row.variety ?? null,
    planted_date: row.planted_date ?? null,
    watering_frequency_days: row.watering_frequency_days ?? null,
    health_status: row.health_status as string,
    photo_url: row.photo_url ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const mapCare = (row: any) => ({
    id: row.id as string,
    zone_id: row.zone_id ?? null,
    zone_name: row.zone_name ?? null,
    plant_id: row.plant_id ?? null,
    plant_name: row.plant_name ?? null,
    care_type: row.care_type as string,
    title: row.title as string,
    planned_date: row.planned_date ?? null,
    performed_date: row.performed_date ?? null,
    cost: row.cost !== null && row.cost !== undefined ? Number(row.cost) : null,
    recurrence_days: row.recurrence_days ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const mapObservation = (row: any) => ({
    id: row.id as string,
    zone_id: row.zone_id ?? null,
    zone_name: row.zone_name ?? null,
    plant_id: row.plant_id ?? null,
    plant_name: row.plant_name ?? null,
    observed_at: row.observed_at,
    health_status: row.health_status ?? null,
    height_cm: row.height_cm !== null && row.height_cm !== undefined ? Number(row.height_cm) : null,
    notes: row.notes ?? null,
    photo_url: row.photo_url ?? null,
    created_at: row.created_at,
});

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

router.get('/zones', validate({ query: zoneListQuerySchema }), async (req: AuthRequest, res) => {
    try {
        const { zone_type, q } = req.query as { zone_type?: string; q?: string };
        const params: any[] = [req.userId];
        // LEFT JOIN plant count so zone cards show "X plantes" in one round-trip.
        let sql = `SELECT z.*, COUNT(p.id) AS plants_count
                   FROM garden_zones z
                   LEFT JOIN garden_plants p ON p.zone_id = z.id
                   WHERE z.user_id = $1`;
        if (zone_type) {
            params.push(zone_type);
            sql += ` AND z.zone_type = $${params.length}`;
        }
        if (q) {
            params.push(`%${q}%`);
            sql += ` AND z.name ILIKE $${params.length}`;
        }
        sql += ' GROUP BY z.id ORDER BY z.name ASC';
        const r = await query(sql, params);
        res.json({ success: true, data: r.rows.map(mapZone) });
    } catch (error) {
        logger.error('garden.list_zones_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/zones', validate({ body: zoneBodySchema }), async (req: AuthRequest, res) => {
    try {
        const b = req.body;
        const r = await query(
            `INSERT INTO garden_zones
                (user_id, name, zone_type, location, area_m2, sun_exposure, soil_type, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING *`,
            [
                req.userId,
                b.name,
                b.zone_type,
                b.location ?? null,
                b.area_m2 ?? null,
                b.sun_exposure ?? null,
                b.soil_type ?? null,
                b.notes ?? null,
            ],
        );
        res.status(201).json({ success: true, data: mapZone(r.rows[0]) });
    } catch (error) {
        logger.error('garden.create_zone_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.patch('/zones/:id', validate({ body: zonePatchSchema }), async (req: AuthRequest, res) => {
    try {
        const { updates, values } = buildUpdate(req.body);
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        values.push(req.params.id, req.userId);
        const r = await query(
            `UPDATE garden_zones SET ${updates.join(', ')}
             WHERE id = $${values.length - 1} AND user_id = $${values.length}
             RETURNING *`,
            values,
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Zone not found' });
        }
        res.json({ success: true, data: mapZone(r.rows[0]) });
    } catch (error) {
        logger.error('garden.update_zone_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.delete('/zones/:id', async (req: AuthRequest, res) => {
    try {
        // FK ON DELETE SET NULL on plants/care/observations — those rows are
        // kept (orphaned), not dropped.
        const r = await query(
            'DELETE FROM garden_zones WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId],
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Zone not found' });
        }
        res.json({ success: true });
    } catch (error) {
        logger.error('garden.delete_zone_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

const SELECT_PLANT_FULL = `
    SELECT p.*, z.name AS zone_name
    FROM garden_plants p
    LEFT JOIN garden_zones z ON p.zone_id = z.id
`;

router.get('/plants', validate({ query: plantListQuerySchema }), async (req: AuthRequest, res) => {
    try {
        const { zone_id, plant_type, health_status, q } = req.query as {
            zone_id?: string;
            plant_type?: string;
            health_status?: string;
            q?: string;
        };
        const params: any[] = [req.userId];
        let sql = `${SELECT_PLANT_FULL} WHERE p.user_id = $1`;
        if (zone_id) {
            params.push(zone_id);
            sql += ` AND p.zone_id = $${params.length}`;
        }
        if (plant_type) {
            params.push(plant_type);
            sql += ` AND p.plant_type = $${params.length}`;
        }
        if (health_status) {
            params.push(health_status);
            sql += ` AND p.health_status = $${params.length}`;
        }
        if (q) {
            params.push(`%${q}%`);
            sql += ` AND (p.name ILIKE $${params.length} OR p.variety ILIKE $${params.length})`;
        }
        sql += ' ORDER BY p.name ASC';
        const r = await query(sql, params);
        res.json({ success: true, data: r.rows.map(mapPlant) });
    } catch (error) {
        logger.error('garden.list_plants_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/plants', validate({ body: plantBodySchema }), async (req: AuthRequest, res) => {
    try {
        const b = req.body;
        await ensureZoneBelongsToUserOrNull(b.zone_id, req.userId!);
        const insert = await query(
            `INSERT INTO garden_plants
                (user_id, zone_id, name, plant_type, variety, planted_date,
                 watering_frequency_days, health_status, photo_url, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, 'En bonne santé'), $9, $10)
             RETURNING id`,
            [
                req.userId,
                b.zone_id ?? null,
                b.name,
                b.plant_type,
                b.variety ?? null,
                b.planted_date ?? null,
                b.watering_frequency_days ?? null,
                b.health_status ?? null,
                b.photo_url ?? null,
                b.notes ?? null,
            ],
        );
        const r = await query(`${SELECT_PLANT_FULL} WHERE p.id = $1 AND p.user_id = $2`, [
            insert.rows[0].id,
            req.userId,
        ]);
        res.status(201).json({ success: true, data: mapPlant(r.rows[0]) });
    } catch (error) {
        if (handleFkError(error, res)) return;
        logger.error('garden.create_plant_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.patch('/plants/:id', validate({ body: plantPatchSchema }), async (req: AuthRequest, res) => {
    try {
        if (req.body.zone_id !== undefined) {
            await ensureZoneBelongsToUserOrNull(req.body.zone_id, req.userId!);
        }
        const { updates, values } = buildUpdate(req.body);
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        values.push(req.params.id, req.userId);
        const upd = await query(
            `UPDATE garden_plants SET ${updates.join(', ')}
             WHERE id = $${values.length - 1} AND user_id = $${values.length}
             RETURNING id`,
            values,
        );
        if (upd.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Plant not found' });
        }
        const r = await query(`${SELECT_PLANT_FULL} WHERE p.id = $1 AND p.user_id = $2`, [
            upd.rows[0].id,
            req.userId,
        ]);
        res.json({ success: true, data: mapPlant(r.rows[0]) });
    } catch (error) {
        if (handleFkError(error, res)) return;
        logger.error('garden.update_plant_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.delete('/plants/:id', async (req: AuthRequest, res) => {
    try {
        const r = await query(
            'DELETE FROM garden_plants WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId],
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Plant not found' });
        }
        res.json({ success: true });
    } catch (error) {
        logger.error('garden.delete_plant_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ---------------------------------------------------------------------------
// Care
// ---------------------------------------------------------------------------

const SELECT_CARE_FULL = `
    SELECT c.*, z.name AS zone_name, p.name AS plant_name
    FROM garden_care c
    LEFT JOIN garden_zones z ON c.zone_id = z.id
    LEFT JOIN garden_plants p ON c.plant_id = p.id
`;

router.get('/care', validate({ query: careListQuerySchema }), async (req: AuthRequest, res) => {
    try {
        const { zone_id, plant_id, care_type, status, from, to } = req.query as {
            zone_id?: string;
            plant_id?: string;
            care_type?: string;
            status?: 'upcoming' | 'done' | 'all';
            from?: string;
            to?: string;
        };
        const params: any[] = [req.userId];
        let sql = `${SELECT_CARE_FULL} WHERE c.user_id = $1`;
        if (zone_id) {
            params.push(zone_id);
            sql += ` AND c.zone_id = $${params.length}`;
        }
        if (plant_id) {
            params.push(plant_id);
            sql += ` AND c.plant_id = $${params.length}`;
        }
        if (care_type) {
            params.push(care_type);
            sql += ` AND c.care_type = $${params.length}`;
        }
        const effectiveStatus = status ?? 'upcoming';
        if (effectiveStatus === 'upcoming') {
            sql += ' AND c.performed_date IS NULL AND c.planned_date IS NOT NULL';
        } else if (effectiveStatus === 'done') {
            sql += ' AND c.performed_date IS NOT NULL';
        }
        if (from) {
            params.push(from);
            sql += ` AND COALESCE(c.planned_date, c.performed_date) >= $${params.length}`;
        }
        if (to) {
            params.push(to);
            sql += ` AND COALESCE(c.planned_date, c.performed_date) <= $${params.length}`;
        }
        sql +=
            effectiveStatus === 'done'
                ? ' ORDER BY c.performed_date DESC'
                : ' ORDER BY c.planned_date ASC NULLS LAST, c.performed_date DESC';
        const r = await query(sql, params);
        res.json({ success: true, data: r.rows.map(mapCare) });
    } catch (error) {
        logger.error('garden.list_care_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/care', validate({ body: careBodySchema }), async (req: AuthRequest, res) => {
    try {
        const b = req.body;
        await ensureZoneBelongsToUserOrNull(b.zone_id, req.userId!);
        await ensurePlantBelongsToUserOrNull(b.plant_id, req.userId!);
        const insert = await query(
            `INSERT INTO garden_care
                (user_id, zone_id, plant_id, care_type, title, planned_date,
                 performed_date, cost, recurrence_days, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id`,
            [
                req.userId,
                b.zone_id ?? null,
                b.plant_id ?? null,
                b.care_type,
                b.title,
                b.planned_date ?? null,
                b.performed_date ?? null,
                b.cost ?? null,
                b.recurrence_days ?? null,
                b.notes ?? null,
            ],
        );
        const r = await query(`${SELECT_CARE_FULL} WHERE c.id = $1 AND c.user_id = $2`, [
            insert.rows[0].id,
            req.userId,
        ]);
        res.status(201).json({ success: true, data: mapCare(r.rows[0]) });
    } catch (error) {
        if (handleFkError(error, res)) return;
        logger.error('garden.create_care_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.patch('/care/:id', validate({ body: carePatchSchema }), async (req: AuthRequest, res) => {
    try {
        if (req.body.zone_id !== undefined) {
            await ensureZoneBelongsToUserOrNull(req.body.zone_id, req.userId!);
        }
        if (req.body.plant_id !== undefined) {
            await ensurePlantBelongsToUserOrNull(req.body.plant_id, req.userId!);
        }
        const { updates, values } = buildUpdate(req.body);
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        values.push(req.params.id, req.userId);
        const upd = await query(
            `UPDATE garden_care SET ${updates.join(', ')}
             WHERE id = $${values.length - 1} AND user_id = $${values.length}
             RETURNING id`,
            values,
        );
        if (upd.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Care not found' });
        }
        const r = await query(`${SELECT_CARE_FULL} WHERE c.id = $1 AND c.user_id = $2`, [
            upd.rows[0].id,
            req.userId,
        ]);
        res.json({ success: true, data: mapCare(r.rows[0]) });
    } catch (error) {
        if (handleFkError(error, res)) return;
        logger.error('garden.update_care_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * PATCH /api/garden/care/:id/complete
 * Body: { performed_date?: 'YYYY-MM-DD' } — defaults to today.
 *
 * Marks the care as done and, when recurrence_days is set, inserts the next
 * planned occurrence at performed_date + N days inside the same transaction.
 * Locks the row FOR UPDATE so two concurrent completes can't double-create the
 * next occurrence. Re-completing an already-completed row does NOT re-fire.
 */
router.patch('/care/:id/complete', async (req: AuthRequest, res) => {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const before = await client.query(
            'SELECT * FROM garden_care WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [req.params.id, req.userId],
        );
        if (before.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Care not found' });
        }
        const previous = before.rows[0];

        // Accept an explicit performed_date (validated loosely here since this
        // route has no body schema), else default to today.
        const rawDate =
            typeof req.body?.performed_date === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(req.body.performed_date)
                ? req.body.performed_date
                : null;

        const after = await client.query(
            `UPDATE garden_care
                SET performed_date = COALESCE($1::date, CURRENT_DATE)
              WHERE id = $2 AND user_id = $3
              RETURNING *`,
            [rawDate, req.params.id, req.userId],
        );
        const updated = after.rows[0];

        const justCompleted = previous.performed_date === null && updated.performed_date !== null;
        const recurrence = updated.recurrence_days;
        let createdNext: any = null;
        if (justCompleted && recurrence && recurrence > 0) {
            const next = await client.query(
                `INSERT INTO garden_care
                    (user_id, zone_id, plant_id, care_type, title, planned_date,
                     recurrence_days, notes)
                 VALUES ($1,$2,$3,$4,$5,
                         ($6::date + ($7 || ' days')::interval)::date,
                         $7, $8)
                 RETURNING *`,
                [
                    req.userId,
                    updated.zone_id,
                    updated.plant_id,
                    updated.care_type,
                    updated.title,
                    updated.performed_date,
                    recurrence,
                    updated.notes ?? null,
                ],
            );
            createdNext = next.rows[0];
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            data: {
                ...mapCare(updated),
                next_occurrence: createdNext ? mapCare(createdNext) : null,
            },
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        logger.error('garden.complete_care_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        client.release();
    }
});

router.delete('/care/:id', async (req: AuthRequest, res) => {
    try {
        const r = await query(
            'DELETE FROM garden_care WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId],
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Care not found' });
        }
        res.json({ success: true });
    } catch (error) {
        logger.error('garden.delete_care_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

const SELECT_OBSERVATION_FULL = `
    SELECT o.*, z.name AS zone_name, p.name AS plant_name
    FROM garden_observations o
    LEFT JOIN garden_zones z ON o.zone_id = z.id
    LEFT JOIN garden_plants p ON o.plant_id = p.id
`;

router.get(
    '/observations',
    validate({ query: observationListQuerySchema }),
    async (req: AuthRequest, res) => {
        try {
            const { zone_id, plant_id } = req.query as { zone_id?: string; plant_id?: string };
            const params: any[] = [req.userId];
            let sql = `${SELECT_OBSERVATION_FULL} WHERE o.user_id = $1`;
            if (zone_id) {
                params.push(zone_id);
                sql += ` AND o.zone_id = $${params.length}`;
            }
            if (plant_id) {
                params.push(plant_id);
                sql += ` AND o.plant_id = $${params.length}`;
            }
            sql += ' ORDER BY o.observed_at DESC, o.created_at DESC';
            const r = await query(sql, params);
            res.json({ success: true, data: r.rows.map(mapObservation) });
        } catch (error) {
            logger.error('garden.list_observations_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },
);

router.post(
    '/observations',
    validate({ body: observationBodySchema }),
    async (req: AuthRequest, res) => {
        try {
            const b = req.body;
            await ensureZoneBelongsToUserOrNull(b.zone_id, req.userId!);
            await ensurePlantBelongsToUserOrNull(b.plant_id, req.userId!);
            const insert = await query(
                `INSERT INTO garden_observations
                    (user_id, zone_id, plant_id, observed_at, health_status, height_cm, notes, photo_url)
                 VALUES ($1,$2,$3, COALESCE($4::date, CURRENT_DATE), $5,$6,$7,$8)
                 RETURNING id`,
                [
                    req.userId,
                    b.zone_id ?? null,
                    b.plant_id ?? null,
                    b.observed_at ?? null,
                    b.health_status ?? null,
                    b.height_cm ?? null,
                    b.notes ?? null,
                    b.photo_url ?? null,
                ],
            );
            // Keep the targeted plant's current health in sync with its latest
            // observation, so plant cards reflect the journal without a join.
            if (b.plant_id && b.health_status) {
                await query(
                    'UPDATE garden_plants SET health_status = $1 WHERE id = $2 AND user_id = $3',
                    [b.health_status, b.plant_id, req.userId],
                );
            }
            const r = await query(`${SELECT_OBSERVATION_FULL} WHERE o.id = $1 AND o.user_id = $2`, [
                insert.rows[0].id,
                req.userId,
            ]);
            res.status(201).json({ success: true, data: mapObservation(r.rows[0]) });
        } catch (error) {
            if (handleFkError(error, res)) return;
            logger.error('garden.create_observation_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },
);

router.delete('/observations/:id', async (req: AuthRequest, res) => {
    try {
        const r = await query(
            'DELETE FROM garden_observations WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId],
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Observation not found' });
        }
        res.json({ success: true });
    } catch (error) {
        logger.error('garden.delete_observation_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ---------------------------------------------------------------------------
// Dashboard aggregator (used by the Garden page "Vue d'ensemble")
// ---------------------------------------------------------------------------

router.get('/statistics', async (req: AuthRequest, res) => {
    try {
        const upcoming = await query(
            `${SELECT_CARE_FULL}
             WHERE c.user_id = $1
               AND c.performed_date IS NULL
               AND c.planned_date IS NOT NULL
               AND c.planned_date <= CURRENT_DATE + INTERVAL '7 days'
             ORDER BY c.planned_date ASC
             LIMIT 8`,
            [req.userId],
        );
        const counts = await query(
            `SELECT
                (SELECT COUNT(*) FROM garden_zones WHERE user_id = $1) AS zones,
                (SELECT COUNT(*) FROM garden_plants WHERE user_id = $1) AS plants,
                (SELECT COUNT(*) FROM garden_plants WHERE user_id = $1
                    AND health_status IN ('À surveiller', 'Malade')) AS plants_to_watch,
                (SELECT COUNT(*) FROM garden_care WHERE user_id = $1
                    AND performed_date IS NULL AND planned_date IS NOT NULL
                    AND planned_date <= CURRENT_DATE) AS care_due_today,
                (SELECT COUNT(*) FROM garden_care WHERE user_id = $1
                    AND performed_date IS NULL AND planned_date IS NOT NULL
                    AND planned_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
                  AS care_due_7d`,
            [req.userId],
        );
        res.json({
            success: true,
            data: {
                upcoming_care: upcoming.rows.map(mapCare),
                counts: {
                    zones: Number(counts.rows[0].zones),
                    plants: Number(counts.rows[0].plants),
                    plants_to_watch: Number(counts.rows[0].plants_to_watch),
                    care_due_today: Number(counts.rows[0].care_due_today),
                    care_due_7d: Number(counts.rows[0].care_due_7d),
                },
            },
        });
    } catch (error) {
        logger.error('garden.statistics_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
