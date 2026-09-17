import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'groups.manage');
    const { id } = await params;
    const { name, description, color, isActive } = await req.json();
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = description || null;
    if (color !== undefined) data.color = color;
    if (isActive !== undefined) data.isActive = !!isActive;
    const group = await db.memberGroup.update({ where: { id }, data: data as never });
    await recordAudit({ userId: user.id, userName: user.username, action: 'GROUP_UPDATED', module: 'MEMBERS', target: group.name, details: Object.keys(data).join(','), ip: clientIp(req) });
    return NextResponse.json({ group });
  } catch (e) {
    return jsonError(e);
  }
}

/** Deactivate group (soft) — keeps historical references intact. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'groups.manage');
    const { id } = await params;
    const group = await db.memberGroup.update({ where: { id }, data: { isActive: false } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'GROUP_DEACTIVATED', module: 'MEMBERS', target: group.name, ip: clientIp(req) });
    return NextResponse.json({ group });
  } catch (e) {
    return jsonError(e);
  }
}
