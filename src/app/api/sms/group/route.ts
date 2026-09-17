import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { sendSms } from '@/lib/sms/send';
import { estimateSmsUnits } from '@/lib/sms/phone';
import { buildVariableMap, resolveVariables } from '@/lib/sms/variables';

/** POST /api/sms/group — send to a group / all active / selected members. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'sms.group');
    const { audienceType, groupId, memberIds, message, templateId, confirm } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    if (!confirm) return NextResponse.json({ error: 'Confirmation is required before sending group SMS.' }, { status: 400 });

    const where: Record<string, unknown> = { status: 'ACTIVE', smsPermission: true };
    if (audienceType === 'GROUP') {
      if (!groupId) return NextResponse.json({ error: 'Select a group.' }, { status: 400 });
      where.groupId = groupId;
    } else if (audienceType === 'SELECTED') {
      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        return NextResponse.json({ error: 'Select at least one member.' }, { status: 400 });
      }
      where.id = { in: memberIds };
    } else if (audienceType !== 'ALL_ACTIVE') {
      return NextResponse.json({ error: 'Invalid audience type.' }, { status: 400 });
    }

    const recipients = await db.member.findMany({
      where: where as never,
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: { memberCode: 'asc' },
    });
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients match this audience (active members with SMS permission enabled).' }, { status: 400 });
    }

    let sent = 0, failed = 0;
    const group = groupId ? await db.memberGroup.findUnique({ where: { id: groupId } }) : null;
    for (const m of recipients) {
      let finalMessage = message;
      if (message.includes('{{')) {
        const map = await buildVariableMap({ member: m });
        finalMessage = resolveVariables(message, map, 'send').text;
      }
      const r = await sendSms({
        phone: m.phone, message: finalMessage,
        recipientName: `${m.firstName} ${m.lastName}`.trim(), recipientMemberId: m.id,
        type: 'GROUP', templateId: templateId || null, createdById: user.id,
      });
      if (r.status === 'SENT') sent++; else failed++;
    }

    const label = audienceType === 'GROUP' ? (group?.name || 'Group') : audienceType === 'SELECTED' ? 'Selected members' : 'All active members';
    await recordAudit({
      userId: user.id, userName: user.username, action: 'GROUP_SMS_SENT', module: 'SMS',
      target: label, details: `recipients=${recipients.length}, sent=${sent}, failed=${failed}, units≈${sent * estimateSmsUnits(message)}`,
      status: sent > 0 ? 'SUCCESS' : 'FAILED', ip: clientIp(req),
    });
    return NextResponse.json({ total: recipients.length, sent, failed });
  } catch (e) {
    return jsonError(e);
  }
}

/** GET /api/sms/group?groupId= — preview recipient count + estimated units. */
export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'sms.group');
    const sp = req.nextUrl.searchParams;
    const audienceType = sp.get('audienceType') || 'ALL_ACTIVE';
    const groupId = sp.get('groupId');
    const memberIds = sp.get('memberIds')?.split(',').filter(Boolean) || [];
    const message = sp.get('message') || '';
    const where: Record<string, unknown> = { status: 'ACTIVE', smsPermission: true };
    if (audienceType === 'GROUP' && groupId) where.groupId = groupId;
    if (audienceType === 'SELECTED' && memberIds.length) where.id = { in: memberIds };
    const total = await db.member.count({ where: where as never });
    const units = message ? estimateSmsUnits(message) : 0;
    return NextResponse.json({ total, unitsPerMessage: units, estimatedUnits: total * units });
  } catch (e) {
    return jsonError(e);
  }
}
