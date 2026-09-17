import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, requireUser, jsonError, clientIp, rateLimit } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { validatePhoneGhana } from '@/lib/sms/phone';

export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'members.view');
    const sp = req.nextUrl.searchParams;
    const q = sp.get('q')?.trim() || '';
    const status = sp.get('status') || '';
    const groupId = sp.get('groupId') || '';
    const smsPermission = sp.get('smsPermission') || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(200, Math.max(5, parseInt(sp.get('pageSize') || '20')));

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { firstName: { contains: q } }, { lastName: { contains: q } }, { middleName: { contains: q } },
        { memberCode: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } },
      ];
    }
    if (status) where.status = status;
    if (groupId) where.groupId = groupId;
    if (smsPermission === 'enabled') where.smsPermission = true;
    if (smsPermission === 'disabled') where.smsPermission = false;

    const [total, members] = await Promise.all([
      db.member.count({ where: where as never }),
      db.member.findMany({
        where: where as never,
        include: { group: true },
        orderBy: { memberCode: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return NextResponse.json({ members, total, page, pageSize });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'members.create');
    const body = await req.json();
    const { firstName, lastName, middleName, phone, altPhone, email, dateOfBirth, gender, category, groupId, dateJoined, smsPermission, address, notes } = body;

    if (!firstName?.trim() || !lastName?.trim()) {
      return NextResponse.json({ error: 'First name and last name are required.' }, { status: 400 });
    }
    const phoneCheck = validatePhoneGhana(String(phone || ''));
    if (!phoneCheck.ok) return NextResponse.json({ error: phoneCheck.error }, { status: 400 });

    const duplicate = await db.member.findFirst({ where: { phone: phoneCheck.normalized! } });
    if (duplicate) {
      return NextResponse.json({ error: `A member with this phone number already exists: ${duplicate.memberCode} (${duplicate.firstName} ${duplicate.lastName}).` }, { status: 409 });
    }
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return NextResponse.json({ error: 'Date of birth must be a valid date (YYYY-MM-DD).' }, { status: 400 });
    }

    const count = await db.member.count();
    const memberCode = `PYC-${String(count + 1).padStart(4, '0')}`;
    // ensure unique code
    const codeExists = await db.member.findUnique({ where: { memberCode } });
    const finalCode = codeExists ? `PYC-${String(count + 1 + Math.floor(Math.random() * 900)).padStart(4, '0')}` : memberCode;

    const member = await db.member.create({
      data: {
        memberCode: finalCode,
        firstName: String(firstName).trim(), lastName: String(lastName).trim(),
        middleName: middleName?.trim() || null,
        phone: phoneCheck.normalized!,
        altPhone: altPhone?.trim() || null,
        email: email?.trim() || null,
        dateOfBirth: dateOfBirth || '',
        gender: gender || null,
        category: category || 'GENERAL',
        groupId: groupId || null,
        dateJoined: dateJoined || null,
        smsPermission: smsPermission !== false,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
      },
    });
    await recordAudit({
      userId: user.id, userName: user.username, action: 'MEMBER_CREATED', module: 'MEMBERS',
      target: `${member.memberCode} — ${member.firstName} ${member.lastName}`, ip: clientIp(req),
    });
    return NextResponse.json({ member });
  } catch (e) {
    return jsonError(e);
  }
}
