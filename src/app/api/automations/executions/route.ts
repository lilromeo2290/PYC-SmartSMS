import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'automation.view');
    const sp = req.nextUrl.searchParams;
    const automationId = sp.get('automationId') || '';
    const status = sp.get('status') || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(5, parseInt(sp.get('pageSize') || '25')));

    const where: Record<string, unknown> = {};
    if (automationId) where.automationId = automationId;
    if (status) where.status = status;

    const [total, executions] = await Promise.all([
      db.automationExecution.count({ where: where as never }),
      db.automationExecution.findMany({
        where: where as never,
        orderBy: { executedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return NextResponse.json({ executions, total, page, pageSize });
  } catch (e) {
    return jsonError(e);
  }
}
