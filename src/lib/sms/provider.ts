import crypto from 'crypto';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';

// ============ SMS PROVIDER ABSTRACTION ============
// Three provider types are supported out of the box:
//  - simulator   : built-in deterministic simulator (for demos/testing, resolves delivery async)
//  - generic_http: any HTTP-based SMS gateway configured with a URL/param template
//  - bms         : BMS Africa (app.bms.africa / mNotify) REST API v2 — JSON POST /sms/quick
// Credentials are AES-256-GCM encrypted at rest and never exposed to the frontend.

export interface ProviderSendResult {
  ok: boolean;
  ref?: string;
  response?: string;
  error?: string;
  /** simulator: planned delivery outcome resolved by the scheduler tick */
  planned?: 'DELIVERED' | 'FAILED';
}

export interface ProviderSendInput {
  phone: string;
  message: string;
  senderId?: string;
}

function maskCreds(url: string): string {
  return url.replace(/(apikey|api_key|key|password|token)=([^&]+)/gi, '$1=***');
}

export async function sendViaProvider(input: ProviderSendInput): Promise<ProviderSendResult> {
  const cfg = await db.smsProviderConfig.findUnique({ where: { id: 'default' } });
  const type = cfg?.providerType || 'simulator';

  if (type === 'simulator') {
    return sendSimulator(input);
  }
  if (type === 'bms') {
    return sendBms(input, cfg);
  }
  return sendGenericHttp(input, cfg);
}

