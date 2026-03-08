import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth';
import { normalizeEmail } from '../lib/normalize';

const router = Router();

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const result = await query('SELECT id, email, name FROM users WHERE id = $1', [req.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        return res.json({ success: true, data: { user: result.rows[0] } });
    } catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Register
router.post('/register', async (req, res) => {
    if (process.env.REGISTRATION_ENABLED === 'false') {
        return res.status(403).json({ success: false, error: 'Registration is disabled' });
    }

    try {
        const { email, password, name } = req.body;
        const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';
        const cleanedName = typeof name === 'string' ? name.trim() : '';

        if (!normalizedEmail || !password || !cleanedName) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        // Check if user exists
        const existingUser = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'User already exists' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Create user
        const result = await query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
            [normalizedEmail, password_hash, cleanedName]
        );

        const user = result.rows[0];
        const token = generateToken(user.id);

        res.json({ success: true, data: { user, token } });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';

        if (!normalizedEmail || !password) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Find user
        const result = await query('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const token = generateToken(user.id);

        res.json({
            success: true,
            data: {
                user: { id: user.id, email: user.email, name: user.name },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
