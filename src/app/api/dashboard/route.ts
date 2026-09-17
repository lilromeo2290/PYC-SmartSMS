import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, jsonError } from '@/lib/auth';
import { getAccraNow, birthdayMatches, addDays, formatDisplayDate } from '@/lib/timezone';
import { computeNextRuns } from '@/lib/automation/engine';
import { schedulerStatus } from '@/lib/automation/scheduler';

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const now = getAccraNow();

    const [
      totalMembers, activeMembers, smsTotal, smsDelivered, smsFailed,
      scheduledPending, autosActive, autosInactive, birthdaysTodayCount,
      todaySent,
    ] = await Promise.all([
      db.member.count(),
      db.member.count({ where: { status: 'ACTIVE' } }),
      db.smsMessage.count(),
      db.smsMessage.count({ where: { status: 'DELIVERED' } }),
      db.smsMessage.count({ where: { status: 'FAILED' } }),
      db.scheduledSms.count({ where: { status: 'PENDING' } }),
      db.automation.count({ where: { status: 'ACTIVE' } }),
      db.automation.count({ where: { status: 'INACTIVE' } }),
      0, // replaced below
      db.smsMessage.count({ where: { createdAt: { gte: new Date(`${now.dateStr}T00:00:00.000Z`) } } }),
    ]);

    // birthdays today / upcoming (Accra-based)
    const members = await db.member.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, memberCode: true, firstName: true, lastName: true, dateOfBirth: true, phone: true, smsPermission: true },
    });
    let birthdaysToday = 0;
    const upcomingBirthdays: { id: string; name: string; date: string; inDays: number; turningAge: number | null }[] = [];
    for (let i = 0; i <= 60; i++) {
      const d = addDays(now.dateStr, i);
      for (const m of members) {
        if (birthdayMatches(m.dateOfBirth, d)) {
          if (i === 0) birthdaysToday++;
          else if (upcomingBirthdays.length < 6) {
            const birthYear = parseInt(m.dateOfBirth.slice(0, 4));
            const age = d.slice(0, 4) && birthYear ? parseInt(d.slice(0, 4)) - birthYear : null;
            upcomingBirthdays.push({
              id: m.id, name: `${m.firstName} ${m.lastName}`, date: d, inDays: i, turningAge: age,
            });
          }
        }
      }
    }

    const upcomingMeetings = await db.meeting.findMany({
      where: { status: 'SCHEDULED', date: { gte: now.dateStr } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 5,
    });
    const upcomingEvents = await db.event.findMany({
      where: { status: 'SCHEDULED', date: { gte: now.dateStr } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 5,
    });

    const nextRuns = await computeNextRuns(6);
    const club = await db.clubInfo.findUnique({ where: { id: 'default' } });

    return NextResponse.json({
      now,
      club,
      cards: {
        totalMembers, activeMembers, birthdaysToday,
        smsTotal, smsDelivered, smsFailed,
        scheduledPending, autosActive, autosInactive, todaySent,
        deliveredPct: smsTotal > 0 ? Math.round((smsDelivered / smsTotal) * 1000) / 10 : 0,
      },
      upcomingBirthdays,
      upcomingMeetings,
      upcomingEvents,
      nextRuns,
      scheduler: schedulerStatus(),
    });
  } catch (e) {
    return jsonError(e);
  }
}
