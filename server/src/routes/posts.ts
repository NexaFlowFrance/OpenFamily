import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';

const router = Router();
router.use(authMiddleware);

const MAX_CONTENT = 5000;
const MAX_IMAGE = 2_000_000;
const MAX_LINK = 2000;

const cleanContent = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    return v ? v.slice(0, MAX_CONTENT) : null;
};

const cleanImage = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;

    const v = value.trim();

    if (v.length > MAX_IMAGE) {
        throw new Error('IMAGE_TOO_LARGE');
    }

    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(v)) {
        throw new Error('INVALID_IMAGE');
    }

    return v;
};

const cleanLink = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;

    const v = value.trim();

    if (v.length > MAX_LINK) {
        throw new Error('INVALID_LINK');
    }

    try {
        const url = new URL(v);

        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error();
        }

        return url.toString();
    } catch {
        throw new Error('INVALID_LINK');
    }
};

const loadPosts = async (
    ownerId: string,
    actualUserId: string,
    limit = 100,
    postId?: string
) => {
    const values: unknown[] = [ownerId];
    let postFilter = '';

    if (postId) {
        values.push(postId);
        postFilter = ` AND p.id = $${values.length}`;
    }

    values.push(Math.min(Math.max(limit, 1), 100));

    const result = await query(
        `SELECT
            p.id,
            p.user_id,
            p.author_user_id,
            p.content,
            p.image_url,
            p.link_url,
            p.created_at,
            p.updated_at,
            u.name AS author_name,
            COALESCE(fm.avatar_url, u.avatar_url) AS author_avatar
         FROM family_posts p
         JOIN users u
           ON u.id = p.author_user_id
         LEFT JOIN LATERAL (
             SELECT avatar_url
             FROM family_members
             WHERE user_id = p.user_id
               AND linked_user_id = p.author_user_id
             LIMIT 1
         ) fm ON TRUE
         WHERE p.user_id = $1
         ${postFilter}
         ORDER BY p.created_at DESC
         LIMIT $${values.length}`,
        values
    );

    if (result.rows.length === 0) return [];

    const ids = result.rows.map((r: { id: string }) => r.id);

    const seen = await query(
        `SELECT
            s.post_id,
            s.user_id,
            u.name,
            s.seen_at
         FROM family_post_seen s
         JOIN users u ON u.id = s.user_id
         WHERE s.post_id = ANY($1::uuid[])
           AND (u.id = $2 OR u.family_owner_id = $2)
         ORDER BY s.seen_at ASC`,
        [ids, ownerId]
    );

    return result.rows.map((post: any) => {
        const seenBy = seen.rows
            .filter((row: any) => row.post_id === post.id)
            .map((row: any) => ({
                id: row.user_id,
                name: row.name,
                seen_at: row.seen_at,
            }));

        return {
            ...post,
            seen_by: seenBy,
            is_seen: seenBy.some((row: any) => row.id === actualUserId),
            is_own: post.author_user_id === actualUserId,
        };
    });
};

