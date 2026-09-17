'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { StatusBadge, PageHeader, EmptyState, Spinner, StatCard, Pagination } from '@/components/shared';
import { api, can, fmtDate, fmtTime12, fmtDateTime, CurrentUser, Automation, AutomationExecution, Member, MemberGroup, SmsTemplate, Meeting, ClubEvent, NextRun, TRIGGER_LABELS } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Bot, Play, Power, Cake, CalendarClock, PartyPopper, Wallet, Sparkles, Pencil, Plus, Activity, Timer, RefreshCw, Zap } from 'lucide-react';

// ============ shared hooks ============

function useAutomations(type?: string) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [nextRuns, setNextRuns] = useState<NextRun[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ automations: Automation[]; nextRuns: NextRun[] }>(`/api/automations${type ? `?type=${type}` : ''}`);
      setAutomations(d.automations); setNextRuns(d.nextRuns);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [type]);
  useEffect(() => { load(); }, [load]);
  return { automations, nextRuns, loading, reload: load };
}

// ============ AUTOMATION DASHBOARD ============

export function AutomationDashboardView({ user, onNavigate }: { user: CurrentUser; onNavigate: (v: string) => void }) {
  const { automations, nextRuns, loading, reload } = useAutomations();
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [tickBusy, setTickBusy] = useState(false);

  const loadExec = useCallback(async () => {
    const d = await api<{ executions: AutomationExecution[] }>('/api/automations/executions?pageSize=12');
    setExecutions(d.executions);
  }, []);
  useEffect(() => { loadExec(); }, [loadExec]);

  const runNow = async (a: Automation, force = false) => {
    setRunning(a.id);
    try {
      const r = await api<{ summary: { sent: number; failed: number; skipped: number; duplicates: number; candidates: number } }>(`/api/automations/${a.id}/run`, { method: 'POST', json: { force } });
      const s = r.summary;
      toast.success(`"${a.name}" — candidates: ${s.candidates} · sent: ${s.sent} · failed: ${s.failed} · skipped: ${s.skipped} · duplicates: ${s.duplicates}`);
      reload(); loadExec();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Run failed'); }
    finally { setRunning(null); }
  };

  const runTick = async () => {
    setTickBusy(true);
    try {
      const r = await api<{ result: { scheduledProcessed: number; deliveriesResolved: number } }>('/api/scheduler', { method: 'POST' });
      toast.success(`Engine tick complete — ${r.result.scheduledProcessed} scheduled processed, ${r.result.deliveriesResolved} deliveries resolved`);
      reload(); loadExec();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setTickBusy(false); }
  };

  const active = automations.filter(a => a.status === 'ACTIVE').length;

  return (
    <div>
      <PageHeader
        title="Automation Dashboard"
        subtitle="One central engine drives every automation — birthdays, meetings, events, dues and custom rules"
        actions={can(user, 'automation.run') ? (
          <Button variant="outline" onClick={runTick} disabled={tickBusy}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${tickBusy ? 'animate-spin' : ''}`} /> Run engine tick
          </Button>
        ) : undefined}
      />
      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard label="Active Automations" value={active} icon={<Zap className="h-5 w-5" />} tone="emerald" />
            <StatCard label="Inactive Automations" value={automations.length - active} icon={<Power className="h-5 w-5" />} />
            <StatCard label="Automations defined" value={automations.length} icon={<Bot className="h-5 w-5" />} tone="teal" />
            <StatCard label="Recent executions" value={executions.length} icon={<Activity className="h-5 w-5" />} tone="violet" sub="latest 12 shown below" />
          </div>

          <Card className="border-slate-200/80 mb-6">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Timer className="h-4 w-4 text-primary" /> Next automations</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {nextRuns.length === 0 && <EmptyState title="Nothing scheduled" hint="Create meetings, events or custom automations." />}
              {nextRuns.map((r, i) => (
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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <QuickCard icon={<Cake className="h-5 w-5" />} title="Birthday Wishes" desc="Automatic birthday greetings on the big day (or 1/3 days before)." onClick={() => onNavigate('automation.birthday')} tone="bg-amber-100 text-amber-700" />
            <QuickCard icon={<CalendarClock className="h-5 w-5" />} title="Meeting Reminders" desc="Remind members 7/3/2/1 days before or on meeting day." onClick={() => onNavigate('automation.meeting')} tone="bg-emerald-100 text-primary" />
            <QuickCard icon={<PartyPopper className="h-5 w-5" />} title="Event Reminders" desc="Announce and remind members about club events." onClick={() => onNavigate('automation.event')} tone="bg-violet-100 text-violet-700" />
            <QuickCard icon={<Sparkles className="h-5 w-5" />} title="Custom Automation" desc="Date, monthly, weekly or daily rules — no programming." onClick={() => onNavigate('automation.custom')} tone="bg-teal-100 text-teal-700" />
          </div>

          <ExecutionsCard executions={executions} onRefresh={loadExec} />
        </>
      )}
      {running && <p className="text-xs text-slate-400 mt-2">Running {running}…</p>}
    </div>
  );
}

function QuickCard({ icon, title, desc, onClick, tone }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; tone: string }) {
  return (
    <button onClick={onClick} className="text-left rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-4 group">
      <div className={`rounded-xl w-fit p-2.5 mb-3 ${tone}`}>{icon}</div>
      <p className="font-semibold text-slate-800 group-hover:text-primary">{title}</p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </button>
  );
}

// ============ EXECUTIONS (shared) ============

export function ExecutionsCard({ executions, onRefresh, automationId }: { executions: AutomationExecution[]; onRefresh?: () => void; automationId?: string }) {
  return (
    <Card className="border-slate-200/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Automation execution log {automationId ? '' : '(latest)'}</CardTitle>
          {onRefresh && <Button variant="ghost" size="sm" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Button>}
        </div>
      </CardHeader>
      <CardContent>
        {executions.length === 0 ? (
          <EmptyState title="No executions yet" hint="Automations will appear here as the engine runs (dedupe keys guarantee no duplicates)." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Executed</th>
                <th className="px-3 py-2 font-semibold">Automation</th>
                <th className="px-3 py-2 font-semibold">Recipient</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Reason / Note</th>
              </tr></thead>
              <tbody>
                {executions.map(e => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{fmtDateTime(e.executedAt)}</td>
                    <td className="px-3 py-2 text-xs font-medium">{e.automationName}</td>
                    <td className="px-3 py-2 text-xs">{e.recipientName}<span className="text-slate-400"> · {e.recipientPhone}</span></td>
                    <td className="px-3 py-2"><StatusBadge status={e.status} /></td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-[240px]"><p className="truncate" title={e.reason || ''}>{e.reason || '—'}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ BIRTHDAY AUTOMATION (singleton config) ============

export function BirthdayAutomationView({ user }: { user: CurrentUser }) {
  const { automations, loading, reload } = useAutomations('BIRTHDAY');
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [sendTime, setSendTime] = useState('08:00');
  const [offsets, setOffsets] = useState<number[]>([0]);
  const [templateId, setTemplateId] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  const auto = automations[0];

  const loadExec = useCallback(async () => {
    if (!auto) return;
    const d = await api<{ executions: AutomationExecution[] }>(`/api/automations/executions?automationId=${auto.id}&pageSize=20`);
    setExecutions(d.executions);
  }, [auto]);
  useEffect(() => { loadExec(); }, [loadExec]);
  useEffect(() => { api<{ templates: SmsTemplate[] }>('/api/templates?category=BIRTHDAY').then(d => setTemplates(d.templates)).catch(() => {}); }, []);

  useEffect(() => {
    if (auto) {
      const cfg = JSON.parse(auto.config || '{}');
      setSendTime(cfg.sendTime || '08:00');
      setOffsets(cfg.offsets || [0]);
      setTemplateId(auto.templateId || '');
    }
  }, [auto]);

  const save = async () => {
    if (!auto) return;
    setBusy(true);
    try {
      await api(`/api/automations/${auto.id}`, { method: 'PATCH', json: { config: { sendTime, offsets }, templateId } });
      toast.success('Birthday automation saved');
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const toggle = async () => {
    try { await api(`/api/automations/${auto.id}/toggle`, { method: 'POST' }); toast.success('Status updated'); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await api<{ summary: { sent: number; failed: number; skipped: number; duplicates: number } }>(`/api/automations/${auto.id}/run`, { method: 'POST', json: {} });
      toast.success(`Run complete — sent: ${r.summary.sent}, failed: ${r.summary.failed}, skipped: ${r.summary.skipped}, duplicates blocked: ${r.summary.duplicates}`);
      reload(); loadExec();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setRunning(false); }
  };

  const doPreview = async () => {
    const d = await api<{ preview: string }>('/api/sms/preview', { method: 'POST', json: { templateId: templateId || undefined } });
    setPreview(d.preview);
  };

  if (loading) return <Spinner />;
  if (!auto) return <EmptyState title="Birthday automation not found" hint="Re-seed the database or create a BIRTHDAY automation." />;

  return (
    <div>
      <PageHeader
        title="Birthday Wishes"
        subtitle="Checks member birthdays daily and sends automatically — duplicate-proof per member & year"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <span className="text-xs font-medium text-slate-600">{auto.status}</span>
              <Switch checked={auto.status === 'ACTIVE'} onCheckedChange={toggle} disabled={!can(user, 'automation.activate')} />
            </div>
            {can(user, 'automation.run') && <Button variant="outline" onClick={runNow} disabled={running}><Play className="h-4 w-4 mr-1.5" /> Run now</Button>}
          </div>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Send Time (Africa/Accra)</Label>
              <Input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-2">
              <Label>Send birthday SMS</Label>
              {[
                { v: 0, label: 'On the birthday' },
                { v: 1, label: 'One day before' },
                { v: 3, label: 'Three days before' },
              ].map(o => (
                <label key={o.v} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={offsets.includes(o.v)} onCheckedChange={c => setOffsets(c ? [...offsets, o.v].sort() : offsets.filter(x => x !== o.v))} />
                  {o.label}
                </label>
              ))}
              {offsets.length === 0 && <p className="text-xs text-rose-500">Select at least one timing.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateId || 'none'} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select template…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Select template…</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">Recipients: active members only — members with SMS permission disabled are automatically skipped and logged.</p>
            </div>
            <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={busy || offsets.length === 0 || !templateId}>
              {busy ? 'Saving…' : 'Save Configuration'}
            </Button>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Cake className="h-4 w-4 text-amber-500" /> Message preview</CardTitle></CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={doPreview} className="mb-3">Generate preview (sample member)</Button>
            {preview && <div className="rounded-2xl bg-[#0E1A62] text-blue-50 p-4 whitespace-pre-wrap text-sm">{preview}</div>}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <ExecutionsCard executions={executions} onRefresh={loadExec} automationId={auto.id} />
      </div>
    </div>
  );
}

// ============ MEETING / EVENT REMINDERS (list + editor) ============

export function ReminderListView({ user, kind }: { user: CurrentUser; kind: 'MEETING_REMINDER' | 'EVENT_REMINDER' }) {
  const { automations, loading, reload } = useAutomations(kind);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const isMeeting = kind === 'MEETING_REMINDER';

  const loadRefs = useCallback(async () => {
    const [m, e, g, t] = await Promise.all([
      api<{ meetings: Meeting[] }>('/api/meetings'),
      api<{ events: ClubEvent[] }>('/api/events'),
      api<{ groups: MemberGroup[] }>('/api/groups'),
      api<{ templates: SmsTemplate[] }>(`/api/templates?category=${isMeeting ? 'MEETING' : 'EVENT'}`),
    ]);
    setMeetings(m.meetings); setEvents(e.events); setGroups(g.groups.filter(g => g.isActive)); setTemplates(t.templates);
  }, [isMeeting]);
  useEffect(() => { loadRefs(); }, [loadRefs]);

  const toggle = async (a: Automation) => {
    try { await api(`/api/automations/${a.id}/toggle`, { method: 'POST' }); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const runNow = async (a: Automation) => {
    setRunning(a.id);
    try {
      const r = await api<{ summary: { sent: number; failed: number; skipped: number; duplicates: number } }>(`/api/automations/${a.id}/run`, { method: 'POST', json: {} });
      toast.success(`Sent ${r.summary.sent}, failed ${r.summary.failed}, skipped ${r.summary.skipped}, duplicates ${r.summary.duplicates}`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setRunning(null); }
  };

  return (
    <div>
      <PageHeader
        title={isMeeting ? 'Meeting Reminders' : 'Event Reminders'}
        subtitle={isMeeting ? 'Automatically remind the right audience before each meeting' : 'Automatically remind the right audience before each event'}
        actions={can(user, 'automation.create') ? (
          <Button className="bg-primary hover:bg-primary/90" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New {isMeeting ? 'Meeting' : 'Event'} Reminder
          </Button>
        ) : undefined}
      />
      {loading ? <Spinner /> : automations.length === 0 ? (
        <EmptyState title={`No ${isMeeting ? 'meeting' : 'event'} reminder automations yet`} hint="Create one — it applies to all scheduled items unless you pick a specific one." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {automations.map(a => {
            const cfg = JSON.parse(a.config || '{}');
            return (
              <Card key={a.id} className="border-slate-200/80">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800 truncate">{a.name}</h3>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={a.status === 'ACTIVE'} onCheckedChange={() => toggle(a)} disabled={!can(user, 'automation.activate')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs">
                    <p className="text-slate-500">Applies to: <b className="text-slate-700">{a.meeting ? a.meeting.name : a.event ? a.event.name : `All scheduled ${isMeeting ? 'meetings' : 'events'}`}</b></p>
                    <p className="text-slate-500">Send time: <b className="text-slate-700">{fmtTime12(cfg.sendTime || '08:00')}</b></p>
                    <p className="text-slate-500">Timing: <b className="text-slate-700">{(cfg.offsets || []).map((o: number) => o === 0 ? 'Same day' : `${o}d before`).join(', ') || '—'}</b></p>
                    <p className="text-slate-500">Audience: <b className="text-slate-700">{a.audienceType === 'ALL_ACTIVE' ? 'All active' : a.audienceType === 'GROUP' ? a.group?.name : 'Selected'}</b></p>
                    <p className="text-slate-500 col-span-2">Template: <b className="text-slate-700">{a.template?.name || '—'}</b></p>
                    <p className="text-slate-500 col-span-2">Last run: <b className="text-slate-700">{a.lastRunAt ? fmtDateTime(a.lastRunAt) : 'never'}</b></p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {can(user, 'automation.edit') && <Button variant="outline" size="sm" onClick={() => { setEditing(a); setEditorOpen(true); }}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>}
                    {can(user, 'automation.run') && <Button variant="ghost" size="sm" onClick={() => runNow(a)} disabled={running === a.id}><Play className="h-3.5 w-3.5 mr-1" /> Run now</Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ReminderEditor
        open={editorOpen} onOpenChange={setEditorOpen} editing={editing} kind={kind}
        meetings={meetings} events={events} groups={groups} templates={templates}
        onSaved={() => { setEditorOpen(false); reload(); }}
      />
    </div>
  );
}

function ReminderEditor({ open, onOpenChange, editing, kind, meetings, events, groups, templates, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Automation | null;
  kind: 'MEETING_REMINDER' | 'EVENT_REMINDER';
  meetings: Meeting[]; events: ClubEvent[]; groups: MemberGroup[]; templates: SmsTemplate[];
  onSaved: () => void;
}) {
  const isMeeting = kind === 'MEETING_REMINDER';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [specificId, setSpecificId] = useState('');
  const [sendTime, setSendTime] = useState('09:00');
  const [offsets, setOffsets] = useState<number[]>([2, 1, 0]);
  const [customOffset, setCustomOffset] = useState('');
  const [audienceType, setAudienceType] = useState('ALL_ACTIVE');
  const [groupId, setGroupId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      const cfg = JSON.parse(editing.config || '{}');
      setName(editing.name); setDescription(editing.description || '');
      setSpecificId(editing.meetingId || editing.eventId || '');
      setSendTime(cfg.sendTime || '09:00'); setOffsets(cfg.offsets || [1]);
      setAudienceType(editing.audienceType); setGroupId(editing.groupId || '');
      setTemplateId(editing.templateId || '');
    } else {
      setName(''); setDescription(''); setSpecificId(''); setSendTime('09:00');
      setOffsets([2, 1, 0]); setCustomOffset(''); setAudienceType('ALL_ACTIVE');
      setGroupId(''); setTemplateId('');
    }
  }, [editing, open]);

  const save = async () => {
    setBusy(true);
    const allOffsets = [...offsets];
    if (customOffset !== '' && !isNaN(parseInt(customOffset))) allOffsets.push(parseInt(customOffset));
    const payload = {
      name, description,
      type: kind, triggerType: kind,
      config: { sendTime, offsets: [...new Set(allOffsets)].sort((a, b) => b - a) },
      audienceType, groupId: audienceType === 'GROUP' ? groupId : null,
      templateId,
      ...(isMeeting ? { meetingId: specificId || null } : { eventId: specificId || null }),
    };
    try {
      if (editing) await api(`/api/automations/${editing.id}`, { method: 'PATCH', json: payload });
      else await api('/api/automations', { method: 'POST', json: payload });
      toast.success(editing ? 'Reminder updated' : 'Reminder created');
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} {isMeeting ? 'Meeting' : 'Event'} Reminder</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5"><Label>Automation Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder={isMeeting ? 'e.g. Monthly Meeting Reminder' : 'e.g. Anniversary Countdown'} /></div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>{isMeeting ? 'Meeting' : 'Event'}</Label>
            <Select value={specificId || 'all'} onValueChange={setSpecificId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scheduled {isMeeting ? 'meetings' : 'events'}</SelectItem>
                {(isMeeting ? meetings : events as Meeting[]).map(x => <SelectItem key={x.id} value={x.id}>{x.name} — {fmtDate(x.date)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Send Time (Accra)</Label><Input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Template *</Label>
              <Select value={templateId || 'none'} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Select…</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reminder timing</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {[7, 3, 2, 1, 0].map(o => (
                <label key={o} className="flex items-center gap-2 text-sm border rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={offsets.includes(o)} onCheckedChange={c => setOffsets(c ? [...offsets, o] : offsets.filter(x => x !== o))} />
                  {o === 0 ? 'Same day' : `${o} day${o > 1 ? 's' : ''} before`}
                </label>
              ))}
              <div className="flex items-center gap-1.5 border rounded-md px-2.5 py-1.5">
                <Input className="h-5 w-12 text-xs px-1" placeholder="N" value={customOffset} onChange={e => setCustomOffset(e.target.value.replace(/\D/g, ''))} />
                <span className="text-xs text-slate-500">days before (custom)</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Recipients</Label>
              <Select value={audienceType} onValueChange={setAudienceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_ACTIVE">All Active Members</SelectItem>
                  <SelectItem value="GROUP">Selected Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audienceType === 'GROUP' && (
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Select value={groupId || 'none'} onValueChange={setGroupId}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Choose…</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">If the {isMeeting ? 'meeting' : 'event'} has a target group and recipients are &quot;All Active&quot;, only that group is messaged.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={busy || !name.trim() || !templateId || offsets.length === 0}>{busy ? 'Saving…' : editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ CUSTOM AUTOMATIONS ============

export function CustomAutomationView({ user }: { user: CurrentUser }) {
  const { automations, loading, reload } = useAutomations('CUSTOM');
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ groups: MemberGroup[] }>('/api/groups'),
      api<{ members: Member[] }>('/api/members?pageSize=200&status=ACTIVE'),
      api<{ templates: SmsTemplate[] }>('/api/templates'),
    ]).then(([g, m, t]) => {
      setGroups(g.groups.filter(x => x.isActive)); setMembers(m.members); setTemplates(t.templates.filter(x => x.status === 'ACTIVE'));
    }).catch(() => {});
  }, []);

  const toggle = async (a: Automation) => {
    try { await api(`/api/automations/${a.id}/toggle`, { method: 'POST' }); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const runNow = async (a: Automation) => {
    setRunning(a.id);
    try {
      const r = await api<{ summary: { sent: number; failed: number; skipped: number; duplicates: number } }>(`/api/automations/${a.id}/run`, { method: 'POST', json: {} });
      toast.success(`Sent ${r.summary.sent}, failed ${r.summary.failed}, skipped ${r.summary.skipped}, duplicates ${r.summary.duplicates}`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setRunning(null); }
  };

  return (
    <div>
      <PageHeader
        title="Custom Automation"
        subtitle="Create new automations without programming — date, monthly, weekly or daily triggers"
        actions={can(user, 'automation.create') ? (
          <Button className="bg-primary hover:bg-primary/90" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New Automation
          </Button>
        ) : undefined}
      />
      {loading ? <Spinner /> : automations.length === 0 ? (
        <EmptyState title="No custom automations yet" hint='Example: "Monthly PYC Greeting" — trigger Monthly, day 1, 08:00, all active members.' />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {automations.map(a => {
            const cfg = JSON.parse(a.config || '{}');
            return (
              <Card key={a.id} className="border-slate-200/80">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800 truncate">{a.name}</h3>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.description}</p>
                    </div>
                    <Switch checked={a.status === 'ACTIVE'} onCheckedChange={() => toggle(a)} disabled={!can(user, 'automation.activate')} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs">
                    <p className="text-slate-500">Trigger: <b className="text-slate-700">{TRIGGER_LABELS[a.triggerType] || a.triggerType}</b></p>
                    <p className="text-slate-500">Send time: <b className="text-slate-700">{fmtTime12(cfg.sendTime || '08:00')}</b></p>
                    <p className="text-slate-500 col-span-2">Schedule: <b className="text-slate-700">
                      {a.triggerType === 'MONTHLY' ? `Day ${cfg.dayOfMonth || 1} of every month` :
                        a.triggerType === 'WEEKLY' ? `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][cfg.weekday || 0]}` :
                          a.triggerType === 'SPECIFIC_DATE' ? `On ${fmtDate(cfg.specificDate || '')}` :
                            a.triggerType === 'DAILY' ? 'Every day' : '—'}
                    </b></p>
                    <p className="text-slate-500">Audience: <b className="text-slate-700">{a.audienceType === 'ALL_ACTIVE' ? 'All active' : a.audienceType === 'GROUP' ? a.group?.name : a.audienceType === 'SELECTED' ? `${JSON.parse(a.memberIds).length} selected` : '—'}</b></p>
                    <p className="text-slate-500">Template: <b className="text-slate-700">{a.template?.name || '—'}</b></p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {can(user, 'automation.edit') && <Button variant="outline" size="sm" onClick={() => { setEditing(a); setEditorOpen(true); }}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>}
                    {can(user, 'automation.run') && <Button variant="ghost" size="sm" onClick={() => runNow(a)} disabled={running === a.id}><Play className="h-3.5 w-3.5 mr-1" /> Run now</Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CustomEditor
        open={editorOpen} onOpenChange={setEditorOpen} editing={editing}
        groups={groups} members={members} templates={templates}
        onSaved={() => { setEditorOpen(false); reload(); }}
      />
    </div>
  );
}

function CustomEditor({ open, onOpenChange, editing, groups, members, templates, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Automation | null;
  groups: MemberGroup[]; members: Member[]; templates: SmsTemplate[]; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('MONTHLY');
  const [sendTime, setSendTime] = useState('08:00');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [weekday, setWeekday] = useState('0');
  const [specificDate, setSpecificDate] = useState('');
  const [audienceType, setAudienceType] = useState('ALL_ACTIVE');
  const [groupId, setGroupId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      const cfg = JSON.parse(editing.config || '{}');
      setName(editing.name); setDescription(editing.description || '');
      setTriggerType(editing.triggerType); setSendTime(cfg.sendTime || '08:00');
      setDayOfMonth(String(cfg.dayOfMonth || 1)); setWeekday(String(cfg.weekday ?? 0));
      setSpecificDate(cfg.specificDate || ''); setAudienceType(editing.audienceType);
      setGroupId(editing.groupId || ''); setSelected(JSON.parse(editing.memberIds || '[]'));
      setTemplateId(editing.templateId || '');
    } else {
      setName(''); setDescription(''); setTriggerType('MONTHLY'); setSendTime('08:00');
      setDayOfMonth('1'); setWeekday('0'); setSpecificDate('');
      setAudienceType('ALL_ACTIVE'); setGroupId(''); setSelected([]); setTemplateId('');
    }
  }, [editing, open]);

  const save = async () => {
    setBusy(true);
    const config: Record<string, unknown> = { sendTime };
    if (triggerType === 'MONTHLY') config.dayOfMonth = parseInt(dayOfMonth) || 1;
    if (triggerType === 'WEEKLY') config.weekday = parseInt(weekday);
    if (triggerType === 'SPECIFIC_DATE') config.specificDate = specificDate;
    const payload = {
      name, description, type: 'CUSTOM', triggerType, config, audienceType,
      groupId: audienceType === 'GROUP' ? groupId : null,
      memberIds: audienceType === 'SELECTED' ? selected : [],
      templateId,
    };
    try {
      if (editing) await api(`/api/automations/${editing.id}`, { method: 'PATCH', json: payload });
      else await api('/api/automations', { method: 'POST', json: payload });
      toast.success(editing ? 'Automation updated' : 'Automation created');
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Create'} Custom Automation</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5"><Label>Automation Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monthly PYC Greeting" /></div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Trigger Type</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPECIFIC_DATE">Specific Date</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="BIRTHDAY">Birthday (member birthdays)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Send Time (Accra)</Label><Input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} /></div>
          </div>
          {triggerType === 'MONTHLY' && (
            <div className="space-y-1.5"><Label>Day of month</Label><Input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} className="w-28" /><p className="text-xs text-slate-400">If the month is shorter, it sends on the last day.</p></div>
          )}
          {triggerType === 'WEEKLY' && (
            <div className="space-y-1.5">
              <Label>Day of week</Label>
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {triggerType === 'SPECIFIC_DATE' && (
            <div className="space-y-1.5"><Label>Date (Ghana calendar)</Label><Input type="date" value={specificDate} onChange={e => setSpecificDate(e.target.value)} className="w-48" /></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audienceType} onValueChange={setAudienceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_ACTIVE">All Active Members</SelectItem>
                  <SelectItem value="GROUP">Selected Group</SelectItem>
                  <SelectItem value="SELECTED">Selected Members</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audienceType === 'GROUP' && (
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Select value={groupId || 'none'} onValueChange={setGroupId}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Choose…</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {audienceType === 'SELECTED' && (
            <div className="space-y-1.5">
              <Label>Members ({selected.length} selected)</Label>
              <div className="border rounded-lg max-h-44 overflow-y-auto divide-y">
                {members.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                    <Checkbox checked={selected.includes(m.id)} onCheckedChange={c => setSelected(c ? [...selected, m.id] : selected.filter(id => id !== m.id))} />
                    {m.firstName} {m.lastName}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Template *</Label>
            <Select value={templateId || 'none'} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Select…</SelectItem>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.category})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={busy || !name.trim() || !templateId || (triggerType === 'SPECIFIC_DATE' && !specificDate) || (audienceType === 'GROUP' && !groupId) || (audienceType === 'SELECTED' && selected.length === 0)}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Create Automation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
