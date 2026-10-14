import { Router } from 'express';
import { query } from '../db';
import {
    authMiddleware,
    requireParent,
    AuthRequest,
} from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/integration-calendars
 */
router.get('/', async (req: AuthRequest, res) => {
    try {

        const result = await query(
            `
            SELECT
                *
            FROM integration_calendars
            WHERE user_id = $1
            ORDER BY calendar_name
            `,
            [req.userId]
        );

        res.json({
            success: true,
            data: result.rows,
        });

    } catch (error) {

        console.error(
            'integration_calendars.list',
            error
        );

        res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

/**
 * PUT /api/integration-calendars/:id
 */
router.put(
    '/:id',
    requireParent,
    async (
        req: AuthRequest,
        res
    ) => {

        try {

            const {
                color,
                enabled,
                family_member_ids,
            } = req.body;

            const updated =
                await query(
                    `
                    UPDATE integration_calendars
                    SET
                        color = $3,
                        enabled = $4,
                        family_member_ids = $5::jsonb,
                        updated_at = now()
                    WHERE
                        id = $1
                    AND user_id = $2
                    RETURNING *
                    `,
                    [
                        req.params.id,
                        req.userId,
                        color,
                        enabled,
                        JSON.stringify(
                            family_member_ids ?? []
                        ),
                    ]
                );

            if (
                updated.rows.length === 0
            ) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error: 'Not found',
                    });
            }

            res.json({
                success: true,
                data:
                    updated.rows[0],
            });

        } catch (error) {

            console.error(
                'integration_calendars.update',
                error
            );

            res.status(500).json({
                success: false,
                error:
                    'Internal server error',
            });
        }
    }
);

export default router;
