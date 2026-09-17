// PYC SmartSMS — reconcile the 0249783736 trial record.
// The SMS actually reached the BMS gateway successfully during the sender-ID
// probe (gateway receipt below), but the system record said FAILED because the
// sender-ID rejection preceded approval. This updates the record to reflect
// the real successful send and adds an audit entry — no second SMS is sent.
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const MSG_ID = 'cmu5efoyt07proee9834bxpd0'; // failed record for +233249783736
const GATEWAY_RECEIPT = JSON.stringify({
  status: 'success',
  code: '2000',
  message: 'messages sent successfully',
  summary: {
    _id: '8F3CD1B4-DBBF-4CB8-BDFA-EBE9583B9A7F',
    message_id: '20260917233249783736V2',
    type: 'API QUICK SMS',
    total_sent: 1,
    contacts: 1,
    total_rejected: 0,
    numbers_sent: ['0249783736'],
    credit_used: 1,
    credit_left: 59,
    wallet_used: 0,
  },
});

const msg = await db.smsMessage.findUnique({ where: { id: MSG_ID } });
if (!msg) { console.error('record not found'); process.exit(1); }
console.log('before:', { status: msg.status, providerRef: msg.providerRef, attempts: msg.attempts });

const updated = await db.smsMessage.update({
  where: { id: MSG_ID },
  data: {
    status: 'SENT',
    providerRef: '20260917233249783736V2',
    providerResponse: GATEWAY_RECEIPT,
    error: null,
    sentAt: new Date(),
  },
});
console.log('after:', { status: updated.status, providerRef: updated.providerRef, sentAt: updated.sentAt });

await db.auditLog.create({
  data: {
    userId: 'cmu563ts20000oe7leixptb65',
    userName: 'admin',
    action: 'SMS_RECONCILED',
    module: 'SMS',
    target: 'External recipient (+233249783736)',
    details: 'Trial SMS reached BMS gateway during approved-sender probe (gateway msg_id 20260917233249783736V2, credit_used 1); record updated FAILED→SENT from gateway receipt. No duplicate SMS sent.',
    status: 'SUCCESS',
    ip: 'system-reconciliation',
  },
});
console.log('audit entry created');
await db.$disconnect();
