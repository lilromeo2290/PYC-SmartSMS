import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp, rateLimit } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { sendSms } from '@/lib/sms/send';
import { validatePhoneGhana, estimateSmsUnits } from '@/lib/sms/phone';
import { buildVariableMap, resolveVariables } from '@/lib/sms/variables';

/** POST /api/sms/send — individual SMS to a member or a raw phone number. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'sms.send');
    if (!rateLimit(`sms:${user.id}`, 60, 60_000)) {
      return NextResponse.json({ error: 'Rate limit exceeded — max 60 SMS per minute.' }, { status: 429 });
    }
    const { memberId, phone, message, templateId } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

    let finalPhone = '';
    let recipientName = 'External recipient';
    let recipientMemberId: string | null = null;

    if (memberId) {
      const member = await db.member.findUnique({ where: { id: memberId } });
      if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
      finalPhone = member.phone;
      recipientName = `${member.firstName} ${member.lastName}`.trim();
      recipientMemberId = member.id;
    } else {
      const check = validatePhoneGhana(String(phone || ''));
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      finalPhone = check.normalized!;
    }

    // variable resolution (member context when available)
    let finalMessage = message;
    if (message.includes('{{')) {
      const member = recipientMemberId
        ? await db.member.findUnique({ where: { id: recipientMemberId } })
        : null;
      const map = await buildVariableMap({ member: member || undefined });
      const resolved = resolveVariables(message, map, 'send');
      finalMessage = resolved.text;
    }

    const result = await sendSms({
      phone: finalPhone, message: finalMessage, recipientName, recipientMemberId,
      type: 'MANUAL', templateId: templateId || null, createdById: user.id,
    });
    if (templateId) await db.smsTemplate.update({ where: { id: templateId }, data: { usageCount: { increment: 1 } } }).catch(() => {});

    await recordAudit({
      userId: user.id, userName: user.username,
      action: 'SMS_SENT', module: 'SMS',
      target: `${recipientName} (${finalPhone})`,
      details: `type=MANUAL, units=${estimateSmsUnits(finalMessage)}, status=${result.status}${result.error ? `, error=${result.error}` : ''}`,
      status: result.status === 'SENT' ? 'SUCCESS' : 'FAILED',
      ip: clientIp(req),
    });

    return NextResponse.json({ result, message: finalMessage });
  } catch (e) {
    return jsonError(e);
  }
}
