import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

/** PATCH — cancel a pending scheduled SMS. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'sms.schedule');
    const { id } = await params;
    const existing = await db.scheduledSms.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Scheduled SMS not found.' }, { status: 404 });
    if (existing.status !== 'PENDING') {
      return NextResponse.json({ error: `Cannot cancel — status is ${existing.status}.` }, { status: 400 });
    }
    const rec = await db.scheduledSms.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'SCHEDULED_SMS_CANCELLED', module: 'SMS', target: rec.name, ip: clientIp(req) });
    return NextResponse.json({ scheduled: rec });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'sms.schedule');
    const { id } = await params;
    const existing = await db.scheduledSms.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (existing.status === 'PENDING') {
      await db.scheduledSms.update({ where: { id }, data: { status: 'CANCELLED' } });
    } else {
      await db.scheduledSms.delete({ where: { id } });
    }
    await recordAudit({ userId: user.id, userName: user.username, action: 'SCHEDULED_SMS_DELETED', module: 'SMS', target: existing.name, ip: clientIp(req) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
