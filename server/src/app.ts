import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import userSettingsRoutes from './routes/userSettings';
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
import integrationsRoutes from './routes/integrations';
import rewardsRoutes from './routes/rewards';
import notesRoutes from './routes/notes';
import aiRoutes from './routes/ai';
import categoriesRoutes from './routes/categories';
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

// Separate, looser limiter for endpoints that trigger OUTBOUND requests (AI
// providers, recipe import, integration test/sync). These can each fan out to a
// user-supplied host, so they get rate-limited to blunt abuse / SSRF probing,
// but the cap stays high enough that normal family use and the CI smoke test
// (which does not hammer these routes) are unaffected. Keyed by IP (default).
const outboundRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests. Please try again later.'
    }
});

// Middleware
// When the Express server also serves the built client (native Windows install),
// apply an explicit CSP tailored to the SPA instead of helmet's default (which is
// too strict for it) — the Vite build has no inline scripts, but Radix/Recharts
// inject inline styles, recipe images come from arbitrary https URLs (and data
// URLs for avatars), and the app talks to its own origin via fetch + WebSocket.
const spaContentSecurityPolicy = {
    useDefaults: false,
    directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        // 'self' + WebSocket for the app's own API; the two Open-Meteo hosts are
        // the Kiosk weather widget's direct browser fetches (no broad https:).
        'connect-src': ["'self'", 'ws:', 'wss:', 'https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com'],
        'font-src': ["'self'", 'data:'],
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'self'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
    },
};

app.use(helmet({
    contentSecurityPolicy: process.env.SERVE_CLIENT_DIR ? spaContentSecurityPolicy : undefined,
}));
// The native (Capacitor) app loads from a fixed local shell origin and
// authenticates with a Bearer token (no cookies), so these are always allowed in
// addition to the configured web origins — the mobile app can then reach any
// server without the user having to touch CORS_ORIGINS.
const APP_SHELL_ORIGINS = ['http://localhost', 'https://localhost', 'capacitor://localhost'];
const corsOrigins = [
    ...(process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean)
        || ['http://localhost:5173', 'http://localhost:3000']),
    ...APP_SHELL_ORIGINS,
];
app.use(cors({
    origin: corsOrigins,
    credentials: true,
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
// Outbound-triggering routes: looser limiter applied to the whole path prefix.
app.use('/api/ai', outboundRateLimiter);
app.use('/api/recipes/import-url', outboundRateLimiter);
app.use('/api/integrations', outboundRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/auth', userSettingsRoutes);
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
app.use('/api/integrations', integrationsRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/categories', categoriesRoutes);

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
