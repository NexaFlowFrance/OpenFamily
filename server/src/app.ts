import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { validateUuidParam } from './middleware/security';
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
import aiRoutes from './routes/ai';
import weatherRoutes from './routes/weather';
import houseRoutes from './routes/house';
import gardenRoutes from './routes/garden';
import notificationsRoutes from './routes/notifications';
import documentsRoutes from './routes/documents';
import vacationsRoutes from './routes/vacations';
import { loadEnv } from './config/loadEnv';
import logger from './lib/logger';

loadEnv();

const app = express();

const parseIntEnv = (raw: string | undefined, fallback: number): number => {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Rate limit applied to login/register specifically (catches credential
// stuffing). Conservative defaults; tunable via env.
const authRateLimitWindowMs = parseIntEnv(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 900_000);
const authRateLimitMax = parseIntEnv(process.env.AUTH_RATE_LIMIT_MAX, 10);

const authRateLimiter = rateLimit({
    windowMs: authRateLimitWindowMs,
    max: authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        error: 'Too many authentication attempts. Please try again later.',
    },
});

// Global rate limit on the API surface. Sized to be invisible to legitimate
// SPA usage but enough to deter scraping/abuse from a single IP. Per-user
// quotas (e.g. for the AI endpoints in task #16) will be enforced separately.
const globalRateLimitWindowMs = parseIntEnv(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000);
const globalRateLimitMax = parseIntEnv(process.env.API_RATE_LIMIT_MAX, 300);

const globalApiRateLimiter = rateLimit({
    windowMs: globalRateLimitWindowMs,
    max: globalRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests. Please slow down and try again shortly.',
    },
});

// Security headers. Helmet defaults are sensible for an API, but two
// adjustments are needed:
//  - We serve JSON, not HTML, so the default Content-Security-Policy adds
//    noise without benefit (and would interfere if anyone ever loads a JSON
//    response in a browser tab).
//  - The default Cross-Origin-Resource-Policy=same-origin would block our
//    frontend (hosted on a different origin in production) from reading API
//    responses, even with CORS configured. CORS is the authoritative control
//    here, so we relax CORP to cross-origin.
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
);

// Middleware
app.use(
    cors({
        origin: process.env.CORS_ORIGINS?.split(',') || [
            'http://localhost:5173',
            'http://localhost:3000',
        ],
        credentials: true,
    }),
);

// JSON body limit. The default of 100kb is too tight for bulk imports
// (POST /api/data/import). The MAX_TOTAL_ROWS cap inside the route is the
// real protection; this just lets legitimate payloads through.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// Reject malformed `:id` route params before they hit any handler or PostgreSQL.
// All current routes use `:id`; if future routes introduce other UUID-typed
// param names, register them here too.
app.param('id', validateUuidParam);

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

// Health check (kept outside the global rate limiter so uptime probes never
// trip it).
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global API rate limit — applies to every /api/* route below.
app.use('/api', globalApiRateLimiter);

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
app.use('/api/ai', aiRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/house', houseRoutes);
app.use('/api/garden', gardenRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/vacations', vacationsRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler. Maps known body-parser failures (oversized JSON, malformed
// JSON) to proper client-error status codes instead of a generic 500.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const isPayloadTooLarge = err?.type === 'entity.too.large' || err?.status === 413;
    const isMalformedJson =
        err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err);

    if (isPayloadTooLarge) {
        logger.warn('http.payload_too_large', {
            method: req.method,
            path: req.path,
            limit: (err as { limit?: number })?.limit,
            received: (err as { length?: number })?.length,
        });
        res.status(413).json({ success: false, error: 'Payload too large' });
        return;
    }

    if (isMalformedJson) {
        logger.warn('http.bad_json', { method: req.method, path: req.path });
        res.status(400).json({ success: false, error: 'Malformed JSON body' });
        return;
    }

    logger.error('http.unhandled_error', {
        method: req.method,
        path: req.path,
        error: err instanceof Error ? err.message : String(err),
        stack:
            err instanceof Error && process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });

    res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;
