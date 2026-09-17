import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonError } from '@/lib/auth';
import { buildVariableMap, resolveVariables, getClubData } from '@/lib/sms/variables';
import { estimateSmsUnits } from '@/lib/sms/phone';

/** POST /api/sms/preview — resolve a template/message against a sample or real member. */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const { templateId, message, memberId, contextType, contextId } = await req.json();

    let text = message || '';
    if (templateId) {
      const tpl = await db.smsTemplate.findUnique({ where: { id: templateId } });
      if (tpl) text = tpl.message;
    }

    // load context
    let member = null;
    if (memberId && memberId !== 'sample') {
      member = await db.member.findUnique({ where: { id: memberId } });
    } else if (!memberId) {
      member = await db.member.findFirst({ where: { status: 'ACTIVE', smsPermission: true }, orderBy: { memberCode: 'asc' } });
    }
    let event = null, meeting = null, dues = null;
    if (contextType === 'event' && contextId) event = await db.event.findUnique({ where: { id: contextId } });
    if (contextType === 'meeting' && contextId) meeting = await db.meeting.findUnique({ where: { id: contextId } });
    if (contextType === 'dues' && contextId) dues = await db.duesRecord.findUnique({ where: { id: contextId }, include: { member: true } });

    const map = await buildVariableMap({ member: member || undefined, event: event || undefined, meeting: meeting || undefined, dues: dues || undefined });
    const resolved = resolveVariables(text, map, 'preview');
    const club = await getClubData();

    return NextResponse.json({
      preview: resolved.text,
      unresolved: resolved.unresolved,
      sampleMember: member ? `${member.firstName} ${member.lastName} (${member.memberCode})` : club.name,
      units: estimateSmsUnits(resolved.text),
      chars: resolved.text.length,
    });
  } catch (e) {
    return jsonError(e);
  }
}
