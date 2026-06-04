import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import shoppingRoutes from './routes/shopping';
import tasksRoutes from './routes/tasks';
import appointmentsRoutes from './routes/appointments';
import recipesRoutes from './routes/recipes';
import mealPlansRoutes from './routes/mealPlans';
import budgetRoutes from './routes/budget';
import familyRoutes from './routes/family';
import dashboardRoutes from './routes/dashboard';
import planningRoutes from './routes/planning';
import dataTransferRoutes from './routes/dataTransfer';
import notificationsRoutes from './routes/notifications';
import familyInvitesRoutes from './routes/familyInvites';
import calendarRoutes from './routes/calendar';
import { loadEnv } from './config/loadEnv';
import logger from './lib/logger';

loadEnv();

const app = express();
app.set('trust proxy', 1);
const authRateLimitWindowMs = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10);
const authRateLimitMax = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10);

const authRateLimiter = rateLimit({
    windowMs: Number.isNaN(authRateLimitWindowMs) ? 900000 : authRateLimitWindowMs,
    max: Number.isNaN(authRateLimitMax) ? 10 : authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        error: 'Too many authentication attempts. Please try again later.'
    }
});

// Middleware
// When the Express server also serves the built client (native Windows install),
// disable the strict CSP so the SPA and its runtime styles load — this matches the
// nginx setup used in the Docker deployment, which does not set a CSP either.
app.use(helmet({
    contentSecurityPolicy: process.env.SERVE_CLIENT_DIR ? false : undefined,
}));
app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
    const startedAt = Date.now();

    res.on('finish', () => {
        logger.info('http.request', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            ip: req.ip,
        });
    });

    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/shopping', shoppingRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/meal-plans', mealPlansRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/data', dataTransferRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/invites', familyInvitesRoutes);
app.use('/api/calendar', calendarRoutes);

// Static client (native Windows install): serve the built SPA from the same origin
// as the API, so the app is reachable from any device on the LAN via http://<ip>:3000.
if (process.env.SERVE_CLIENT_DIR) {
    const clientDir = path.resolve(process.env.SERVE_CLIENT_DIR);
    app.use(express.static(clientDir));
    // SPA fallback: any non-API GET returns index.html (client-side routing).
    app.get(/^(?!\/api\/|\/health|\/ws).*/, (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.sendFile(path.join(clientDir, 'index.html'));
    });
}

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('http.unhandled_error', {
        method: req.method,
        path: req.path,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error && process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });

    res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;