router.get('/', async (req: AuthRequest, res) => {
    try {
        if (!req.userId || !req.actualUserId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication',
            });
        }

        return res.json({
            success: true,
            data: await loadPosts(req.userId, req.actualUserId),
        });
    } catch (error) {
        console.error('Get posts error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

router.get('/latest', async (req: AuthRequest, res) => {
    try {
        if (!req.userId || !req.actualUserId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication',
            });
        }

        const posts = await loadPosts(
            req.userId,
            req.actualUserId,
            1
        );

        return res.json({
            success: true,
            data: posts[0] ?? null,
        });
    } catch (error) {
        console.error('Get latest post error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        if (!req.userId || !req.actualUserId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication',
            });
        }

        const account = await query(
            `SELECT id
             FROM users
             WHERE id = $1
               AND (id = $2 OR family_owner_id = $2)`,
            [req.actualUserId, req.userId]
        );

        if (account.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Not a member of this family',
            });
        }

        const content = cleanContent(req.body?.content);
        const imageUrl = cleanImage(req.body?.image_url);
        const linkUrl = cleanLink(req.body?.link_url);

        if (!content && !imageUrl && !linkUrl) {
            return res.status(400).json({
                success: false,
                error: 'A post must contain text, a photo, or a link',
            });
        }

        const result = await query(
            `INSERT INTO family_posts (
                user_id,
                author_user_id,
                content,
                image_url,
                link_url
             )
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [
                req.userId,
                req.actualUserId,
                content,
                imageUrl,
                linkUrl,
            ]
        );

        const id = result.rows[0].id as string;

        await query(
            `INSERT INTO family_post_seen (post_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [id, req.actualUserId]
        );

        const posts = await loadPosts(
            req.userId,
            req.actualUserId,
            1,
            id
        );

        broadcast(req.userId, {
            type: 'update',
            entity: 'posts',
            action: 'created',
        });

        return res.json({
            success: true,
            data: posts[0],
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === 'IMAGE_TOO_LARGE') {
                return res.status(400).json({
                    success: false,
                    error: 'Photo is too large',
                });
            }

            if (error.message === 'INVALID_IMAGE') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid photo',
                });
            }

            if (error.message === 'INVALID_LINK') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid link',
                });
            }
        }

        console.error('Create post error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

router.put('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.userId || !req.actualUserId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication',
            });
        }

        const content = cleanContent(req.body?.content);
        const imageUrl = cleanImage(req.body?.image_url);
        const linkUrl = cleanLink(req.body?.link_url);

        if (!content && !imageUrl && !linkUrl) {
            return res.status(400).json({
                success: false,
                error: 'A post must contain text, a photo, or a link',
            });
        }

        const result = await query(
            `UPDATE family_posts
             SET content = $1,
                 image_url = $2,
                 link_url = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
               AND user_id = $5
               AND author_user_id = $6
             RETURNING id`,
            [
                content,
                imageUrl,
                linkUrl,
                req.params.id,
                req.userId,
                req.actualUserId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Post not found or cannot be edited',
            });
        }

        const posts = await loadPosts(
            req.userId,
            req.actualUserId,
            1,
            req.params.id
        );

        broadcast(req.userId, {
            type: 'update',
            entity: 'posts',
            action: 'updated',
        });

        return res.json({
            success: true,
            data: posts[0],
        });
    } catch (error) {
        if (
            error instanceof Error &&
            ['IMAGE_TOO_LARGE', 'INVALID_IMAGE', 'INVALID_LINK'].includes(
                error.message
            )
        ) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }

        console.error('Update post error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.userId || !req.actualUserId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication',
            });
        }

        const result = await query(
            `DELETE FROM family_posts
             WHERE id = $1
               AND user_id = $2
               AND author_user_id = $3
             RETURNING id`,
            [
                req.params.id,
                req.userId,
                req.actualUserId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Post not found or cannot be deleted',
            });
        }

        broadcast(req.userId, {
            type: 'update',
            entity: 'posts',
            action: 'deleted',
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('Delete post error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

router.post('/:id/seen', async (req: AuthRequest, res) => {
    try {
        if (!req.userId || !req.actualUserId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication',
            });
        }

        const exists = await query(
            `SELECT id
             FROM family_posts
             WHERE id = $1
               AND user_id = $2`,
            [req.params.id, req.userId]
        );

        if (exists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Post not found',
            });
        }

        await query(
            `INSERT INTO family_post_seen (post_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT (post_id, user_id) DO NOTHING`,
            [req.params.id, req.actualUserId]
        );

        const posts = await loadPosts(
            req.userId,
            req.actualUserId,
            1,
            req.params.id
        );

        broadcast(req.userId, {
            type: 'update',
            entity: 'posts',
            action: 'updated',
        });

        return res.json({
            success: true,
            data: posts[0],
        });
    } catch (error) {
        console.error('Mark post seen error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

export default router;
