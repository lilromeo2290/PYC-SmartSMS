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
    for (const f of ['name', 'date', 'startTime', 'endTime', 'venue', 'description', 'organizer', 'status']) {
      if (body[f] !== undefined) data[f] = body[f] === '' ? null : body[f];
    }
    if (body.targetGroupId !== undefined) data.targetGroupId = body.targetGroupId || null;
    const meeting = await db.meeting.update({ where: { id }, data: data as never });
    await recordAudit({ userId: user.id, userName: user.username, action: 'MEETING_UPDATED', module: 'EVENTS', target: `${meeting.name} — ${meeting.date}`, details: Object.keys(data).join(','), ip: clientIp(req) });
    return NextResponse.json({ meeting });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'events.manage');
    const { id } = await params;
    const meeting = await db.meeting.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'MEETING_CANCELLED', module: 'EVENTS', target: `${meeting.name} — ${meeting.date}`, ip: clientIp(req) });
    return NextResponse.json({ meeting });
  } catch (e) {
    return jsonError(e);
  }
}
