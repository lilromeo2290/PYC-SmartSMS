'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge, PageHeader, EmptyState, Spinner, Pagination, StatCard } from '@/components/shared';
import { api, can, fmtDateTime, CurrentUser, Member, MemberGroup, SmsTemplate, ScheduledSms, SmsMessage } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Send, Eye, Trash2, EyeOff, RotateCcw, Info, Clock3, MailCheck, MailX, Mail } from 'lucide-react';

// =========================== SEND SMS (individual) ===========================

export function SendSmsView({ user }: { user: CurrentUser }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [memberId, setMemberId] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ members: Member[] }>('/api/members?pageSize=200&status=ACTIVE').then(d => setMembers(d.members)).catch(() => {});
    api<{ templates: SmsTemplate[] }>('/api/templates').then(d => setTemplates(d.templates.filter(t => t.status === 'ACTIVE'))).catch(() => {});
  }, []);

  const applyTemplate = async (id: string) => {
    setTemplateId(id);
    if (!id) return;
    try {
      const ctx: Record<string, string> = { templateId: id };
      if (memberId) ctx.memberId = memberId;
      const d = await api<{ preview: string }>('/api/sms/preview', { method: 'POST', json: ctx });
      setMessage(d.preview);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const doPreview = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      const ctx: Record<string, string> = { message };
      if (memberId) ctx.memberId = memberId;
      const d = await api<{ preview: string; unresolved: string[] }>('/api/sms/preview', { method: 'POST', json: ctx });
      setPreview(d.preview);
      if (d.unresolved.length) toast.warning(`Unresolved variables: ${d.unresolved.join(', ')}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!memberId && !phone.trim()) { toast.error('Select a member or enter a phone number.'); return; }
    if (!message.trim()) { toast.error('Message is required.'); return; }
    setBusy(true);
    try {
      const r = await api<{ result: { status: string }; message: string }>('/api/sms/send', { method: 'POST', json: { memberId: memberId || undefined, phone: memberId ? undefined : phone, message, templateId: templateId || undefined } });
      if (r.result.status === 'SENT') toast.success('SMS sent to gateway — tracking delivery.');
      else toast.error('SMS failed — see SMS History.');
      setMessage(''); setPreview(null); setPhone(''); setMemberId(''); setTemplateId('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Send failed'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Send SMS" subtitle="Send an individual message to a member or any Ghana phone number" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="text-base">Compose</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Select Member</Label>
              <Select value={memberId || 'external'} onValueChange={v => setMemberId(v === 'external' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="external">— External number (enter below) —</SelectItem>
                  {members.map(m => <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.memberCode}) · {m.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!memberId && (
              <div className="space-y-1.5">
                <Label>Phone Number</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0241234567" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Use Template (optional)</Label>
              <Select value={templateId || 'none'} onValueChange={applyTemplate}>
                <SelectTrigger><SelectValue placeholder="None — write manually" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — write manually</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.category})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Message {message.includes('{{') && <span className="text-primary text-xs font-normal">· variables will be personalized per member</span>}</Label>
              <Textarea rows={7} value={message} onChange={e => { setMessage(e.target.value); setPreview(null); }} placeholder="Dear {{first_name}}, …" />
              <p className="text-xs text-slate-400">{message.length} characters · {Math.max(1, Math.ceil(message.length / (message.length > 160 ? 153 : 160)))} SMS segment(s) approx.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {can(user, 'sms.send') && (
                <Button className="bg-primary hover:bg-primary/90" onClick={send} disabled={busy}>
                  <Send className="h-4 w-4 mr-1.5" /> Send SMS
                </Button>
              )}
              <Button variant="outline" onClick={doPreview} disabled={busy}><Eye className="h-4 w-4 mr-1.5" /> Preview</Button>
              <Button variant="ghost" onClick={() => { setMessage(''); setPreview(null); setPhone(''); setMemberId(''); setTemplateId(''); }}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Preview</CardTitle></CardHeader>
          <CardContent>
            {preview ? (
              <div className="rounded-2xl bg-[#0E1A62] text-blue-50 p-4 whitespace-pre-wrap text-sm leading-relaxed shadow-inner min-h-40">{preview}</div>
            ) : (
              <p className="text-sm text-slate-400 py-10 text-center">Click <b>Preview</b> to see the message with real variables resolved.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =========================== GROUP SMS ===========================

export function GroupSmsView({ user }: { user: CurrentUser }) {
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [audienceType, setAudienceType] = useState('ALL_ACTIVE');
  const [groupId, setGroupId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [recipients, setRecipients] = useState(0);
  const [units, setUnits] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ total: number; sent: number; failed: number } | null>(null);

  useEffect(() => {
    api<{ groups: MemberGroup[] }>('/api/groups').then(d => setGroups(d.groups.filter(g => g.isActive))).catch(() => {});
    api<{ members: Member[] }>('/api/members?pageSize=200&status=ACTIVE').then(d => setMembers(d.members)).catch(() => {});
    api<{ templates: SmsTemplate[] }>('/api/templates').then(d => setTemplates(d.templates.filter(t => t.status === 'ACTIVE'))).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ audienceType });
    if (audienceType === 'GROUP' && groupId) params.set('groupId', groupId);
    if (audienceType === 'SELECTED') params.set('memberIds', selected.join(','));
    params.set('message', message);
    const t = setTimeout(() => {
      api<{ total: number; estimatedUnits: number }>(`/api/sms/group?${params}`).then(d => { setRecipients(d.total); setUnits(d.estimatedUnits); }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [audienceType, groupId, selected, message]);

  const applyTemplate = async (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const d = await api<{ preview: string }>('/api/sms/preview', { method: 'POST', json: { templateId: id } });
    setMessage(d.preview);
  };

  const showPreview = async () => {
    const d = await api<{ preview: string }>('/api/sms/preview', { method: 'POST', json: { message, templateId: templateId || undefined } });
    setPreviewText(d.preview);
    setPreviewOpen(true);
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ total: number; sent: number; failed: number }>('/api/sms/group', {
        method: 'POST', json: { audienceType, groupId: groupId || undefined, memberIds: selected, message, templateId: templateId || undefined, confirm: true },
      });
      setResult(r);
      toast.success(`Group SMS: ${r.sent} sent, ${r.failed} failed of ${r.total} recipients`);
      setConfirmOpen(false); setMessage(''); setTemplateId('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Send failed'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Group SMS" subtitle="Send to all active members, a group, or selected members" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="text-base">Compose</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Recipients</Label>
              <Select value={audienceType} onValueChange={v => { setAudienceType(v); setSelected([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_ACTIVE">All Active Members</SelectItem>
                  <SelectItem value="GROUP">Select Group</SelectItem>
                  <SelectItem value="SELECTED">Selected Members</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audienceType === 'GROUP' && (
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Select value={groupId || 'none'} onValueChange={setGroupId}>
                  <SelectTrigger><SelectValue placeholder="Choose a group…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Choose a group…</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.memberCount})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {audienceType === 'SELECTED' && (
              <div className="space-y-1.5">
                <Label>Members ({selected.length} selected)</Label>
                <div className="border rounded-lg max-h-52 overflow-y-auto divide-y">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                      <Checkbox checked={selected.includes(m.id)} onCheckedChange={c => setSelected(c ? [...selected, m.id] : selected.filter(id => id !== m.id))} />
                      {m.firstName} {m.lastName} <span className="text-xs text-slate-400 ml-auto">{m.phone}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Template (optional)</Label>
              <Select value={templateId || 'none'} onValueChange={applyTemplate}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — write manually</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Message (variables are personalized per member)</Label>
              <Textarea rows={7} value={message} onChange={e => setMessage(e.target.value)} placeholder="Dear {{first_name}}, …" />
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 border-slate-200/80 h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-slate-50 border p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Recipients:</span><b className="tabular-nums">{recipients}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Estimated SMS Units:</span><b className="tabular-nums">{units}</b></div>
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Only members with <b>Active</b> status and <b>Enabled</b> SMS permission will receive this message. A confirmation is required before sending.
              </AlertDescription>
            </Alert>
            <div className="flex flex-col gap-2">
              <Button className="bg-primary hover:bg-primary/90" onClick={() => setConfirmOpen(true)} disabled={!message.trim() || recipients === 0}>
                <Send className="h-4 w-4 mr-1.5" /> Send Group SMS
              </Button>
              <Button variant="outline" onClick={showPreview} disabled={!message.trim()}><Eye className="h-4 w-4 mr-1.5" /> Preview</Button>
            </div>
            {result && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm">
                <p className="font-semibold text-emerald-800">Last send completed</p>
                <p className="text-primary text-xs mt-0.5">{result.sent} sent · {result.failed} failed · {result.total} recipients</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirm Group SMS</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            Send this message to <b>{recipients}</b> recipient(s), using approximately <b>{units}</b> SMS units?
          </p>
          <div className="rounded-xl bg-slate-50 border p-3 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">{message}</div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Confirm & Send'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Message preview (sample member)</DialogTitle></DialogHeader>
          <div className="rounded-2xl bg-[#0E1A62] text-blue-50 p-4 whitespace-pre-wrap text-sm min-h-32">{previewText}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =========================== SCHEDULED SMS ===========================

export function ScheduledSmsView({ user }: { user: CurrentUser }) {
  const [items, setItems] = useState<ScheduledSms[]>([]);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [audienceType, setAudienceType] = useState('ALL_ACTIVE');
  const [groupId, setGroupId] = useState('');
  const [message, setMessage] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api<{ scheduled: ScheduledSms[] }>('/api/sms/scheduled'); setItems(d.scheduled); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<{ groups: MemberGroup[] }>('/api/groups').then(d => setGroups(d.groups.filter(g => g.isActive))).catch(() => {}); }, []);

  const schedule = async () => {
    setBusy(true);
    try {
      await api('/api/sms/scheduled', {
        method: 'POST',
        json: { audienceType, groupId: groupId || undefined, message, scheduledDate, scheduledTime },
      });
      toast.success('SMS scheduled — the server will send it automatically at the scheduled Ghana time.');
      setOpen(false); setMessage(''); setScheduledDate('');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const cancel = async (s: ScheduledSms) => {
    if (!confirm(`Cancel "${s.name}"?`)) return;
    try { await api(`/api/sms/scheduled/${s.id}`, { method: 'PATCH' }); toast.success('Cancelled'); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <PageHeader
        title="Scheduled SMS"
        subtitle="Messages queued for future sending — processed by the server scheduler (Africa/Accra)"
        actions={can(user, 'sms.schedule') ? (
          <Button className="bg-primary hover:bg-primary/90" onClick={() => setOpen(true)}>
            <Clock3 className="h-4 w-4 mr-1.5" /> Schedule SMS
          </Button>
        ) : undefined}
      />
      <Card className="border-slate-200/80">
        <CardContent className="p-0">
          {loading ? <Spinner /> : items.length === 0 ? <EmptyState title="No scheduled messages" hint="Schedule one to see it here." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Scheduled for (Accra)</th>
                  <th className="px-4 py-3 font-semibold">Recipients</th>
                  <th className="px-4 py-3 font-semibold">Message</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr></thead>
                <tbody>
                  {items.map(s => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3">{s.scheduledDate} · {s.scheduledTime}</td>
                      <td className="px-4 py-3 tabular-nums">{s.recipientCount}</td>
                      <td className="px-4 py-3 max-w-[280px]"><p className="truncate text-slate-600" title={s.message}>{s.message}</p></td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {s.status === 'PENDING' && can(user, 'sms.schedule') && (
                          <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => cancel(s)}>Cancel</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Schedule SMS</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Recipients</Label>
              <Select value={audienceType} onValueChange={setAudienceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_ACTIVE">All Active Members</SelectItem>
                  <SelectItem value="GROUP">Select Group</SelectItem>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Date (Ghana)</Label><Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Time (Ghana)</Label><Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Message</Label><Textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} placeholder="Dear {{first_name}}, …" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={schedule} disabled={busy || !message.trim() || !scheduledDate || (audienceType === 'GROUP' && !groupId)}>
              Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =========================== SMS HISTORY ===========================

export function SmsHistoryView({ user }: { user: CurrentUser }) {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SmsMessage | null>(null);
  const [automations, setAutomations] = useState<{ id: string; name: string }[]>([]);
  const [automationId, setAutomationId] = useState('');
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (automationId) params.set('automationId', automationId);
      if (q) params.set('q', q);
      const d = await api<{ messages: SmsMessage[]; total: number }>(`/api/sms/history?${params}`);
      setMessages(d.messages); setTotal(d.total);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [page, status, type, q, automationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<{ automations: { id: string; name: string }[] }>('/api/automations').then(d => setAutomations(d.automations)).catch(() => {}); }, []);

  const retry = async (m: SmsMessage) => {
    try {
      const r = await api<{ result: { status: string; error?: string } }>('/api/sms/retry', { method: 'POST', json: { messageId: m.id } });
      if (r.result.status === 'SENT') toast.success('Retry accepted by gateway.');
      else toast.error(r.result.error || 'Retry failed.');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <PageHeader title="SMS History" subtitle={`${total} messages recorded`} />
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input placeholder="Search recipient, phone, message…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} className="flex-1" />
        <Select value={status || 'all'} onValueChange={v => { setStatus(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {['QUEUED', 'SENT', 'DELIVERED', 'FAILED'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type || 'all'} onValueChange={v => { setType(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {['MANUAL', 'GROUP', 'SCHEDULED', 'AUTOMATED'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={automationId || 'all'} onValueChange={v => { setAutomationId(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All automations</SelectItem>
            {automations.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card className="border-slate-200/80">
        <CardContent className="p-0">
          {loading ? <Spinner /> : messages.length === 0 ? <EmptyState title="No messages found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Date / Time</th>
                  <th className="px-4 py-3 font-semibold">Recipient</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Message</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">Automation</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Ref / Actions</th>
                </tr></thead>
                <tbody>
                  {messages.map(m => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{fmtDateTime(m.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.recipientName}</p>
                        <p className="text-xs text-slate-400 tabular-nums">{m.phone}</p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell max-w-[260px]">
                        <button className="truncate text-slate-600 hover:text-primary text-left" onClick={() => setDetail(m)}>{m.message.slice(0, 60)}{m.message.length > 60 ? '…' : ''}</button>
                      </td>
                      <td className="px-4 py-3"><Badge>{m.type}</Badge></td>
                      <td className="px-4 py-3 hidden xl:table-cell text-xs text-slate-500">{m.automationName || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-slate-400 font-mono">{m.providerRef || ''}</span>
                          {m.status === 'FAILED' && m.attempts < 3 && can(user, 'sms.send') && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={`Retry (attempt ${m.attempts + 1}/3)`} onClick={() => retry(m)}>
                              <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 pb-3"><Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} /></div>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={v => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Message detail</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <div className="rounded-2xl bg-[#0E1A62] text-blue-50 p-4 whitespace-pre-wrap">{detail.message}</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <p><b>To:</b> {detail.recipientName} ({detail.phone})</p>
                <p><b>Type:</b> {detail.type}</p>
                <p><b>Automation:</b> {detail.automationName || '—'}</p>
                <p><b>Status:</b> {detail.status}</p>
                <p><b>Provider ref:</b> {detail.providerRef || '—'}</p>
                <p><b>Attempts:</b> {detail.attempts}</p>
                <p><b>Sent:</b> {fmtDateTime(detail.sentAt)}</p>
                <p><b>Delivered:</b> {fmtDateTime(detail.deliveredAt)}</p>
              </div>
              {detail.error && <p className="text-xs text-rose-600 rounded-lg bg-rose-50 border border-rose-100 p-2">{detail.error}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =========================== DELIVERY REPORTS ===========================

interface DeliveryData {
  totals: { totalSent: number; delivered: number; pending: number; failed: number; queued: number; deliveredPct: number; failedPct: number };
  byType: { type: string; count: number }[];
  byAutomation: { name: string; count: number }[];
}

export function DeliveryReportsView() {
  const [data, setData] = useState<DeliveryData | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      setData(await api<DeliveryData>(`/api/sms/delivery?${params}`));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spinner />;
  if (!data) return <EmptyState title="No data" />;

  const t = data.totals;
  const pct = (n: number) => t.totalSent ? Math.round((n / t.totalSent) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Delivery Reports"
        subtitle="Delivery performance across all outgoing messages"
        actions={
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
          </div>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <StatCard label="Total Sent" value={t.totalSent} icon={<Mail className="h-5 w-5" />} />
        <StatCard label="Delivered" value={t.delivered} icon={<MailCheck className="h-5 w-5" />} tone="emerald" sub={`${t.deliveredPct}%`} />
        <StatCard label="Pending" value={t.pending} icon={<Clock3 className="h-5 w-5" />} tone="amber" sub="awaiting delivery report" />
        <StatCard label="Failed" value={t.failed} icon={<MailX className="h-5 w-5" />} tone="rose" sub={`${t.failedPct}%`} />
        <StatCard label="Queued" value={t.queued} icon={<Clock3 className="h-5 w-5" />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="text-base">Delivery funnel</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Delivered', value: t.delivered, color: 'bg-emerald-500' },
              { label: 'Pending (sent, awaiting report)', value: t.pending, color: 'bg-amber-400' },
              { label: 'Failed', value: t.failed, color: 'bg-rose-500' },
              { label: 'Queued', value: t.queued, color: 'bg-slate-300' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{row.label}</span><b className="tabular-nums">{row.value} ({pct(row.value)}%)</b></div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${row.color} transition-all`} style={{ width: `${pct(row.value)}%` }} />
                </div>
              </div>
            ))}
            {t.totalSent === 0 && <p className="text-xs text-slate-400">No messages in the selected period.</p>}
          </CardContent>
        </Card>
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="text-base">By automation</CardTitle></CardHeader>
          <CardContent>
            {data.byAutomation.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No automated messages yet.</p> : (
              <div className="space-y-2">
                {data.byAutomation.map(a => (
                  <div key={a.name} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <span className="text-sm font-medium">{a.name}</span>
                    <Badge variant="outline" className="bg-emerald-50 text-primary border-emerald-200">{a.count} messages</Badge>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-4">By type: {data.byType.map(x => `${x.type}: ${x.count}`).join(' · ') || '—'}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
