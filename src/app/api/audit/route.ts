import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'audit.view');
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(5, parseInt(sp.get('pageSize') || '30')));
    const moduleFilter = sp.get('module') || '';
    const q = sp.get('q')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (moduleFilter) where.module = moduleFilter;
    if (q) where.OR = [{ action: { contains: q } }, { userName: { contains: q } }, { target: { contains: q } }, { details: { contains: q } }];

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where: where as never }),
      db.auditLog.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const modules = await db.auditLog.findMany({ distinct: ['module'], select: { module: true } });
    return NextResponse.json({ logs, total, page, pageSize, modules: modules.map(m => m.module).sort() });
  } catch (e) {
    return jsonError(e);
  }
}
