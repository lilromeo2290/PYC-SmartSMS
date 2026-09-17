import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError } from '@/lib/auth';
import { getAccraNow } from '@/lib/timezone';

/** GET /api/sms/delivery — delivery report with filters. */
export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'sms.reports');
    const sp = req.nextUrl.searchParams;
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';
    const automationId = sp.get('automationId') || '';
    const type = sp.get('type') || '';

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (automationId) where.automationId = automationId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(`${from}T00:00:00.000Z`);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(`${to}T23:59:59.999Z`);
    }

    const [totalSent, delivered, pending, failed, queued] = await Promise.all([
      db.smsMessage.count({ where: where as never }),
      db.smsMessage.count({ where: { ...where, status: 'DELIVERED' } as never }),
      db.smsMessage.count({ where: { ...where, status: 'SENT' } as never }),
      db.smsMessage.count({ where: { ...where, status: 'FAILED' } as never }),
      db.smsMessage.count({ where: { ...where, status: 'QUEUED' } as never }),
    ]);

    const byType = await db.smsMessage.groupBy({
      by: ['type'],
      where: where as never,
      _count: { _all: true },
    });
    const byAutomation = await db.smsMessage.groupBy({
      by: ['automationName'],
      where: { ...where, type: 'AUTOMATED' } as never,
      _count: { _all: true },
    });

    const deliveredPct = totalSent > 0 ? Math.round((delivered / totalSent) * 1000) / 10 : 0;
    const failedPct = totalSent > 0 ? Math.round((failed / totalSent) * 1000) / 10 : 0;

    return NextResponse.json({
      totals: { totalSent, delivered, pending, failed, queued, deliveredPct, failedPct },
      byType: byType.map(t => ({ type: t.type, count: t._count._all })),
      byAutomation: byAutomation.map(a => ({ name: a.automationName || 'Unknown', count: a._count._all })),
      now: getAccraNow(),
    });
  } catch (e) {
    return jsonError(e);
  }
}
