import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePerm(req, 'members.view');
    const { id } = await params;
    const members = await db.member.findMany({
      where: { groupId: id },
      include: { group: true },
      orderBy: { memberCode: 'asc' },
    });
    return NextResponse.json({ members });
  } catch (e) {
    return jsonError(e);
  }
}

/** Add members to group: { memberIds: [] } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'groups.manage');
    const { id } = await params;
    const { memberIds } = await req.json();
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one member.' }, { status: 400 });
    }
    const group = await db.memberGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    const res = await db.member.updateMany({ where: { id: { in: memberIds } }, data: { groupId: id } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'GROUP_MEMBERS_ADDED', module: 'MEMBERS', target: group.name, details: `${res.count} members added`, ip: clientIp(req) });
    return NextResponse.json({ added: res.count });
  } catch (e) {
    return jsonError(e);
  }
}

/** Remove members from group: { memberIds: [] } */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'groups.manage');
    const { id } = await params;
    const { memberIds } = await req.json();
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one member.' }, { status: 400 });
    }
    const group = await db.memberGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    const res = await db.member.updateMany({ where: { id: { in: memberIds }, groupId: id }, data: { groupId: null } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'GROUP_MEMBERS_REMOVED', module: 'MEMBERS', target: group.name, details: `${res.count} members removed`, ip: clientIp(req) });
    return NextResponse.json({ removed: res.count });
  } catch (e) {
    return jsonError(e);
  }
}
