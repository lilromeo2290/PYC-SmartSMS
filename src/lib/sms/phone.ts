// Ghana phone normalization + SMS segment estimation

/**
 * Normalize a Ghana phone number to E.164 (+233XXXXXXXXX).
 * Accepts: 0241234567, +233241234567, 233241234567, 00233241234567.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00233')) digits = digits.slice(2);
  if (digits.startsWith('233')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^\d{9}$/.test(digits)) return null;
  // Ghana mobile prefixes: 2x or 5x (MTN 24/54/55/59, AirtelTigo 27/57/26/56/23, Telecel 20/50)
  if (!/^[25]\d{8}$/.test(digits)) return null;
  return '+233' + digits;
}

export function validatePhoneGhana(raw: string): { ok: boolean; normalized?: string; error?: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { ok: false, error: 'Phone number is required.' };
  const normalized = normalizePhone(trimmed);
  if (!normalized) return { ok: false, error: `"${trimmed}" is not a valid Ghana mobile number (e.g. 0241234567).` };
  return { ok: true, normalized };
}

// GSM 03.38 basic character set
const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæÉé!'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€";

export function isGsm7(text: string): boolean {
  for (const ch of text) if (!GSM7.includes(ch)) return false;
  return true;
}

/**
 * Estimate billable SMS units. GSM-7: 160 chars single / 153 multipart.
 * Unicode (e.g. contains GH₵ cedi sign, emojis): 70 / 67.
 */
export function estimateSmsUnits(text: string): number {
  const len = text.length;
  if (len === 0) return 0;
  if (isGsm7(text)) return len <= 160 ? 1 : Math.ceil(len / 153);
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

/** Member code generator handled in seed/api with counters. */
export function formatMemberCode(seq: number): string {
  return `PYC-${String(seq).padStart(4, '0')}`;
}
