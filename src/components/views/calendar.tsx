'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PageHeader, Spinner } from '@/components/shared';
import { api, fmtDateLong } from '@/lib/ui/client';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Cake, CalendarDays, PartyPopper, Mail } from 'lucide-react';

interface CalendarItem { kind: string; date: string; title: string; detail: string; id: string; time?: string }

const KIND_STYLE: Record<string, { dot: string; chip: string }> = {
  birthday: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  meeting: { dot: 'bg-primary', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  event: { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-800 border-violet-200' },
  sms: { dot: 'bg-teal-500', chip: 'bg-teal-50 text-teal-800 border-teal-200' },
};

export function CalendarView() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CalendarItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ items: CalendarItem[] }>(`/api/calendar?month=${month}`);
      setItems(d.items);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  const [year, mon] = month.split('-').map(Number);
  const firstDow = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const monthLabel = new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const byDay = new Map<number, CalendarItem[]>();
  for (const it of items) {
    const day = parseInt(it.date.slice(8));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(it);
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Birthdays · Meetings · Events · Scheduled SMS — all in Ghana time"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="font-semibold text-slate-700 min-w-36 text-center">{monthLabel}</span>
            <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {[
          { k: 'birthday', label: 'Birthday', icon: <Cake className="h-3.5 w-3.5" /> },
          { k: 'meeting', label: 'Meeting', icon: <CalendarDays className="h-3.5 w-3.5" /> },
          { k: 'event', label: 'Event', icon: <PartyPopper className="h-3.5 w-3.5" /> },
          { k: 'sms', label: 'Scheduled SMS', icon: <Mail className="h-3.5 w-3.5" /> },
        ].map(l => (
          <span key={l.k} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-full ${KIND_STYLE[l.k].dot}`} /> {l.icon} {l.label}
          </span>
        ))}
      </div>
      <Card className="border-slate-200/80">
        <CardContent className="p-3 sm:p-4">
          {loading ? <Spinner /> : (
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-[10px] sm:text-xs font-semibold text-slate-400 uppercase py-1">{d}</div>
              ))}
              {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayItems = byDay.get(day) || [];
                const isToday = day === new Date().getDate() && month === new Date().toISOString().slice(0, 7);
                return (
                  <div key={day} className={`min-h-16 sm:min-h-24 rounded-lg border p-1 sm:p-1.5 ${isToday ? 'border-primary/60 bg-accent/60' : 'border-slate-100'}`}>
                    <p className={`text-[10px] sm:text-xs font-semibold ${isToday ? 'text-primary' : 'text-slate-400'}`}>{day}</p>
                    <div className="space-y-0.5 mt-0.5">
                      {dayItems.slice(0, 3).map((it, j) => (
                        <button key={j} onClick={() => setDetail(it)} className={`w-full text-left text-[9px] sm:text-[10px] leading-tight rounded border px-1 py-0.5 truncate hover:brightness-95 ${KIND_STYLE[it.kind].chip}`} title={it.title}>
                          {it.title}
                        </button>
                      ))}
                      {dayItems.length > 3 && <p className="text-[9px] text-slate-400 pl-1">+{dayItems.length - 3} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={v => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{detail?.title}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <p className="text-slate-600"><b>Date:</b> {fmtDateLong(detail.date)}{detail.time ? ` at ${detail.time}` : ''}</p>
              <p className="text-slate-600 rounded-lg bg-slate-50 border p-3">{detail.detail}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
