import { NextRequest, NextResponse } from 'next/server';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { retryFailedMessage } from '@/lib/sms/send';

/** POST /api/sms/retry — controlled retry of a failed message (max 3 attempts). */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'sms.send');
    const { messageId } = await req.json();
    if (!messageId) return NextResponse.json({ error: 'messageId is required.' }, { status: 400 });
    const result = await retryFailedMessage(String(messageId));
    await recordAudit({
      userId: user.id, userName: user.username, action: 'SMS_RETRY', module: 'SMS',
      target: messageId, details: `status=${result.status}${result.error ? `, ${result.error}` : ''}`,
      status: result.status === 'SENT' ? 'SUCCESS' : 'FAILED', ip: clientIp(req),
    });
    return NextResponse.json({ result });
  } catch (e) {
    return jsonError(e);
  }
}
