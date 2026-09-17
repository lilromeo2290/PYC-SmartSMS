import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, hashPassword, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { ROLES } from '@/lib/permissions';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePerm(req, 'users.manage');
    const { id } = await params;
    const { email, fullName, phone, role, isActive, password, extraPermissions, deniedPermissions } = await req.json();
    const data: Record<string, unknown> = {};
    if (email !== undefined) data.email = email || null;
    if (fullName !== undefined) data.fullName = fullName;
    if (phone !== undefined) data.phone = phone || null;
    if (role !== undefined) {
      if (!(ROLES as readonly string[]).includes(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
      data.role = role;
    }
    if (isActive !== undefined) data.isActive = !!isActive;
    if (password) {
      if (String(password).length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
      data.passwordHash = hashPassword(String(password));
    }
    if (extraPermissions !== undefined) data.extraPermissions = JSON.stringify(extraPermissions || []);
    if (deniedPermissions !== undefined) data.deniedPermissions = JSON.stringify(deniedPermissions || []);

    const target = await db.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    // safety: prevent locking yourself out
    if (target.id === admin.id && data.isActive === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 });
    }

    const user = await db.user.update({ where: { id }, data: data as never });
    await recordAudit({
      userId: admin.id, userName: admin.username,
      action: password ? 'USER_PASSWORD_CHANGED' : 'USER_PERMISSION_CHANGED',
      module: 'USERS', target: user.username,
      details: Object.keys(data).filter(k => k !== 'passwordHash').join(','),
      ip: clientIp(req),
    });
    return NextResponse.json({ user: { id: user.id, username: user.username, role: user.role, isActive: user.isActive } });
  } catch (e) {
    return jsonError(e);
  }
}
