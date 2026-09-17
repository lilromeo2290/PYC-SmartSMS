import { NextRequest, NextResponse } from 'next/server';
import { requirePerm, jsonError } from '@/lib/auth';
import { schedulerStatus } from '@/lib/automation/scheduler';
import { runEngineTick } from '@/lib/automation/engine';
import { getAccraNow } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'automation.view');
    return NextResponse.json({ scheduler: schedulerStatus(), now: getAccraNow() });
  } catch (e) {
    return jsonError(e);
  }
}

/** POST — manually trigger an engine tick (admin debugging aid). */
export async function POST(req: NextRequest) {
  try {
    await requirePerm(req, 'automation.run');
    const result = await runEngineTick();
    return NextResponse.json({ result, scheduler: schedulerStatus() });
  } catch (e) {
    return jsonError(e);
  }
}
