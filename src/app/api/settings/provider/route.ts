import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { encryptSecret } from '@/lib/crypto';
import { getProviderSummary } from '@/lib/sms/provider';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'settings.sms');
    const summary = await getProviderSummary();
    return NextResponse.json({ provider: summary });
  } catch (e) {
    return jsonError(e);
  }
}

/** PATCH — update provider config. Secrets are encrypted at rest and NEVER returned to the client. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'settings.sms');
    const body = await req.json();
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (body.providerType !== undefined) {
      const t = String(body.providerType);
      data.providerType = t === 'bms' || t === 'generic_http' ? t : 'simulator';
      if (t === 'bms' && body.name === undefined) data.name = 'BMS Africa (mNotify)';
    }
    if (body.name !== undefined) data.name = body.name;
    if (body.apiUrl !== undefined) data.apiUrl = body.apiUrl || null;
    if (body.apiMethod !== undefined) data.apiMethod = body.apiMethod === 'POST' ? 'POST' : 'GET';
    if (body.senderId !== undefined) data.senderId = body.senderId || null;
    if (body.username !== undefined) data.username = body.username || null;
    if (body.paramTpl !== undefined) data.paramTpl = body.paramTpl || null;
    if (body.apiKey) data.apiKeyEnc = encryptSecret(String(body.apiKey)); // write-only
    if (body.password) data.passwordEnc = encryptSecret(String(body.password)); // write-only
    if (body.creditExpiresAt !== undefined) {
      // non-secret metadata lives in extraConfig JSON (no schema migration needed)
      const existing = await db.smsProviderConfig.findUnique({ where: { id: 'default' } });
      let extras: Record<string, unknown> = {};
      try { extras = JSON.parse(existing?.extraConfig || '{}') as Record<string, unknown>; } catch { /* reset extras */ }
      const v = String(body.creditExpiresAt || '').trim();
      if (v) extras.creditExpiresAt = v; else delete extras.creditExpiresAt;
      data.extraConfig = JSON.stringify(extras);
    }

    const provider = await db.smsProviderConfig.upsert({
      where: { id: 'default' },
      update: data as never,
      create: { id: 'default', ...(data as object) },
    });
    await recordAudit({
      userId: user.id, userName: user.username, action: 'SMS_PROVIDER_UPDATED', module: 'SETTINGS',
      target: provider.providerType, details: `fields: ${Object.keys(data).filter(k => k !== 'updatedAt').join(', ')}`,
      ip: clientIp(req),
    });
    const summary = await getProviderSummary();
    return NextResponse.json({ provider: summary });
  } catch (e) {
    return jsonError(e);
  }
}
