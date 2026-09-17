import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError, clientIp } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { validatePhoneGhana } from '@/lib/sms/phone';

// ============ MEMBER IMPORT (CSV / Excel-exported CSV) ============
// Two-step: mode=preview validates & reports; mode=commit inserts valid rows only.
// Duplicates (in DB or within the file) are NEVER inserted automatically.

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some(f => f.trim() !== '')) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some(f => f.trim() !== '')) rows.push(cur);
  return rows;
}

interface MappedRow {
  row: number;
  firstName: string; lastName: string; middleName: string;
  phone: string; dateOfBirth: string; email: string; groupName: string;
  status: string; smsPermission: boolean;
  errors: string[]; duplicateOf?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePerm(req, 'members.import');
    const body = await req.json();
    const mode = body.mode === 'commit' ? 'commit' : 'preview';
    const csv = String(body.csv || '');
    if (!csv.trim()) return NextResponse.json({ error: 'CSV content is empty.' }, { status: 400 });

    const rows = parseCsv(csv);
    if (rows.length < 2) return NextResponse.json({ error: 'CSV must contain a header row and at least one data row.' }, { status: 400 });

    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = (names: string[]) => {
      for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
      return -1;
    };
    const iFirst = idx(['first name', 'firstname', 'first_name']);
    const iLast = idx(['last name', 'lastname', 'last_name']);
    const iMiddle = idx(['middle name', 'middlename', 'middle_name']);
    const iPhone = idx(['phone', 'phone number', 'phone_number', 'mobile']);
    const iDob = idx(['date of birth', 'dateofbirth', 'date_of_birth', 'dob', 'birthday']);
    const iEmail = idx(['email', 'e-mail']);
    const iGroup = idx(['group', 'group name', 'member group']);
    const iStatus = idx(['status', 'membership status']);
    const iSms = idx(['sms permission', 'sms', 'sms_permission']);

    if (iFirst < 0 || iLast < 0 || iPhone < 0) {
      return NextResponse.json({ error: 'CSV must include "First Name", "Last Name" and "Phone" columns (any common spelling).' }, { status: 400 });
    }

    const groups = await db.memberGroup.findMany();
    const groupByName = new Map(groups.map(g => [g.name.toLowerCase(), g.id]));
    const existingPhones = new Set((await db.member.findMany({ select: { phone: true } })).map(m => m.phone));
    const seenPhones = new Map<string, number>(); // phone -> row for in-file duplicates

    const mapped: MappedRow[] = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : '');
      const errors: string[] = [];
      const rawPhone = get(iPhone);
      const phoneCheck = validatePhoneGhana(rawPhone);
      if (!phoneCheck.ok) errors.push(phoneCheck.error || 'Invalid phone.');
      if (!get(iFirst)) errors.push('First name is required.');
      if (!get(iLast)) errors.push('Last name is required.');
      let dob = get(iDob);
      if (dob) {
        // accept DD/MM/YYYY or YYYY-MM-DD
        const dmy = dob.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (dmy) dob = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) errors.push(`Invalid date of birth "${dob}".`);
      }
      const groupName = get(iGroup);
      const groupId = groupName ? (groupByName.get(groupName.toLowerCase()) || null) : null;
      if (groupName && !groupId) errors.push(`Group "${groupName}" does not exist (create it first).`);
      const statusRaw = (get(iStatus) || 'Active').toUpperCase();
      const status = ['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(statusRaw) ? statusRaw : 'ACTIVE';
      const smsRaw = get(iSms).toUpperCase();
      const smsPermission = smsRaw === '' ? true : !['NO', 'DISABLED', 'FALSE', '0', 'OFF'].includes(smsRaw);

      let duplicateOf: string | undefined;
      if (phoneCheck.ok) {
        if (existingPhones.has(phoneCheck.normalized!)) duplicateOf = 'existing member';
        else if (seenPhones.has(phoneCheck.normalized!)) duplicateOf = `row ${seenPhones.get(phoneCheck.normalized!)}`;
        else seenPhones.set(phoneCheck.normalized!, r);
      }

      mapped.push({
        row: r + 1,
        firstName: get(iFirst), lastName: get(iLast), middleName: get(iMiddle),
        phone: phoneCheck.normalized || rawPhone, dateOfBirth: dob, email: get(iEmail),
        groupName, status, smsPermission, errors, duplicateOf,
      });
    }

    const valid = mapped.filter(m => m.errors.length === 0 && !m.duplicateOf);
    const invalid = mapped.filter(m => m.errors.length > 0 || m.duplicateOf);

    if (mode === 'preview') {
      return NextResponse.json({
        mode, totalRows: mapped.length,
        validCount: valid.length, invalidCount: invalid.length,
        valid: valid.slice(0, 200), invalid: invalid.slice(0, 200),
      });
    }

    // commit
    const count = await db.member.count();
    let seq = count;
    let imported = 0;
    for (const v of valid) {
      seq++;
      await db.member.create({
        data: {
          memberCode: `PYC-${String(seq).padStart(4, '0')}`,
          firstName: v.firstName, lastName: v.lastName, middleName: v.middleName || null,
          phone: v.phone, dateOfBirth: v.dateOfBirth, email: v.email || null,
          groupId: v.groupName ? groupByName.get(v.groupName.toLowerCase()) || null : null,
          status: v.status, smsPermission: v.smsPermission,
        },
      });
      imported++;
    }
    await recordAudit({
      userId: user.id, userName: user.username, action: 'MEMBERS_IMPORTED', module: 'MEMBERS',
      target: 'Member Register', details: `imported=${imported}, skipped=${invalid.length} (duplicates/invalid)`, ip: clientIp(req),
    });
    return NextResponse.json({ mode, imported, skipped: invalid.length, totalRows: mapped.length });
  } catch (e) {
    return jsonError(e);
  }
}
