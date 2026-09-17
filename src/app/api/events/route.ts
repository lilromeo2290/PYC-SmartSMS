import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const sp = req.nextUrl.searchParams;
    const status = sp.get('status') || '';
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const events = await db.event.findMany({
      where: where as never,
      include: { targetGroup: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 300,
    });
    return NextResponse.json({ events });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'events.manage');
    const body = await req.json();
    const { name, date, startTime, endTime, venue, description, eventType, organizer, targetGroupId } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Event name is required.' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return NextResponse.json({ error: 'A valid event date is required.' }, { status: 400 });
    if (!venue?.trim()) return NextResponse.json({ error: 'Venue is required.' }, { status: 400 });
    const event = await db.event.create({
      data: {
        name: name.trim(), date, startTime: startTime || '00:00', endTime: endTime || null,
        venue: venue.trim(), description: description?.trim() || null,
        eventType: eventType || null, organizer: organizer?.trim() || null,
        targetGroupId: targetGroupId || null, createdById: user.id,
      },
    });
    await recordAudit({ userId: user.id, userName: user.username, action: 'EVENT_CREATED', module: 'EVENTS', target: `${event.name} — ${event.date}`, ip: clientIp(req) });
    return NextResponse.json({ event });
  } catch (e) {
    return jsonError(e);
  }
}
