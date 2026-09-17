import { NextRequest, NextResponse } from 'next/server';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { runAutomationManually } from '@/lib/automation/engine';

/** POST /api/automations/[id]/run — manual run (ignores time gate; dedupe applies
 *  unless {force:true}, which re-sends with a fresh execution key). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'automation.run');
    const { id } = await params;
    let force = false;
    try {
      const body = await req.json();
      force = !!body?.force;
    } catch { /* no body */ }
    const summary = await runAutomationManually(id, { force });
    return NextResponse.json({ summary, runBy: user.username, force });
  } catch (e) {
    return jsonError(e);
  }
}
