import { NextRequest, NextResponse } from 'next/server';
import { requireUser, jsonError } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isSuperAdmin: user.role === 'SUPER_ADMIN',
        permissions: user.permissions,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
