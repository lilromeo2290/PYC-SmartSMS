import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { computeNextRuns } from '@/lib/automation/engine';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'automation.view');
    const sp = req.nextUrl.searchParams;
    const type = sp.get('type') || '';
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    const automations = await db.automation.findMany({
      where: where as never,
      include: { template: true, group: true, meeting: true, event: true },
      orderBy: { createdAt: 'asc' },
    });
    const nextRuns = await computeNextRuns(8);
    return NextResponse.json({ automations, nextRuns });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'automation.create');
    const body = await req.json();
    const { name, type, triggerType, description, config, audienceType, groupId, memberIds, meetingId, eventId, templateId, status } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Automation name is required.' }, { status: 400 });
    if (!triggerType) return NextResponse.json({ error: 'Trigger type is required.' }, { status: 400 });

    const automation = await db.automation.create({
      data: {
        name: name.trim(), type: type || 'CUSTOM', triggerType,
        description: description?.trim() || null,
        config: JSON.stringify(config || {}),
        audienceType: audienceType || 'ALL_ACTIVE',
        groupId: groupId || null,
        memberIds: JSON.stringify(memberIds || []),
        meetingId: meetingId || null,
        eventId: eventId || null,
        templateId: templateId || null,
        status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      },
    });
    await recordAudit({ userId: user.id, userName: user.username, action: 'AUTOMATION_CREATED', module: 'AUTOMATION', target: automation.name, details: `trigger=${triggerType}`, ip: clientIp(req) });
    return NextResponse.json({ automation });
  } catch (e) {
    return jsonError(e);
  }
}
