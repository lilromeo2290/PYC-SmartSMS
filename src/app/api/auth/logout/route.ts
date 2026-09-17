import { NextRequest, NextResponse } from 'next/server';
import { readSession, clearSessionCookie, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (session) {
    await recordAudit({ userId: session.userId, userName: session.username, action: 'LOGOUT', module: 'AUTH', target: session.username, ip: clientIp(req) });
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
