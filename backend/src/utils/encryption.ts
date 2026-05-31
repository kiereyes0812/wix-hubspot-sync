import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getDerivedKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return crypto.scryptSync(secret, 'wix-hubspot-salt', KEY_LENGTH);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string: iv:tag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts a base64-encoded string produced by encrypt().
 */
export function decrypt(encoded: string): string {
  const key = getDerivedKey();
  const data = Buffer.from(encoded, 'base64');

  const iv = data.slice(0, IV_LENGTH);
  const tag = data.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.slice(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
