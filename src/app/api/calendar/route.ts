import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonError } from '@/lib/auth';
import { getAccraNow } from '@/lib/timezone';

export interface CalendarItem {
  kind: 'birthday' | 'meeting' | 'event' | 'sms';
  date: string;
  title: string;
  detail: string;
  id: string;
  time?: string;
}

/** GET /api/calendar?month=YYYY-MM — birthdays, meetings, events, scheduled SMS. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const month = req.nextUrl.searchParams.get('month') || getAccraNow().dateStr.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    const prefix = month + '-';
    const monthNum = parseInt(month.slice(5, 7));
    const yearNum = parseInt(month.slice(0, 4));

    const [members, meetings, events, scheduled] = await Promise.all([
      db.member.findMany({ where: { status: 'ACTIVE' }, select: { id: true, memberCode: true, firstName: true, lastName: true, dateOfBirth: true } }),
      db.meeting.findMany({ where: { date: { startsWith: prefix } }, include: { targetGroup: true } }),
      db.event.findMany({ where: { date: { startsWith: prefix } }, include: { targetGroup: true } }),
      db.scheduledSms.findMany({ where: { scheduledDate: { startsWith: prefix }, status: 'PENDING' } }),
    ]);

    const items: CalendarItem[] = [];

    // birthdays (recurring every year)
    for (const m of members) {
      if (!m.dateOfBirth || m.dateOfBirth.length < 10) continue;
      const md = m.dateOfBirth.slice(5); // MM-DD
      const date = `${month.slice(0, 4)}-${md}`; // YYYY-MM-DD
      const d = new Date(`${date}T12:00:00Z`);
      if (isNaN(d.getTime()) || d.getUTCMonth() + 1 !== monthNum) continue;
      items.push({
        kind: 'birthday', date,
        title: `🎂 ${m.firstName} ${m.lastName}`,
        detail: `Birthday — ${m.memberCode} (born ${m.dateOfBirth}) — Birthday Wishes automation sends at 08:00`,
        id: m.id,
      });
    }
    for (const mt of meetings) {
      items.push({
        kind: 'meeting', date: mt.date, time: mt.startTime,
        title: `📅 ${mt.name}`,
        detail: `${mt.startTime}${mt.endTime ? '–' + mt.endTime : ''} @ ${mt.venue} — Organizer: ${mt.organizer || '—'}${mt.targetGroup ? ` — Group: ${mt.targetGroup.name}` : ''} — Status: ${mt.status}`,
        id: mt.id,
      });
    }
    for (const ev of events) {
      items.push({
        kind: 'event', date: ev.date, time: ev.startTime,
        title: `🎉 ${ev.name}`,
        detail: `${ev.startTime}${ev.endTime ? '–' + ev.endTime : ''} @ ${ev.venue} — Organizer: ${ev.organizer || '—'} — Status: ${ev.status}`,
        id: ev.id,
      });
    }
    for (const s of scheduled) {
      items.push({
        kind: 'sms', date: s.scheduledDate, time: s.scheduledTime,
        title: `✉️ Scheduled SMS (${s.recipientCount})`,
        detail: `${s.name} at ${s.scheduledTime} — "${s.message.slice(0, 80)}${s.message.length > 80 ? '…' : ''}"`,
        id: s.id,
      });
    }
    items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    void yearNum;
    return NextResponse.json({ month, items });
  } catch (e) {
    return jsonError(e);
  }
}
