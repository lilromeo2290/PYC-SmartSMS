import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

/** POST /api/automations/[id]/toggle — ACTIVE ↔ INACTIVE. Inactive automations
 *  keep their configuration and history but never execute. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'automation.activate');
    const { id } = await params;
    const existing = await db.automation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Automation not found.' }, { status: 404 });
    const newStatus = existing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const automation = await db.automation.update({ where: { id }, data: { status: newStatus } });
    await recordAudit({
      userId: user.id, userName: user.username,
      action: newStatus === 'ACTIVE' ? 'AUTOMATION_ACTIVATED' : 'AUTOMATION_DEACTIVATED',
      module: 'AUTOMATION', target: automation.name, ip: clientIp(req),
    });
    return NextResponse.json({ automation });
  } catch (e) {
    return jsonError(e);
  }
}
