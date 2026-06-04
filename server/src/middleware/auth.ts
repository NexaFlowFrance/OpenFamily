import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/loadEnv';
import { query } from '../db';

export interface AuthRequest extends Request {
    /** Effective family-owner user ID — used by all data queries */
    userId?: string;
    /** Actual logged-in user's ID (may differ from userId when the user is a family member) */
    actualUserId?: string;
    /** True when the logged-in user IS the family owner (or a standalone user) */
    isOwner?: boolean;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

        if (!token) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }

        const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; ownerId?: string };
        req.actualUserId = decoded.userId;
        req.userId = decoded.ownerId ?? decoded.userId;
        req.isOwner = !decoded.ownerId || decoded.ownerId === decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

export const generateToken = (userId: string, ownerId?: string): string => {
    return jwt.sign({ userId, ownerId: ownerId ?? userId }, getJwtSecret(), { expiresIn: '7d' });
};

/**
 * Restrict a route to "parent" (or owner) accounts. Accounts with the "enfant"
 * role get read-only access and are rejected on write operations guarded by this.
 * Must run after authMiddleware.
 */
export const requireParent = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        // The family owner always has full rights.
        if (req.isOwner) {
            return next();
        }

        const result = await query('SELECT role FROM users WHERE id = $1', [req.actualUserId]);
        const role = result.rows[0]?.role as string | undefined;

        if (role === 'enfant') {
            return res.status(403).json({
                success: false,
                error: 'Action réservée aux parents.',
            });
        }

        return next();
    } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
