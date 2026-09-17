import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'dues.manage');
    const { id } = await params;
    const { amount, currency, dueDate, period, paymentStatus, reminderDate, notes } = await req.json();
    const data: Record<string, unknown> = {};
    if (amount !== undefined) {
      const amt = parseFloat(String(amount));
      if (isNaN(amt) || amt <= 0) return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
      data.amount = amt;
    }
    for (const f of ['currency', 'dueDate', 'period', 'paymentStatus', 'reminderDate', 'notes']) {
      if (f in ({})) continue;
    }
    if (currency !== undefined) data.currency = currency;
    if (dueDate !== undefined) data.dueDate = dueDate;
    if (period !== undefined) data.period = period || null;
    if (paymentStatus !== undefined) data.paymentStatus = paymentStatus;
    if (reminderDate !== undefined) data.reminderDate = reminderDate || null;
    if (notes !== undefined) data.notes = notes || null;
    const dues = await db.duesRecord.update({ where: { id }, data: data as never });
    await recordAudit({ userId: user.id, userName: user.username, action: 'DUES_UPDATED', module: 'AUTOMATION', target: `Dues ${id.slice(-6)}`, details: Object.keys(data).join(','), ip: clientIp(req) });
    return NextResponse.json({ dues });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'dues.manage');
    const { id } = await params;
    await db.duesRecord.delete({ where: { id } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'DUES_DELETED', module: 'AUTOMATION', target: `Dues ${id.slice(-6)}`, ip: clientIp(req) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
