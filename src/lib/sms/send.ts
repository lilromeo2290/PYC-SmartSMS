import { db } from '@/lib/db';
import { sendViaProvider } from './provider';

// ============ UNIFIED SMS SEND PIPELINE ============
// Every SMS — manual, group, scheduled, or automation-driven — flows through
// this single pipeline: create record → provider → status update → history.

// ============ SENDER IDENTITY GUARD ============
// The approved sender ID (PYC CLUB-HO) carries the club identity on every handset.
// Message text must never lead with an app/test identity such as "PYC SmartSMS test:"
// — strip it so every message reads as coming from Progressive Youth Club, Ho.
function enforceClubIdentity(message: string): string {
  return message.replace(/^\s*PYC[ \t]*SmartSMS[a-zA-Z ]{0,20}:\s*/i, '').trim();
}

export interface SendSmsInput {
  phone: string;
  message: string;
  recipientName: string;
  recipientMemberId?: string | null;
  type: 'MANUAL' | 'GROUP' | 'SCHEDULED' | 'AUTOMATED';
  automationId?: string | null;
  automationName?: string | null;
  scheduledSmsId?: string | null;
  templateId?: string | null;
  createdById?: string | null;
}

export interface SendSmsResult {
  messageId: string;
  status: 'SENT' | 'FAILED';
  providerRef?: string;
  error?: string;
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const message = enforceClubIdentity(input.message); // identity guard — see above
  const msg = await db.smsMessage.create({
    data: {
      recipientMemberId: input.recipientMemberId ?? null,
      recipientName: input.recipientName,
      phone: input.phone,
      message,
      type: input.type,
      automationId: input.automationId ?? null,
      automationName: input.automationName ?? null,
      scheduledSmsId: input.scheduledSmsId ?? null,
      templateId: input.templateId ?? null,
      status: 'QUEUED',
      createdById: input.createdById ?? null,
    },
  });

  try {
    const result = await sendViaProvider({ phone: input.phone, message });
    if (result.ok) {
      await db.smsMessage.update({
        where: { id: msg.id },
        data: {
          status: 'SENT',
          providerRef: result.ref ?? null,
          providerResponse: result.response ?? null,
          attempts: { increment: 1 },
          sentAt: new Date(),
        },
      });
      return { messageId: msg.id, status: 'SENT', providerRef: result.ref };
    } else {
      await db.smsMessage.update({
        where: { id: msg.id },
        data: {
          status: 'FAILED',
          error: result.error || 'Provider returned failure',
          providerResponse: result.response ?? null,
          attempts: { increment: 1 },
        },
      });
      return { messageId: msg.id, status: 'FAILED', error: result.error };
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : 'Unknown provider error';
    await db.smsMessage.update({
      where: { id: msg.id },
      data: { status: 'FAILED', error: errMsg, attempts: { increment: 1 } },
    });
    return { messageId: msg.id, status: 'FAILED', error: errMsg };
  }
}

/** Retry a failed message (max 3 attempts — no endless retry loops). */
export async function retryFailedMessage(messageId: string): Promise<SendSmsResult & { error2?: string }> {
  const msg = await db.smsMessage.findUnique({ where: { id: messageId } });
  if (!msg) return { messageId, status: 'FAILED', error: 'Message not found.' };
  if (msg.status === 'DELIVERED' || msg.status === 'SENT') {
    return { messageId, status: 'SENT', error: 'Message already sent — retry not needed.' };
  }
  if (msg.attempts >= 3) {
    return { messageId, status: 'FAILED', error: 'Maximum retry attempts (3) reached.' };
  }
  const result = await sendViaProvider({ phone: msg.phone, message: msg.message });
  if (result.ok) {
    await db.smsMessage.update({
      where: { id: messageId },
      data: {
        status: 'SENT',
        error: null,
        providerRef: result.ref ?? null,
        providerResponse: result.response ?? null,
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
    });
    return { messageId, status: 'SENT', providerRef: result.ref };
  }
  await db.smsMessage.update({
    where: { id: messageId },
    data: {
      error: result.error || 'Retry failed',
      providerResponse: result.response ?? null,
      attempts: { increment: 1 },
    },
  });
  return { messageId, status: 'FAILED', error: result.error };
}
