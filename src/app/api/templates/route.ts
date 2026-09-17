import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'templates.view');
    const category = req.nextUrl.searchParams.get('category') || '';
    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    const templates = await db.smsTemplate.findMany({ where: where as never, orderBy: { name: 'asc' } });
    return NextResponse.json({ templates });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'templates.create');
    const { name, category, message, status } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Template name is required.' }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ error: 'Template message is required.' }, { status: 400 });
    const exists = await db.smsTemplate.findUnique({ where: { name: name.trim() } });
    if (exists) return NextResponse.json({ error: 'A template with this name already exists.' }, { status: 409 });
    const template = await db.smsTemplate.create({
      data: {
        name: name.trim(),
        category: category || 'GENERAL',
        message,
        status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        createdById: user.id,
      },
    });
    await recordAudit({ userId: user.id, userName: user.username, action: 'TEMPLATE_CREATED', module: 'TEMPLATES', target: template.name, ip: clientIp(req) });
    return NextResponse.json({ template });
  } catch (e) {
    return jsonError(e);
  }
}
