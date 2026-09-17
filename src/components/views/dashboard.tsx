'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, StatCard, Spinner, EmptyState } from '@/components/shared';
import { api, fmtDate, fmtTime12, fmtDateTime, NextRun } from '@/lib/ui/client';
import { Users, UserCheck, Cake, CalendarDays, PartyPopper, Mail, MailCheck, MailX, Clock3, Bot, Activity, Cpu, Timer } from 'lucide-react';

interface BalanceData {
  supported: boolean;
  balance?: number;
  bonus?: number;
  wallet?: string;
  expiresAt?: string;
  fetchedAt?: string;
  error?: string;
}

interface DashboardData {
  now: { dateStr: string; timeStr: string; weekday: number };
  club: { name: string; shortName: string } | null;
  cards: {
    totalMembers: number; activeMembers: number; birthdaysToday: number;
    smsTotal: number; smsDelivered: number; smsFailed: number;
    scheduledPending: number; autosActive: number; autosInactive: number; todaySent: number;
    deliveredPct: number;
  };
  upcomingBirthdays: { id: string; name: string; date: string; inDays: number; turningAge: number | null }[];
  upcomingMeetings: { id: string; name: string; date: string; startTime: string; venue: string; targetGroup?: { name: string } | null }[];
  upcomingEvents: { id: string; name: string; date: string; startTime: string; venue: string }[];
  nextRuns: NextRun[];
  scheduler: { started: boolean; lastTick: string | null; tickCount: number; timezone: string };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DashboardView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api<DashboardData>('/api/dashboard').then(setData).catch(e => setError(e.message));
    const loadBalance = () => api<BalanceData>('/api/sms/balance').then(setBalance).catch(() => setBalance({ supported: false }));
    load();
    loadBalance();
    const t = setInterval(load, 60000);
    const tb = setInterval(loadBalance, 60000);
    return () => { clearInterval(t); clearInterval(tb); };
  }, []);

  if (error) return <EmptyState title="Could not load dashboard" hint={error} />;
  if (!data) return <Spinner label="Loading dashboard…" />;

  const { cards } = data;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="rounded-2xl bg-gradient-to-r from-[#14257F] via-[#1D34A8] to-[#2C46B8] text-white p-5 sm:p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold">{data.club?.name || 'Progressive Youth Club'}</h2>
            <p className="text-blue-100 text-sm mt-0.5">
              {WEEKDAYS[data.now.weekday]}, {fmtDate(data.now.dateStr)} · {fmtTime12(data.now.timeStr)} (Africa/Accra)
            </p>
          </div>
          <div className="flex items-center gap-4">
            {balance?.supported && (
              <div className="rounded-2xl bg-white/15 border border-white/30 backdrop-blur-sm px-5 py-3 text-center shadow-inner" title="Live SMS wallet balance from BMS Africa">
                {balance.error ? (
                  <p className="text-xs font-semibold text-blue-100 py-2">Balance unavailable</p>
                ) : (
                  <>
                    <p className="text-4xl sm:text-5xl font-extrabold leading-none text-white tabular-nums">{balance.balance ?? 0}</p>
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-blue-100 mt-1.5">SMS credits left</p>
                    {balance.expiresAt && (
                      <p className="text-xs sm:text-sm font-bold text-white border-t border-white/30 mt-2 pt-1.5 whitespace-nowrap">Expires {fmtDate(balance.expiresAt)}</p>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="flex sm:flex-col items-center sm:items-end gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ${data.scheduler.started ? 'bg-white/20 text-blue-50' : 'bg-rose-500/30 text-rose-50'}`}>
                <Cpu className="h-3.5 w-3.5" /> Automation engine {data.scheduler.started ? 'running' : 'stopped'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5">
                <Timer className="h-3.5 w-3.5" /> tick #{data.scheduler.tickCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard label="Total Members" value={cards.totalMembers} icon={<Users className="h-5 w-5" />} tone="default" sub={`${cards.activeMembers} active`} />
        <StatCard label="Active Members" value={cards.activeMembers} icon={<UserCheck className="h-5 w-5" />} tone="emerald" />
        <StatCard label="Birthdays Today" value={cards.birthdaysToday} icon={<Cake className="h-5 w-5" />} tone="amber" />
        <StatCard label="SMS Sent" value={cards.smsTotal} icon={<Mail className="h-5 w-5" />} tone="default" sub={`${cards.todaySent} today`} />
        <StatCard label="SMS Delivered" value={cards.smsDelivered} icon={<MailCheck className="h-5 w-5" />} tone="emerald" sub={`${cards.deliveredPct}% delivery rate`} />
        <StatCard label="SMS Failed" value={cards.smsFailed} icon={<MailX className="h-5 w-5" />} tone="rose" />
        <StatCard label="Scheduled SMS" value={cards.scheduledPending} icon={<Clock3 className="h-5 w-5" />} tone="amber" sub="pending" />
        <StatCard label="Automations Active" value={cards.autosActive} icon={<Bot className="h-5 w-5" />} tone="teal" sub={`${cards.autosInactive} inactive`} />
        <StatCard label="Upcoming Meetings" value={data.upcomingMeetings.length} icon={<CalendarDays className="h-5 w-5" />} tone="violet" />
        <StatCard label="Upcoming Events" value={data.upcomingEvents.length} icon={<PartyPopper className="h-5 w-5" />} tone="violet" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* NEXT AUTOMATIONS */}
        <Card className="xl:col-span-2 border-slate-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Next automations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.nextRuns.length === 0 && <EmptyState title="No upcoming automations" hint="Create meetings, events or custom automations to see the schedule." />}
            {data.nextRuns.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-xl">{r.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.kind} — {r.target}</p>
                  <p className="text-xs text-slate-500">{r.automationName} · {r.recipients} recipient{r.recipients !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-700">{r.inDays === 0 ? 'Today' : r.inDays === 1 ? 'Tomorrow' : fmtDate(r.dateStr)}</p>
                  <p className="text-xs text-slate-500">{fmtTime12(r.timeStr)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming birthdays */}
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Cake className="h-4 w-4 text-amber-500" /> Upcoming birthdays</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingBirthdays.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No birthdays in the next 60 days.</p>}
            {data.upcomingBirthdays.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{b.name}{b.turningAge ? <span className="text-slate-400 font-normal"> · turns {b.turningAge}</span> : ''}</p>
                  <p className="text-xs text-slate-500">{fmtDate(b.date)}</p>
                </div>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200" variant="outline">
                  {b.inDays === 0 ? 'Today' : b.inDays === 1 ? 'Tomorrow' : `${b.inDays} days`}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> Upcoming meetings</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingMeetings.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No scheduled meetings.</p>}
            {data.upcomingMeetings.map(m => (
              <button key={m.id} onClick={() => onNavigate('meetings')} className="w-full text-left flex items-center justify-between gap-3 rounded-lg border border-slate-100 hover:border-primary/30 hover:bg-accent/50 px-3 py-2 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                  <p className="text-xs text-slate-500 truncate">{m.venue}{m.targetGroup ? ` · ${m.targetGroup.name}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-slate-600">{fmtDate(m.date)}</p>
                  <p className="text-xs text-slate-400">{fmtTime12(m.startTime)}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><PartyPopper className="h-4 w-4 text-primary" /> Upcoming events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingEvents.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No scheduled events.</p>}
            {data.upcomingEvents.map(e => (
              <button key={e.id} onClick={() => onNavigate('events')} className="w-full text-left flex items-center justify-between gap-3 rounded-lg border border-slate-100 hover:border-primary/30 hover:bg-accent/50 px-3 py-2 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{e.name}</p>
                  <p className="text-xs text-slate-500 truncate">{e.venue}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-slate-600">{fmtDate(e.date)}</p>
                  <p className="text-xs text-slate-400">{fmtTime12(e.startTime)}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
