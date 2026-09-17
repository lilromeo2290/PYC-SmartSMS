import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError } from '@/lib/auth';
import { PERMISSIONS, ROLE_LABELS } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'users.manage');
    const [rolePerms, users] = await Promise.all([
      db.rolePermission.findMany(),
      db.user.findMany({ select: { id: true, username: true, extraPermissions: true, deniedPermissions: true } }),
    ]);
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const rp of rolePerms) {
      matrix[rp.role] = matrix[rp.role] || {};
      matrix[rp.role][rp.permissionKey] = rp.allowed;
    }
    const overrides: Record<string, { extra: string[]; denied: string[] }> = {};
    for (const u of users) {
      overrides[u.id] = {
        extra: JSON.parse(u.extraPermissions || '[]'),
        denied: JSON.parse(u.deniedPermissions || '[]'),
      };
    }
    return NextResponse.json({
      permissions: PERMISSIONS,
      roles: Object.keys(ROLE_LABELS),
      roleLabels: ROLE_LABELS,
      matrix,
      overrides,
    });
  } catch (e) {
    return jsonError(e);
  }
}

/** PATCH — update the role→permission matrix (database-driven authorization). */
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requirePerm(req, 'users.manage');
    const { role, permissionKey, allowed } = await req.json();
    if (!role || !permissionKey) return NextResponse.json({ error: 'role and permissionKey are required.' }, { status: 400 });
    await db.rolePermission.upsert({
      where: { role_permissionKey: { role, permissionKey } },
      update: { allowed: !!allowed },
      create: { role, permissionKey, allowed: !!allowed },
    });
    await recordAudit({ userId: admin.id, userName: admin.username, action: 'USER_PERMISSION_CHANGED', module: 'USERS', target: `${role}: ${permissionKey} = ${allowed}`, ip: null });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
