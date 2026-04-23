type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogMeta = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const REDACT_KEYS = ['password', 'token', 'secret', 'authorization', 'cookie', 'jwt'];
const MAX_DEPTH = 4;

const parseLogLevel = (value: string | undefined): LogLevel => {
    const normalized = value?.trim().toLowerCase();

    if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
        return normalized;
    }

    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

const activeLevel = parseLogLevel(process.env.LOG_LEVEL);

const shouldLog = (level: LogLevel): boolean => LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[activeLevel];

const shouldRedact = (key: string): boolean => {
    const lower = key.toLowerCase();
    return REDACT_KEYS.some((candidate) => lower.includes(candidate));
};

const sanitize = (value: unknown, depth = 0): unknown => {
    if (depth > MAX_DEPTH) {
        return '[Truncated]';
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => sanitize(entry, depth + 1));
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        const sanitized: Record<string, unknown> = {};

        for (const [key, entry] of entries) {
            sanitized[key] = shouldRedact(key) ? '[Redacted]' : sanitize(entry, depth + 1);
        }

        return sanitized;
    }

    if (typeof value === 'string' && value.length > 2000) {
        return `${value.slice(0, 2000)}...[truncated]`;
    }

    return value;
};

const emit = (level: LogLevel, message: string, meta?: LogMeta) => {
    if (!shouldLog(level)) {
        return;
    }

    const payload: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level,
        message,
    };

    if (meta && Object.keys(meta).length > 0) {
        payload.meta = sanitize(meta);
    }

    const line = JSON.stringify(payload);

    if (level === 'error') {
        console.error(line);
        return;
    }

    if (level === 'warn') {
        console.warn(line);
        return;
    }

    console.log(line);
};

export const logger = {
    debug: (message: string, meta?: LogMeta) => emit('debug', message, meta),
    info: (message: string, meta?: LogMeta) => emit('info', message, meta),
    warn: (message: string, meta?: LogMeta) => emit('warn', message, meta),
    error: (message: string, meta?: LogMeta) => emit('error', message, meta),
};

export default logger;
