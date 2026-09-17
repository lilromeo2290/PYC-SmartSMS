import { NextRequest, NextResponse } from 'next/server';
import { requireUser, jsonError } from '@/lib/auth';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';

// ============ SMS WALLET BALANCE (live from BMS Africa) ============
// GET /api/sms/balance — proxies the gateway's wallet balance for the
// dashboard. The API key stays server-side and is never exposed; responses
// are cached for 60s so dashboard refreshes don't hammer the gateway.

interface BalancePayload {
  supported: boolean;
  balance?: number;
  bonus?: number;
  wallet?: string;
  expiresAt?: string;
  fetchedAt?: string;
  error?: string;
}

const TTL_MS = 60_000;
let cache: { data: BalancePayload; at: number } | null = null;

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);

    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json(cache.data);
    }

    const cfg = await db.smsProviderConfig.findUnique({ where: { id: 'default' } });
    if (!cfg || cfg.providerType !== 'bms' || !cfg.apiKeyEnc) {
      // Simulator or generic gateway — balance display not applicable.
      return NextResponse.json({ supported: false } satisfies BalancePayload);
    }

    const apiKey = decryptSecret(cfg.apiKeyEnc);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(
        `https://api.mnotify.com/api/balance/sms?key=${encodeURIComponent(apiKey)}`,
        { signal: controller.signal, cache: 'no-store' },
      );
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && String(j.status ?? '').toLowerCase() === 'success') {
        let expiresAt: string | undefined;
        try {
          expiresAt = (JSON.parse(cfg.extraConfig || '{}') as { creditExpiresAt?: string }).creditExpiresAt || undefined;
        } catch { /* malformed extras ignored */ }
        const payload: BalancePayload = {
          supported: true,
          balance: Number(j.balance ?? 0),
          bonus: Number(j.bonus ?? 0),
          wallet: String(j.wallet ?? '0'),
          expiresAt,
          fetchedAt: new Date().toISOString(),
        };
        cache = { data: payload, at: Date.now() };
        return NextResponse.json(payload);
      }
      return NextResponse.json({
        supported: true,
        error: 'Gateway returned an unexpected response.',
      } satisfies BalancePayload);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return jsonError(e);
  }
}
