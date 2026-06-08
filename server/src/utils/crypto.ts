import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'openfamily-integrations-v1';

function getKey(): Buffer {
    const secret = process.env.JWT_SECRET || 'fallback-secret-must-be-changed';
    return scryptSync(secret, SALT, 32);
}

export function encryptCredentials(data: Record<string, string>): string {
    const key = getKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('hex'),
    });
}

export function decryptCredentials(encryptedJson: string): Record<string, string> {
    const key = getKey();
    const { iv, tag, data } = JSON.parse(encryptedJson) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const decrypted = decipher.update(Buffer.from(data, 'hex')).toString('utf8') + decipher.final('utf8');
    return JSON.parse(decrypted) as Record<string, string>;
}
