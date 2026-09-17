import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'templates.edit');
    const { id } = await params;
    const { name, category, message, status } = await req.json();
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (category !== undefined) data.category = category;
    if (message !== undefined) data.message = message;
    if (status !== undefined) data.status = status;
    const template = await db.smsTemplate.update({ where: { id }, data: data as never });
    await recordAudit({ userId: user.id, userName: user.username, action: 'TEMPLATE_UPDATED', module: 'TEMPLATES', target: template.name, details: Object.keys(data).join(','), ip: clientIp(req) });
    return NextResponse.json({ template });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'templates.delete');
    const { id } = await params;
    // safety: check automation references
    const usedBy = await db.automation.count({ where: { templateId: id } });
    if (usedBy > 0) {
      return NextResponse.json({ error: `This template is used by ${usedBy} automation(s). Deactivate it instead, or remove it from the automations first.` }, { status: 409 });
    }
    const template = await db.smsTemplate.delete({ where: { id } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'TEMPLATE_DELETED', module: 'TEMPLATES', target: template.name, ip: clientIp(req) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
