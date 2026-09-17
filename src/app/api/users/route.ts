import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, hashPassword, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { ROLES } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'users.manage');
    const users = await db.user.findMany({
      select: { id: true, username: true, email: true, fullName: true, phone: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, extraPermissions: true, deniedPermissions: true },
      orderBy: { username: 'asc' },
    });
    return NextResponse.json({ users: users.map(u => ({ ...u, extraPermissions: JSON.parse(u.extraPermissions || '[]'), deniedPermissions: JSON.parse(u.deniedPermissions || '[]') })) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePerm(req, 'users.manage');
    const { username, email, fullName, phone, role, password } = await req.json();
    if (!username?.trim() || !fullName?.trim() || !password) {
      return NextResponse.json({ error: 'Username, full name and password are required.' }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    if (!(ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
    const exists = await db.user.findUnique({ where: { username: username.trim() } });
    if (exists) return NextResponse.json({ error: 'Username already taken.' }, { status: 409 });
    const user = await db.user.create({
      data: {
        username: username.trim(), email: email?.trim() || null, fullName: fullName.trim(),
        phone: phone?.trim() || null, role,
        passwordHash: hashPassword(String(password)),
      },
    });
    await recordAudit({ userId: admin.id, userName: admin.username, action: 'USER_CREATED', module: 'USERS', target: `${user.username} (${role})`, ip: clientIp(req) });
    return NextResponse.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    return jsonError(e);
  }
}
