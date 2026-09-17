import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'settings.club');
    const club = await db.clubInfo.findUnique({ where: { id: 'default' } });
    return NextResponse.json({ club });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'settings.club');
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const f of ['name', 'shortName', 'phone', 'email', 'address', 'website', 'logoUrl', 'senderName']) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    const club = await db.clubInfo.upsert({
      where: { id: 'default' },
      update: data as never,
      create: { id: 'default', ...(data as object) },
    });
    await recordAudit({ userId: user.id, userName: user.username, action: 'CLUB_INFO_UPDATED', module: 'SETTINGS', target: club.name, details: Object.keys(data).join(','), ip: clientIp(req) });
    return NextResponse.json({ club });
  } catch (e) {
    return jsonError(e);
  }
}
