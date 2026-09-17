import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

/** POST /api/templates/[id]/duplicate */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, 'templates.create');
    const { id } = await params;
    const src = await db.smsTemplate.findUnique({ where: { id } });
    if (!src) return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    let name = `${src.name} (Copy)`;
    let n = 2;
    while (await db.smsTemplate.findUnique({ where: { name } })) {
      name = `${src.name} (Copy ${n++})`;
    }
    const template = await db.smsTemplate.create({
      data: { name, category: src.category, message: src.message, status: 'INACTIVE', createdById: user.id },
    });
    await recordAudit({ userId: user.id, userName: user.username, action: 'TEMPLATE_CREATED', module: 'TEMPLATES', target: `${template.name} (duplicated from ${src.name})`, ip: clientIp(req) });
    return NextResponse.json({ template });
  } catch (e) {
    return jsonError(e);
  }
}
