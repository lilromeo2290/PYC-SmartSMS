import crypto from 'crypto';

// AES-256-GCM encryption for SMS provider credentials — secrets are never stored in plaintext
// and never returned to the client.
const KEY_SOURCE = process.env.APP_SECRET || 'pyc-smartsms-default-secret-key-2026';
const KEY = crypto.createHash('sha256').update(KEY_SOURCE).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith('enc:')) return stored; // legacy/plaintext fallback
  try {
    const [, ivB64, tagB64, dataB64] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(s: string): string {
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}
