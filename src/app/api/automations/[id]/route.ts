import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePerm(req, 'automation.view');
    const { id } = await params;
    const automation = await db.automation.findUnique({
      where: { id },
      include: { template: true, group: true, meeting: true, event: true },
    });
    if (!automation) return NextResponse.json({ error: 'Automation not found.' }, { status: 404 });
    const executions = await db.automationExecution.findMany({
      where: { automationId: id },
      orderBy: { executedAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ automation, executions });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'automation.edit');
    const { id } = await params;
    const existing = await db.automation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Automation not found.' }, { status: 404 });
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.description !== undefined) data.description = body.description || null;
    if (body.config !== undefined) data.config = JSON.stringify(body.config);
    if (body.audienceType !== undefined) data.audienceType = body.audienceType;
    if (body.groupId !== undefined) data.groupId = body.groupId || null;
    if (body.memberIds !== undefined) data.memberIds = JSON.stringify(body.memberIds || []);
    if (body.meetingId !== undefined) data.meetingId = body.meetingId || null;
    if (body.eventId !== undefined) data.eventId = body.eventId || null;
    if (body.templateId !== undefined) data.templateId = body.templateId || null;
    if (body.triggerType !== undefined) data.triggerType = body.triggerType;
    if (body.type !== undefined) data.type = body.type;
    const automation = await db.automation.update({ where: { id }, data: data as never });
    await recordAudit({ userId: user.id, userName: user.username, action: 'AUTOMATION_UPDATED', module: 'AUTOMATION', target: automation.name, details: Object.keys(data).join(','), ip: clientIp(req) });
    return NextResponse.json({ automation });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'automation.edit');
    const { id } = await params;
    const existing = await db.automation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    // Production safety: never delete execution history — deactivate instead.
    await db.automation.update({ where: { id }, data: { status: 'INACTIVE' } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'AUTOMATION_DEACTIVATED', module: 'AUTOMATION', target: existing.name, details: 'Delete requested → deactivated (history preserved)', ip: clientIp(req) });
    return NextResponse.json({ ok: true, note: 'Automation deactivated — execution history preserved.' });
  } catch (e) {
    return jsonError(e);
  }
}
