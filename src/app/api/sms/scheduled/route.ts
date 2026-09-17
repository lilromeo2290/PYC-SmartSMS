import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { getAccraNow } from '@/lib/timezone';
import { estimateSmsUnits } from '@/lib/sms/phone';
import { validatePhoneGhana } from '@/lib/sms/phone';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'sms.schedule');
    const sp = req.nextUrl.searchParams;
    const status = sp.get('status') || '';
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const scheduled = await db.scheduledSms.findMany({ where: where as never, orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }], take: 200 });
    return NextResponse.json({ scheduled, now: getAccraNow() });
  } catch (e) {
    return jsonError(e);
  }
}

/** POST /api/sms/scheduled — schedule an SMS for a future Accra date/time. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'sms.schedule');
    const { name, audienceType, groupId, memberIds, phones, message, templateId, scheduledDate, scheduledTime } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(scheduledDate || ''))) {
      return NextResponse.json({ error: 'A valid scheduled date (YYYY-MM-DD) is required.' }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(String(scheduledTime || ''))) {
      return NextResponse.json({ error: 'A valid scheduled time (HH:MM, Ghana time) is required.' }, { status: 400 });
    }

    const memberIdsFinal: string[] = [];
    const phonesFinal: string[] = [];
    if (audienceType === 'ALL_ACTIVE') {
      const ms = await db.member.findMany({ where: { status: 'ACTIVE', smsPermission: true }, select: { id: true } });
      memberIdsFinal.push(...ms.map(m => m.id));
    } else if (audienceType === 'GROUP' && groupId) {
      const ms = await db.member.findMany({ where: { status: 'ACTIVE', smsPermission: true, groupId }, select: { id: true } });
      memberIdsFinal.push(...ms.map(m => m.id));
    } else if (audienceType === 'SELECTED' && Array.isArray(memberIds)) {
      const ms = await db.member.findMany({ where: { id: { in: memberIds }, status: 'ACTIVE', smsPermission: true }, select: { id: true } });
      memberIdsFinal.push(...ms.map(m => m.id));
    }
    for (const p of Array.isArray(phones) ? phones : []) {
      const check = validatePhoneGhana(String(p));
      if (check.ok) phonesFinal.push(check.normalized!);
    }
    if (memberIdsFinal.length + phonesFinal.length === 0) {
      return NextResponse.json({ error: 'No valid recipients (active members with SMS permission, or valid phone numbers).' }, { status: 400 });
    }

    const rec = await db.scheduledSms.create({
      data: {
        name: name?.trim() || `Scheduled SMS ${scheduledDate} ${scheduledTime}`,
        recipientMemberIds: JSON.stringify(memberIdsFinal),
        recipientPhones: JSON.stringify(phonesFinal),
        recipientCount: memberIdsFinal.length + phonesFinal.length,
        message, templateId: templateId || null,
        scheduledDate, scheduledTime, createdById: user.id,
      },
    });
    await recordAudit({
      userId: user.id, userName: user.username, action: 'SCHEDULED_SMS_CREATED', module: 'SMS',
      target: rec.name, details: `${rec.recipientCount} recipients at ${scheduledDate} ${scheduledTime} (Accra)`, ip: clientIp(req),
    });
    return NextResponse.json({ scheduled: rec, estimatedUnits: rec.recipientCount * estimateSmsUnits(message) });
  } catch (e) {
    return jsonError(e);
  }
}
