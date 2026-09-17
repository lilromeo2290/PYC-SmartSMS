import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkPassword, createToken, setSessionCookie, clientIp, rateLimit, jsonError } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`login:${ip}`, 10, 10 * 60_000)) {
      return NextResponse.json({ error: 'Too many login attempts. Try again in 10 minutes.' }, { status: 429 });
    }
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }
    const user = await db.user.findFirst({
      where: { OR: [{ username: String(username).trim() }, { email: String(username).trim().toLowerCase() }] },
    });
    if (!user || !user.isActive || !checkPassword(String(password), user.passwordHash)) {
      await recordAudit({
        userId: user?.id || null, userName: String(username || 'unknown'),
        action: 'LOGIN_FAILED', module: 'AUTH', target: String(username || ''), status: 'FAILED', ip,
      });
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }
    const token = createToken({ userId: user.id, username: user.username, role: user.role });
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordAudit({ userId: user.id, userName: user.username, action: 'LOGIN_SUCCESS', module: 'AUTH', target: user.username, ip });
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    return jsonError(e);
  }
}
