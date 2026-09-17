'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge, PageHeader, EmptyState, Spinner } from '@/components/shared';
import { api, can, fmtDate, fmtTime12, CurrentUser, Meeting, ClubEvent, MemberGroup } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Plus, Pencil, CalendarDays, XCircle } from 'lucide-react';

// ============ MEETINGS ============

export function MeetingsView({ user }: { user: CurrentUser }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [form, setForm] = useState({ name: '', date: '', startTime: '16:00', endTime: '18:00', venue: '', description: '', organizer: '', targetGroupId: '', status: 'SCHEDULED' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, g] = await Promise.all([api<{ meetings: Meeting[] }>('/api/meetings'), api<{ groups: MemberGroup[] }>('/api/groups')]);
      setMeetings(m.meetings); setGroups(g.groups.filter(x => x.isActive));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await api(`/api/meetings/${editing.id}`, { method: 'PATCH', json: form });
      else await api('/api/meetings', { method: 'POST', json: form });
      toast.success(editing ? 'Meeting updated' : 'Meeting created — reminders fire automatically per the Meeting Reminder automation.');
      setOpen(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const cancelMeeting = async (m: Meeting) => {
    if (!confirm(`Cancel meeting "${m.name}"? No further reminders will be sent.`)) return;
    try { await api(`/api/meetings/${m.id}`, { method: 'DELETE' }); toast.success('Meeting cancelled'); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <PageHeader
        title="Meetings"
        subtitle="Scheduled meetings — meeting reminder automations trigger from these records"
        actions={can(user, 'events.manage') ? (
          <Button className="bg-primary hover:bg-primary/90" onClick={() => { setEditing(null); setForm({ name: '', date: '', startTime: '16:00', endTime: '18:00', venue: '', description: '', organizer: '', targetGroupId: '', status: 'SCHEDULED' }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Schedule Meeting
          </Button>
        ) : undefined}
      />
      {loading ? <Spinner /> : meetings.length === 0 ? <EmptyState title="No meetings" hint="Schedule your first meeting." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {meetings.map(m => (
            <Card key={m.id} className="border-slate-200/80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 text-center shrink-0">
                      <p className="text-[10px] font-bold text-primary uppercase">{fmtDate(m.date).split(' ')[1]}</p>
                      <p className="text-lg font-bold leading-none text-emerald-800">{m.date.slice(8)}</p>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800 truncate">{m.name}</h3>
                      <p className="text-xs text-slate-500">{fmtTime12(m.startTime)}{m.endTime ? ` – ${fmtTime12(m.endTime)}` : ''} · {m.venue}</p>
                    </div>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                {m.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{m.description}</p>}
                <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                  <span>Organizer: {m.organizer || '—'}{m.targetGroup ? ` · ${m.targetGroup.name}` : ''}</span>
                  {can(user, 'events.manage') && (
                    <span className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(m); setForm({ name: m.name, date: m.date, startTime: m.startTime, endTime: m.endTime || '', venue: m.venue, description: m.description || '', organizer: m.organizer || '', targetGroupId: m.targetGroupId || '', status: m.status }); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                      {m.status === 'SCHEDULED' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cancelMeeting(m)}><XCircle className="h-3 w-3 text-rose-500" /></Button>}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Meeting' : 'Schedule Meeting'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5 sm:col-span-2"><Label>Meeting Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. PYC Monthly General Meeting" /></div>
            <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Venue *</Label><Input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} placeholder="PYC Club House" /></div>
            <div className="space-y-1.5"><Label>Start Time *</Label><Input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>End Time</Label><Input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Organizer</Label><Input value={form.organizer} onChange={e => setForm({ ...form, organizer: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Target Group</Label>
              <Select value={form.targetGroupId || 'all'} onValueChange={v => setForm({ ...form, targetGroupId: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            {editing && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['SCHEDULED', 'COMPLETED', 'CANCELLED'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={busy || !form.name || !form.date || !form.venue}>{editing ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ EVENTS ============

const EVENT_TYPES = ['ANNIVERSARY', 'CONFERENCE', 'FUNDRAISER', 'OUTREACH', 'PROGRAM', 'SOCIAL'];

export function EventsView({ user }: { user: CurrentUser }) {
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClubEvent | null>(null);
  const [form, setForm] = useState({ name: '', date: '', startTime: '15:00', endTime: '20:00', venue: '', description: '', eventType: 'PROGRAM', organizer: '', targetGroupId: '', status: 'SCHEDULED' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, g] = await Promise.all([api<{ events: ClubEvent[] }>('/api/events'), api<{ groups: MemberGroup[] }>('/api/groups')]);
      setEvents(e.events); setGroups(g.groups.filter(x => x.isActive));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await api(`/api/events/${editing.id}`, { method: 'PATCH', json: form });
      else await api('/api/events', { method: 'POST', json: form });
      toast.success(editing ? 'Event updated' : 'Event created — event reminder automations fire automatically.');
      setOpen(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const cancelEvent = async (e: ClubEvent) => {
    if (!confirm(`Cancel event "${e.name}"?`)) return;
    try { await api(`/api/events/${e.id}`, { method: 'DELETE' }); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
  };

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Club events — anniversary, conferences, outreach, fundraising and more"
        actions={can(user, 'events.manage') ? (
          <Button className="bg-primary hover:bg-primary/90" onClick={() => { setEditing(null); setForm({ name: '', date: '', startTime: '15:00', endTime: '20:00', venue: '', description: '', eventType: 'PROGRAM', organizer: '', targetGroupId: '', status: 'SCHEDULED' }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Create Event
          </Button>
        ) : undefined}
      />
      {loading ? <Spinner /> : events.length === 0 ? <EmptyState title="No events" hint="Create your first event." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {events.map(e => (
            <Card key={e.id} className="border-slate-200/80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="rounded-xl bg-violet-50 border border-violet-100 px-2.5 py-1.5 text-center shrink-0">
                      <p className="text-[10px] font-bold text-violet-700 uppercase">{fmtDate(e.date).split(' ')[1]}</p>
                      <p className="text-lg font-bold leading-none text-violet-800">{e.date.slice(8)}</p>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800 truncate">{e.name}</h3>
                      <p className="text-xs text-slate-500">{fmtTime12(e.startTime)}{e.endTime ? ` – ${fmtTime12(e.endTime)}` : ''} · {e.venue}</p>
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
                {e.eventType && <p className="text-xs mt-2"><span className="rounded bg-violet-50 border border-violet-100 text-violet-700 px-1.5 py-0.5 font-medium">{e.eventType}</span></p>}
                {e.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{e.description}</p>}
                <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                  <span>Organizer: {e.organizer || '—'}</span>
                  {can(user, 'events.manage') && (
                    <span className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(e); setForm({ name: e.name, date: e.date, startTime: e.startTime, endTime: e.endTime || '', venue: e.venue, description: e.description || '', eventType: e.eventType || 'PROGRAM', organizer: e.organizer || '', targetGroupId: e.targetGroupId || '', status: e.status }); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                      {e.status === 'SCHEDULED' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cancelEvent(e)}><XCircle className="h-3 w-3 text-rose-500" /></Button>}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Event' : 'Create Event'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5 sm:col-span-2"><Label>Event Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. PYC Anniversary Celebration" /></div>
            <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.eventType} onValueChange={v => setForm({ ...form, eventType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Venue *</Label><Input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Organizer</Label><Input value={form.organizer} onChange={e => setForm({ ...form, organizer: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Start Time *</Label><Input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>End Time</Label><Input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Target Group</Label>
              <Select value={form.targetGroupId || 'all'} onValueChange={v => setForm({ ...form, targetGroupId: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            {editing && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['SCHEDULED', 'COMPLETED', 'CANCELLED'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={busy || !form.name || !form.date || !form.venue}>{editing ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
