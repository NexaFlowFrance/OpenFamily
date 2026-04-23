import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

let loaded = false;
const MIN_JWT_SECRET_LENGTH = 32;
const WEAK_JWT_SECRETS = new Set([
    'your-super-secret-jwt-key',
    'replace-me-with-a-long-random-secret',
    'CHANGE_ME_STRONG_RANDOM_SECRET_MIN_32_CHARS',
]);

const validateJwtSecret = () => {
    if (process.env.NODE_ENV === 'test') {
        return;
    }

    const jwtSecret = process.env.JWT_SECRET?.trim();

    if (!jwtSecret) {
        throw new Error('JWT_SECRET is required and must be set to a secure value.');
    }

    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
        throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long.`);
    }

    if (WEAK_JWT_SECRETS.has(jwtSecret)) {
        throw new Error('JWT_SECRET uses an insecure placeholder value. Set a strong random secret.');
    }
};

export const loadEnv = () => {
    if (loaded) {
        return;
    }

    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '..', '.env'),
    ];

    for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            loaded = true;
            validateJwtSecret();
            return;
        }
    }

    dotenv.config();
    loaded = true;

    validateJwtSecret();
};

export const getJwtSecret = (): string => {
    loadEnv();
    validateJwtSecret();
    return process.env.JWT_SECRET!.trim();
};