// ---------- Simulator ----------
// 96% of messages are planned DELIVERED, 4% FAILED (recipient unreachable) —
// the final status is applied by the scheduler ~20s after send, so delivery
// tracking is realistic in the demo environment.
function sendSimulator(input: ProviderSendInput): ProviderSendResult {
  const ref = `SIM-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const roll = crypto.randomInt(1, 101);
  const planned: 'DELIVERED' | 'FAILED' = roll <= 96 ? 'DELIVERED' : 'FAILED';
  const response = JSON.stringify({
    status: 'accepted',
    ref,
    planned,
    to: input.phone,
    from: input.senderId || 'PYC-CLUB',
    gateway: 'pyc-simulator',
    ts: new Date().toISOString(),
  });
  return { ok: true, ref, response, planned };
}

// ---------- BMS Africa (app.bms.africa — mNotify REST API v2) ----------
// POST https://api.mnotify.com/api/sms/quick?key=API_KEY
// JSON: { recipient: ["0241234567"], sender: "PYC-CLUB", message: "...", is_schedule: false, schedule_date: "" }
// Response JSON: { status, code, message, summary?, _id? } — code "1000" = success.
async function sendBms(input: ProviderSendInput, cfg: { apiKeyEnc: string | null; senderId: string | null } | null): Promise<ProviderSendResult> {
  const apiKey = decryptSecret(cfg?.apiKeyEnc);
  if (!apiKey) {
    return { ok: false, error: 'BMS Africa is not configured (missing API key). Add it in Settings → SMS Provider.' };
  }
  // BMS/mNotify expects local Ghana numbers (0XXXXXXXXX); our pipeline stores E.164 (+233XXXXXXXXX)
  const localPhone = input.phone.startsWith('+233') ? `0${input.phone.slice(4)}` : input.phone.replace(/^\+/, '');
  const sender = (cfg?.senderId || input.senderId || 'PYC-CLUB').slice(0, 11); // BMS: max 11 chars
  const payload = {
    recipient: [localPhone],
    sender,
    message: input.message,
    is_schedule: false,
    schedule_date: '',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch { /* non-JSON response kept below */ }
    const status = String(parsed.status ?? '').toLowerCase();
    const code = String(parsed.code ?? '');
    const message = String(parsed.message ?? text.slice(0, 200));
    const campaignId = parsed._id ? String(parsed._id) : undefined;

    if (res.ok && (status === 'success' || code === '1000')) {
      return {
        ok: true,
        ref: campaignId || `BMS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        response: `STATUS: ${res.status} | code: ${code} | ${message}`,
      };
    }
    return {
      ok: false,
      error: `BMS Africa error (HTTP ${res.status}, code ${code || 'n/a'}): ${message}`,
      response: `STATUS: ${res.status} | BODY: ${text.slice(0, 500)}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `BMS Africa request failed: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Generic HTTP gateway ----------
async function sendGenericHttp(input: ProviderSendInput, cfg: { apiUrl: string | null; apiMethod: string; paramTpl: string | null; apiKeyEnc: string | null; username: string | null; passwordEnc: string | null; senderId: string | null } | null): Promise<ProviderSendResult> {
  if (!cfg?.apiUrl) {
    return { ok: false, error: 'SMS provider is not configured (missing API URL).' };
  }
  const apiKey = decryptSecret(cfg.apiKeyEnc);
  const password = decryptSecret(cfg.passwordEnc);
  const sender = cfg.senderId || input.senderId || 'PYC-CLUB';

  let url = cfg.apiUrl;
  let body: string | undefined;
  let headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };

  const fill = (s: string) => (s || '')
    .replaceAll('{phone}', encodeURIComponent(input.phone))
    .replaceAll('{message}', encodeURIComponent(input.message))
    .replaceAll('{sender}', encodeURIComponent(sender))
    .replaceAll('{apikey}', encodeURIComponent(apiKey))
    .replaceAll('{username}', encodeURIComponent(cfg.username || ''))
    .replaceAll('{password}', encodeURIComponent(password));

  const tpl = cfg.paramTpl && cfg.paramTpl.trim()
    ? cfg.paramTpl.trim()
    : 'apikey={apikey}&sender={sender}&to={phone}&message={message}';

  if (cfg.apiMethod === 'POST') {
    body = fill(tpl);
    if (apiKey && !tpl.includes('{apikey}')) headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}${fill(tpl)}`;
    if (apiKey && !tpl.includes('{apikey}')) headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { method: cfg.apiMethod, headers, body, signal: controller.signal });
    const text = await res.text();
    const safeUrl = maskCreds(url);
    if (!res.ok) {
      return { ok: false, error: `Provider HTTP ${res.status}: ${text.slice(0, 300)}`, response: `URL: ${safeUrl} | STATUS: ${res.status} | BODY: ${text.slice(0, 500)}` };
    }
    // Heuristic: many gateways return an id/ref — accept 2xx as queued/accepted.
    const refMatch = text.match(/["']?(?:id|ref|message_id|msgid|messageId)["']?\s*[:=]\s*["']?([\w-]{4,})/i);
    return {
      ok: true,
      ref: refMatch ? refMatch[1] : `HTTP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      response: `URL: ${safeUrl} | STATUS: ${res.status} | BODY: ${text.slice(0, 500)}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Provider request failed: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** Active provider summary safe for the frontend (secrets masked). */
export async function getProviderSummary() {
  const cfg = await db.smsProviderConfig.findUnique({ where: { id: 'default' } });
  if (!cfg) return { providerType: 'simulator', name: 'Built-in Simulator', configured: true, hasApiKey: false, hasPassword: false };
  let creditExpiresAt = '';
  try {
    creditExpiresAt = (JSON.parse(cfg.extraConfig || '{}') as { creditExpiresAt?: string }).creditExpiresAt || '';
  } catch { /* malformed extras ignored */ }
  return {
    providerType: cfg.providerType,
    name: cfg.name,
    apiUrl: cfg.apiUrl || '',
    apiMethod: cfg.apiMethod,
    senderId: cfg.senderId || '',
    username: cfg.username || '',
    paramTpl: cfg.paramTpl || '',
    creditExpiresAt,
    hasApiKey: !!cfg.apiKeyEnc,
    hasPassword: !!cfg.passwordEnc,
    isActive: cfg.isActive,
    updatedAt: cfg.updatedAt,
  };
}
