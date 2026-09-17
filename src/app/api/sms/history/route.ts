import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'sms.history');
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(5, parseInt(sp.get('pageSize') || '25')));
    const status = sp.get('status') || '';
    const type = sp.get('type') || '';
    const automationId = sp.get('automationId') || '';
    const groupId = sp.get('groupId') || '';
    const q = sp.get('q')?.trim() || '';
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (automationId) where.automationId = automationId;
    if (q) where.OR = [{ recipientName: { contains: q } }, { phone: { contains: q } }, { message: { contains: q } }];
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(`${from}T00:00:00.000Z`);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(`${to}T23:59:59.999Z`);
    }
    if (groupId) where.recipient = { groupId };

    const [total, messages] = await Promise.all([
      db.smsMessage.count({ where: where as never }),
      db.smsMessage.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return NextResponse.json({ messages, total, page, pageSize });
  } catch (e) {
    return jsonError(e);
  }
}
