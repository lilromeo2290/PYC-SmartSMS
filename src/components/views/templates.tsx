'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, PageHeader, EmptyState, Spinner } from '@/components/shared';
import { api, can, CurrentUser, SmsTemplate } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Plus, Pencil, Copy, Power, Trash2, Eye, Send, FlaskConical } from 'lucide-react';

const CATEGORIES = ['BIRTHDAY', 'MEETING', 'EVENT', 'DUES', 'GENERAL', 'CUSTOM'];

export function TemplatesView({ user }: { user: CurrentUser }) {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SmsTemplate | null>(null);
  const [form, setForm] = useState({ name: '', category: 'GENERAL', message: '', status: 'ACTIVE' });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ text: string; unresolved: string[] } | null>(null);
  const [testOpen, setTestOpen] = useState<SmsTemplate | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ templates: SmsTemplate[] }>(`/api/templates${category ? `?category=${category}` : ''}`);
      setTemplates(d.templates);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [category]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await api(`/api/templates/${editing.id}`, { method: 'PATCH', json: form });
      else await api('/api/templates', { method: 'POST', json: form });
      toast.success(editing ? 'Template updated' : 'Template created');
      setOpen(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const duplicate = async (t: SmsTemplate) => {
    try { await api(`/api/templates/${t.id}/duplicate`, { method: 'POST' }); toast.success('Template duplicated'); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const toggle = async (t: SmsTemplate) => {
    try { await api(`/api/templates/${t.id}`, { method: 'PATCH', json: { status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const remove = async (t: SmsTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try { await api(`/api/templates/${t.id}`, { method: 'DELETE' }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const doPreview = async () => {
    try {
      const ctx: Record<string, string> = { message: form.message };
      const d = await api<{ preview: string; unresolved: string[] }>('/api/sms/preview', { method: 'POST', json: ctx });
      setPreview({ text: d.preview, unresolved: d.unresolved });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const sendTest = async () => {
    if (!testOpen) return;
    setTestBusy(true);
    try {
      const r = await api<{ result: { status: string } }>('/api/templates/test', { method: 'POST', json: { templateId: testOpen.id, phone: testPhone } });
      if (r.result.status === 'SENT') toast.success('Test SMS sent to gateway.'); else toast.error('Test SMS failed.');
      setTestOpen(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setTestBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="Message Templates"
        subtitle="Reusable, variable-driven SMS templates — duplicate, preview and test them"
        actions={can(user, 'templates.create') ? (
          <Button className="bg-primary hover:bg-primary/90" onClick={() => { setEditing(null); setForm({ name: '', category: 'GENERAL', message: '', status: 'ACTIVE' }); setPreview(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New Template
          </Button>
        ) : undefined}
      />
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button onClick={() => setCategory('')} className={`text-xs rounded-full border px-3 py-1.5 font-medium ${category === '' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'}`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCategory(c)} className={`text-xs rounded-full border px-3 py-1.5 font-medium ${category === c ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'}`}>{c}</button>
        ))}
      </div>
      {loading ? <Spinner /> : templates.length === 0 ? <EmptyState title="No templates" hint="Create reusable templates with {{variables}}." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map(t => (
            <Card key={t.id} className="border-slate-200/80 flex flex-col">
              <CardContent className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{t.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant="outline" className="text-[10px] bg-slate-50">{t.category}</Badge>
                      <StatusBadge status={t.status} />
                      <span className="text-[10px] text-slate-400">used {t.usageCount}×</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3 whitespace-pre-wrap line-clamp-5 flex-1">{t.message}</p>
                <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t">
                  {can(user, 'templates.edit') && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditing(t); setForm({ name: t.name, category: t.category, message: t.message, status: t.status }); setPreview(null); setOpen(true); }}><Pencil className="h-3 w-3 mr-1" /> Edit</Button>}
                  {can(user, 'templates.create') && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => duplicate(t)}><Copy className="h-3 w-3 mr-1" /> Duplicate</Button>}
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTestOpen(t)}><FlaskConical className="h-3 w-3 mr-1" /> Test SMS</Button>
                  {can(user, 'templates.edit') && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggle(t)}><Power className="h-3 w-3 mr-1" /> {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button>}
                  {can(user, 'templates.delete') && <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-500" onClick={() => remove(t)}><Trash2 className="h-3 w-3 mr-1" /></Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* editor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5"><Label>Template Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Message *</Label>
              <Textarea rows={8} value={form.message} onChange={e => { setForm({ ...form, message: e.target.value }); setPreview(null); }} placeholder="Dear {{first_name}}, …" />
              <div className="flex flex-wrap gap-1">
                {['first_name', 'member_name', 'member_id', 'event_name', 'event_date', 'event_time', 'event_location', 'meeting_name', 'meeting_date', 'meeting_time', 'meeting_location', 'amount', 'due_date', 'club_name'].map(v => (
                  <button key={v} type="button" onClick={() => setForm({ ...form, message: form.message + `{{${v}}}` })}
                    className="text-[11px] rounded bg-accent border border-primary/20 text-primary px-1.5 py-0.5 hover:bg-primary/10 font-mono">{`{{${v}}}`}</button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={doPreview}><Eye className="h-3.5 w-3.5 mr-1" /> Preview</Button>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="INACTIVE">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            {preview && (
              <div className="sm:col-span-2">
                <div className="rounded-2xl bg-[#0E1A62] text-blue-50 p-4 whitespace-pre-wrap text-sm">{preview.text}</div>
                {preview.unresolved.length > 0 && <p className="text-xs text-amber-600 mt-1">Unresolved: {preview.unresolved.join(', ')} (context-dependent — resolved when the automation runs)</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={busy || !form.name.trim() || !form.message.trim()}>{editing ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* test sms */}
      <Dialog open={!!testOpen} onOpenChange={v => !v && setTestOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send Test SMS — {testOpen?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">The message is resolved with a sample member&apos;s data and sent through the configured provider.</p>
            <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Phone e.g. 0241234567" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(null)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={sendTest} disabled={testBusy || !testPhone}><Send className="h-4 w-4 mr-1.5" /> Send Test</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
