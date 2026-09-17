import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'automation.view');
    const sp = req.nextUrl.searchParams;
    const status = sp.get('status') || '';
    const memberId = sp.get('memberId') || '';
    const where: Record<string, unknown> = {};
    if (status) where.paymentStatus = status;
    if (memberId) where.memberId = memberId;
    const dues = await db.duesRecord.findMany({
      where: where as never,
      include: { member: { select: { id: true, memberCode: true, firstName: true, lastName: true, phone: true, smsPermission: true, status: true } } },
      orderBy: { dueDate: 'desc' },
      take: 300,
    });
    return NextResponse.json({ dues });
  } catch (e) {
    return jsonError(e);
  }
}

/** POST — create a dues record for ONE member with its own amount (amounts are per-member). */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'dues.manage');
    const { memberId, amount, currency, dueDate, period, reminderDate, notes } = await req.json();
    if (!memberId) return NextResponse.json({ error: 'Select a member.' }, { status: 400 });
    const amt = parseFloat(String(amount));
    if (isNaN(amt) || amt <= 0) return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || ''))) return NextResponse.json({ error: 'A valid due date is required.' }, { status: 400 });
    const member = await db.member.findUnique({ where: { id: memberId } });
    if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    const dues = await db.duesRecord.create({
      data: {
        memberId, amount: amt, currency: currency || 'GHS', dueDate,
        period: period?.trim() || null, reminderDate: reminderDate || null, notes: notes?.trim() || null,
      },
    });
    await recordAudit({ userId: user.id, userName: user.username, action: 'DUES_CREATED', module: 'AUTOMATION', target: `${member.memberCode} ${member.firstName} ${member.lastName}`, details: `${currency || 'GHS'}${amt.toFixed(2)} due ${dueDate}`, ip: clientIp(req) });
    return NextResponse.json({ dues });
  } catch (e) {
    return jsonError(e);
  }
}
