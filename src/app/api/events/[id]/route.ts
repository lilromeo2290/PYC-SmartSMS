import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'events.manage');
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const f of ['name', 'date', 'startTime', 'endTime', 'venue', 'description', 'eventType', 'organizer', 'status']) {
      if (body[f] !== undefined) data[f] = body[f] === '' ? null : body[f];
    }
    if (body.targetGroupId !== undefined) data.targetGroupId = body.targetGroupId || null;
    const event = await db.event.update({ where: { id }, data: data as never });
    await recordAudit({ userId: user.id, userName: user.username, action: 'EVENT_UPDATED', module: 'EVENTS', target: `${event.name} — ${event.date}`, details: Object.keys(data).join(','), ip: clientIp(req) });
    return NextResponse.json({ event });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'events.manage');
    const { id } = await params;
    const event = await db.event.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'EVENT_CANCELLED', module: 'EVENTS', target: `${event.name} — ${event.date}`, ip: clientIp(req) });
    return NextResponse.json({ event });
  } catch (e) {
    return jsonError(e);
  }
}
