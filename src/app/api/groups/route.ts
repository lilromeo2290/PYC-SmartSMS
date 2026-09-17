import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const groups = await db.memberGroup.findMany({
      include: { members: { where: { status: 'ACTIVE' }, select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ groups: groups.map(g => ({ ...g, memberCount: g.members.length, members: undefined })) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'groups.manage');
    const { name, description, color } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Group name is required.' }, { status: 400 });
    const exists = await db.memberGroup.findUnique({ where: { name: name.trim() } });
    if (exists) return NextResponse.json({ error: 'A group with this name already exists.' }, { status: 409 });
    const group = await db.memberGroup.create({
      data: { name: name.trim(), description: description?.trim() || null, color: color || '#059669' },
    });
    await recordAudit({ userId: user.id, userName: user.username, action: 'GROUP_CREATED', module: 'MEMBERS', target: group.name, ip: clientIp(req) });
    return NextResponse.json({ group });
  } catch (e) {
    return jsonError(e);
  }
}
