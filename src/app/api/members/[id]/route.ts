import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { validatePhoneGhana } from '@/lib/sms/phone';

async function getMember(req: NextRequest, id: string) {
  const member = await db.member.findUnique({ where: { id }, include: { group: true } });
  if (!member) throw Object.assign(new Error('Member not found.'), { status: 404 });
  return member;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePerm(req, 'members.view');
    const { id } = await params;
    const member = await db.member.findUnique({
      where: { id },
      include: { group: true, duesRecords: { orderBy: { dueDate: 'desc' } } },
    });
    if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    const smsCount = await db.smsMessage.count({ where: { recipientMemberId: id } });
    return NextResponse.json({ member, smsCount });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'members.edit');
    const { id } = await params;
    const existing = await getMember(req, id);
    const body = await req.json();
    const allowedFields = ['firstName', 'lastName', 'middleName', 'altPhone', 'email', 'dateOfBirth', 'gender', 'category', 'groupId', 'dateJoined', 'smsPermission', 'address', 'notes', 'status'] as const;
    const data: Record<string, unknown> = {};

    for (const f of allowedFields) {
      if (f in body) data[f] = body[f] === '' ? null : body[f];
    }
    if (data.groupId === '') data.groupId = null;
    if ('smsPermission' in body) data.smsPermission = !!body.smsPermission;
    if (body.phone !== undefined && body.phone !== existing.phone) {
      const phoneCheck = validatePhoneGhana(String(body.phone || ''));
      if (!phoneCheck.ok) return NextResponse.json({ error: phoneCheck.error }, { status: 400 });
      const dup = await db.member.findFirst({ where: { phone: phoneCheck.normalized!, id: { not: id } } });
      if (dup) return NextResponse.json({ error: `Another member already uses this number: ${dup.memberCode}.` }, { status: 409 });
      data.phone = phoneCheck.normalized;
    }
    if (data.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.dateOfBirth))) {
      return NextResponse.json({ error: 'Date of birth must be YYYY-MM-DD.' }, { status: 400 });
    }
    const member = await db.member.update({ where: { id }, data: data as never });
    await recordAudit({
      userId: user.id, userName: user.username, action: 'MEMBER_UPDATED', module: 'MEMBERS',
      target: `${member.memberCode} — ${member.firstName} ${member.lastName}`,
      details: Object.keys(data).join(', '), ip: clientIp(req),
    });
    return NextResponse.json({ member });
  } catch (e) {
    return jsonError(e);
  }
}

/** Deactivate (soft delete) — production safety: never hard-delete member data. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'members.delete');
    const { id } = await params;
    const member = await getMember(req, id);
    const updated = await db.member.update({ where: { id }, data: { status: 'INACTIVE', smsPermission: false } });
    await recordAudit({
      userId: user.id, userName: user.username, action: 'MEMBER_DEACTIVATED', module: 'MEMBERS',
      target: `${member.memberCode} — ${member.firstName} ${member.lastName}`, ip: clientIp(req),
    });
    return NextResponse.json({ member: updated });
  } catch (e) {
    return jsonError(e);
  }
}
