import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getKey(): Buffer {
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) {
    throw new Error('ENCRYPTION_KEY is missing (must be 32 bytes base64).');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes.');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // format: iv.tag.cipher (base64)
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted secret format.');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString('utf8');
}
