import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { listVariables } from '@/lib/sms/variables';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'automation.view');
    const vars = await listVariables();
    return NextResponse.json({ variables: vars });
  } catch (e) {
    return jsonError(e);
  }
}

/** PATCH — update variable metadata / active state (variable catalog is DB-driven). */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'variables.manage');
    const { key, display, description, exampleValue, isActive } = await req.json();
    if (!key) return NextResponse.json({ error: 'Variable key is required.' }, { status: 400 });
    const existing = await db.smsVariable.findUnique({ where: { key } });
    const data = {
      display: display ?? existing?.display ?? key,
      description: description ?? existing?.description ?? '',
      exampleValue: exampleValue ?? existing?.exampleValue ?? '',
      isActive: isActive ?? existing?.isActive ?? true,
    };
    const variable = await db.smsVariable.upsert({
      where: { key },
      update: data,
      create: { key, ...data, source: existing?.source || 'system', sortOrder: 99 },
    });
    await recordAudit({ userId: user.id, userName: user.username, action: 'VARIABLE_UPDATED', module: 'SETTINGS', target: `{{${key}}}`, ip: clientIp(req) });
    return NextResponse.json({ variable });
  } catch (e) {
    return jsonError(e);
  }
}
