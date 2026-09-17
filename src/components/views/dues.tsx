'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { StatusBadge, PageHeader, EmptyState, Spinner, StatCard } from '@/components/shared';
import { api, can, fmtDate, fmtTime12, CurrentUser, DuesRecord, Member, SmsTemplate } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Wallet, Plus, Play, Trash2, Receipt } from 'lucide-react';

export function DuesView({ user }: { user: CurrentUser }) {
  const [dues, setDues] = useState<DuesRecord[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [auto, setAuto] = useState<{ id: string; status: string; config: string; templateId: string | null } | null>(null);
  const [sendTime, setSendTime] = useState('09:30');
  const [offsets, setOffsets] = useState<number[]>([3, 0]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({ memberId: '', amount: '', currency: 'GHS', dueDate: '', period: '', reminderDate: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, a, autos, t] = await Promise.all([
        api<{ dues: DuesRecord[] }>('/api/dues'),
        api<{ members: Member[] }>('/api/members?pageSize=200&status=ACTIVE'),
        api<{ automations: { id: string; status: string; config: string; templateId: string | null; triggerType: string }[] }>('/api/automations'),
        api<{ templates: SmsTemplate[] }>('/api/templates?category=DUES'),
      ]);
      setDues(d.dues); setMembers(a.members); setTemplates(t.templates);
      const duesAuto = autos.automations.find(x => x.triggerType === 'DUES');
      setAuto(duesAuto || null);
      if (duesAuto) {
        const cfg = JSON.parse(duesAuto.config || '{}');
        setSendTime(cfg.sendTime || '09:30'); setOffsets(cfg.offsets || [3, 0]);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveAuto = async () => {
    if (!auto) return;
    try {
      await api(`/api/automations/${auto.id}`, { method: 'PATCH', json: { config: { sendTime, offsets } } });
      toast.success('Dues reminder configuration saved');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const toggleAuto = async () => {
    if (!auto) return;
    try { await api(`/api/automations/${auto.id}/toggle`, { method: 'POST' }); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const runNow = async () => {
    if (!auto) return;
    setRunning(true);
    try {
      const r = await api<{ summary: { sent: number; failed: number; skipped: number; duplicates: number } }>(`/api/automations/${auto.id}/run`, { method: 'POST', json: {} });
      toast.success(`Sent ${r.summary.sent}, skipped ${r.summary.skipped}, duplicates ${r.summary.duplicates}`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setRunning(false); }
  };

  const addDues = async () => {
    setBusy(true);
    try {
      await api('/api/dues', { method: 'POST', json: { ...form, amount: parseFloat(form.amount) } });
      toast.success('Dues record created');
      setOpen(false); setForm({ memberId: '', amount: '', currency: 'GHS', dueDate: '', period: '', reminderDate: '' });
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const markPaid = async (d: DuesRecord) => {
    try { await api(`/api/dues/${d.id}`, { method: 'PATCH', json: { paymentStatus: 'PAID' } }); toast.success('Marked as paid'); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const remove = async (d: DuesRecord) => {
    if (!confirm('Delete this dues record?')) return;
    try { await api(`/api/dues/${d.id}`, { method: 'DELETE' }); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const unpaid = dues.filter(d => d.paymentStatus !== 'PAID');
  const overdue = unpaid.filter(d => d.dueDate < new Date().toISOString().slice(0, 10));

  return (
    <div>
      <PageHeader
        title="Dues Reminders"
        subtitle="Per-member dues with individual amounts — reminders fire automatically (Africa/Accra)"
        actions={
          <div className="flex items-center gap-2">
            {auto && (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                <span className="text-xs font-medium text-slate-600">{auto.status}</span>
                <Switch checked={auto.status === 'ACTIVE'} onCheckedChange={toggleAuto} disabled={!can(user, 'automation.activate')} />
              </div>
            )}
            {can(user, 'automation.run') && auto && <Button variant="outline" onClick={runNow} disabled={running}><Play className="h-4 w-4 mr-1.5" /> Run now</Button>}
            {can(user, 'dues.manage') && <Button className="bg-primary hover:bg-primary/90" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Dues</Button>}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Unpaid Records" value={unpaid.length} icon={<Wallet className="h-5 w-5" />} tone="amber" />
        <StatCard label="Overdue" value={overdue.length} icon={<Receipt className="h-5 w-5" />} tone="rose" />
        <StatCard label="Total Records" value={dues.length} icon={<Receipt className="h-5 w-5" />} />
      </div>

      {auto && (
        <Card className="border-slate-200/80 mb-6">
          <CardHeader className="pb-3"><CardTitle className="text-base">Reminder automation</CardTitle></CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="space-y-1.5">
              <Label>Send time (Accra)</Label>
              <Input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} className="w-36" disabled={!can(user, 'automation.edit')} />
            </div>
            <div className="space-y-1.5">
              <Label>Remind</Label>
              <div className="flex gap-2">
                {[7, 3, 1, 0].map(o => (
                  <button key={o} onClick={() => setOffsets(offsets.includes(o) ? offsets.filter(x => x !== o) : [...offsets, o])}
                    className={`text-xs rounded-full border px-3 py-1.5 font-medium transition-colors ${offsets.includes(o) ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'}`}>
                    {o === 0 ? 'Due day' : `${o}d before`}
                  </button>
                ))}
              </div>
            </div>
            {can(user, 'automation.edit') && <Button variant="outline" onClick={saveAuto}>Save</Button>}
            <p className="text-xs text-slate-400 sm:ml-auto max-w-xs">Each member is reminded with their own amount: &quot;…your PYC contribution of GH₵{'{{amount}}'} is due on {'{{due_date}}'}&quot;.</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200/80">
        <CardContent className="p-0">
          {loading ? <Spinner /> : dues.length === 0 ? <EmptyState title="No dues records" hint="Add individual dues per member — amounts can differ." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 font-semibold">Due Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">SMS</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr></thead>
                <tbody>
                  {dues.map(d => (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{d.member?.firstName} {d.member?.lastName}</p>
                        <p className="text-xs text-slate-400">{d.member?.memberCode}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{d.currency === 'GHS' ? 'GH₵' : d.currency}{d.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-600">{d.period || '—'}</td>
                      <td className="px-4 py-3">{fmtDate(d.dueDate)}</td>
                      <td className="px-4 py-3"><StatusBadge status={d.paymentStatus} /></td>
                      <td className="px-4 py-3 text-xs">{d.member?.smsPermission ? <span className="text-primary">Eligible</span> : <span className="text-slate-400">Skipped (opted out)</span>}</td>
                      <td className="px-4 py-3 text-right">
                        {can(user, 'dues.manage') && (
                          <div className="flex justify-end gap-1">
                            {d.paymentStatus !== 'PAID' && <Button variant="outline" size="sm" onClick={() => markPaid(d)}>Mark paid</Button>}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(d)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                          </div>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Dues Record</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Member *</Label>
              <Select value={form.memberId || 'none'} onValueChange={v => setForm({ ...form, memberId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select member…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="none" disabled>Select member…</SelectItem>
                  {members.map(m => <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.memberCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Amount *</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="50.00" /></div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="GHS">GH₵ (GHS)</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Due Date *</Label><Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Reminder Date (optional)</Label><Input type="date" value={form.reminderDate} onChange={e => setForm({ ...form, reminderDate: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Period</Label><Input value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="e.g. September 2026" /></div>
            <p className="text-xs text-slate-400">Note: every member can have a different amount and due date — the automation resolves {'{{amount}}'} and {'{{due_date}}'} per record.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={addDues} disabled={busy || !form.memberId || !form.amount || !form.dueDate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
