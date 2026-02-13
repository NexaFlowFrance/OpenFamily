import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

let loaded = false;

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
            return;
        }
    }

    dotenv.config();
    loaded = true;
};
