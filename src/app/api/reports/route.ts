import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePerm, jsonError } from '@/lib/auth';
import { birthdayMatches, addDays, getAccraNow } from '@/lib/timezone';

/** GET /api/reports?type=members|birthdays|meetings|events|sms_usage|sms_delivery|automations&from=&to= */
export async function GET(req: NextRequest) {
  try {
    await requirePerm(req, 'reports.view');
    const sp = req.nextUrl.searchParams;
    const type = sp.get('type') || 'members';
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';
    const now = getAccraNow();
    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) dateFilter.lte = new Date(`${to}T23:59:59.999Z`);

    let columns: { key: string; label: string }[] = [];
    let rows: Record<string, string | number | boolean>[] = [];

    if (type === 'members') {
      columns = [
        { key: 'memberCode', label: 'Member ID' }, { key: 'name', label: 'Full Name' },
        { key: 'phone', label: 'Phone' }, { key: 'gender', label: 'Gender' },
        { key: 'dateOfBirth', label: 'Date of Birth' }, { key: 'group', label: 'Group' },
        { key: 'category', label: 'Category' }, { key: 'dateJoined', label: 'Date Joined' },
        { key: 'status', label: 'Status' }, { key: 'smsPermission', label: 'SMS Permission' },
      ];
      const members = await db.member.findMany({ include: { group: true }, orderBy: { memberCode: 'asc' } });
      rows = members.map(m => ({
        memberCode: m.memberCode, name: `${m.firstName} ${m.middleName || ''} ${m.lastName}`.replace(/\s+/g, ' ').trim(),
        phone: m.phone, gender: m.gender || '', dateOfBirth: m.dateOfBirth,
        group: m.group?.name || '—', category: m.category, dateJoined: m.dateJoined || '',
        status: m.status, smsPermission: m.smsPermission ? 'Enabled' : 'Disabled',
      }));
    } else if (type === 'birthdays') {
      columns = [
        { key: 'memberCode', label: 'Member ID' }, { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' }, { key: 'dateOfBirth', label: 'Date of Birth' },
        { key: 'nextBirthday', label: 'Next Birthday' }, { key: 'inDays', label: 'In Days' },
        { key: 'smsPermission', label: 'SMS Permission' },
      ];
      const members = await db.member.findMany({ where: { status: 'ACTIVE' }, orderBy: { memberCode: 'asc' } });
      rows = members.map(m => {
        let next = null, inDays = null;
        for (let i = 0; i < 366; i++) {
          const d = addDays(now.dateStr, i);
          if (birthdayMatches(m.dateOfBirth, d)) { next = d; inDays = i; break; }
        }
        return {
          memberCode: m.memberCode, name: `${m.firstName} ${m.lastName}`, phone: m.phone,
          dateOfBirth: m.dateOfBirth, nextBirthday: next || '—', inDays: inDays ?? '—',
          smsPermission: m.smsPermission ? 'Enabled' : 'Disabled',
        };
      }).sort((a, b) => (a.inDays as number) - (b.inDays as number));
    } else if (type === 'meetings') {
      columns = [
        { key: 'name', label: 'Meeting' }, { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' }, { key: 'venue', label: 'Venue' },
        { key: 'organizer', label: 'Organizer' }, { key: 'status', label: 'Status' },
      ];
      const meetings = await db.meeting.findMany({ orderBy: [{ date: 'asc' }] });
      rows = meetings.map(m => ({ name: m.name, date: m.date, time: `${m.startTime}${m.endTime ? '-' + m.endTime : ''}`, venue: m.venue, organizer: m.organizer || '', status: m.status }));
    } else if (type === 'events') {
      columns = [
        { key: 'name', label: 'Event' }, { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' }, { key: 'venue', label: 'Venue' },
        { key: 'type', label: 'Type' }, { key: 'organizer', label: 'Organizer' }, { key: 'status', label: 'Status' },
      ];
      const events = await db.event.findMany({ orderBy: [{ date: 'asc' }] });
      rows = events.map(e => ({ name: e.name, date: e.date, time: `${e.startTime}${e.endTime ? '-' + e.endTime : ''}`, venue: e.venue, type: e.eventType || '', organizer: e.organizer || '', status: e.status }));
    } else if (type === 'sms_usage') {
      columns = [
        { key: 'date', label: 'Date' }, { key: 'type', label: 'Type' },
        { key: 'count', label: 'Messages' }, { key: 'failed', label: 'Failed' },
      ];
      const msgs = await db.smsMessage.findMany({
        where: Object.keys(dateFilter).length ? { createdAt: dateFilter as never } : {},
        select: { createdAt: true, type: true, status: true },
      });
      const grouped = new Map<string, { count: number; failed: number }>();
      for (const m of msgs) {
        const d = m.createdAt.toISOString().slice(0, 10);
        const k = `${d}|${m.type}`;
        const cur = grouped.get(k) || { count: 0, failed: 0 };
        cur.count++;
        if (m.status === 'FAILED') cur.failed++;
        grouped.set(k, cur);
      }
      rows = [...grouped.entries()].map(([k, v]) => {
        const [date, typ] = k.split('|');
        return { date, type: typ, count: v.count, failed: v.failed };
      }).sort((a, b) => b.date.localeCompare(a.date));
    } else if (type === 'sms_delivery') {
      columns = [
        { key: 'recipient', label: 'Recipient' }, { key: 'phone', label: 'Phone' },
        { key: 'type', label: 'Type' }, { key: 'automation', label: 'Automation' },
        { key: 'status', label: 'Status' }, { key: 'sentAt', label: 'Sent At' },
        { key: 'deliveredAt', label: 'Delivered At' }, { key: 'error', label: 'Error' },
      ];
      const msgs = await db.smsMessage.findMany({
        where: Object.keys(dateFilter).length ? { createdAt: dateFilter as never } : {},
        orderBy: { createdAt: 'desc' }, take: 1000,
      });
      rows = msgs.map(m => ({
        recipient: m.recipientName, phone: m.phone, type: m.type,
        automation: m.automationName || '', status: m.status,
        sentAt: m.sentAt ? m.sentAt.toISOString().slice(0, 16).replace('T', ' ') : '',
        deliveredAt: m.deliveredAt ? m.deliveredAt.toISOString().slice(0, 16).replace('T', ' ') : '',
        error: m.error || '',
      }));
    } else if (type === 'automations') {
      columns = [
        { key: 'name', label: 'Automation' }, { key: 'trigger', label: 'Trigger' },
        { key: 'status', label: 'Status' }, { key: 'lastRun', label: 'Last Run' },
        { key: 'executions', label: 'Executions' }, { key: 'sent', label: 'Sent' },
        { key: 'failed', label: 'Failed' }, { key: 'skipped', label: 'Skipped' },
      ];
      const autos = await db.automation.findMany({ include: { _count: { select: { executions: true } } } });
      rows = [];
      for (const a of autos) {
        const [sent, failed, skipped] = await Promise.all([
          db.automationExecution.count({ where: { automationId: a.id, status: 'SENT' } }),
          db.automationExecution.count({ where: { automationId: a.id, status: 'FAILED' } }),
          db.automationExecution.count({ where: { automationId: a.id, status: 'SKIPPED' } }),
        ]);
        rows.push({
          name: a.name, trigger: a.triggerType, status: a.status,
          lastRun: a.lastRunAt ? a.lastRunAt.toISOString().slice(0, 16).replace('T', ' ') : '—',
          executions: a._count.executions, sent, failed, skipped,
        });
      }
    }
    return NextResponse.json({ type, columns, rows, generatedAt: new Date().toISOString() });
  } catch (e) {
    return jsonError(e);
  }
}
