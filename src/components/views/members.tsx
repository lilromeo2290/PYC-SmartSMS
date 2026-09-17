'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge, PageHeader, EmptyState, Spinner, Pagination } from '@/components/shared';
import { api, can, fmtDate, CurrentUser, Member, MemberGroup } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Plus, Search, Pencil, UserX, ShieldOff, ShieldCheck } from 'lucide-react';

const CATEGORIES = ['EXECUTIVE', 'GENERAL', 'PATRON', 'HONORARY', 'ASSOCIATE'];

interface FormState {
  firstName: string; middleName: string; lastName: string; phone: string; altPhone: string;
  email: string; dateOfBirth: string; gender: string; category: string; groupId: string;
  dateJoined: string; smsPermission: boolean; address: string; notes: string; status: string;
}

const EMPTY: FormState = {
  firstName: '', middleName: '', lastName: '', phone: '', altPhone: '', email: '',
  dateOfBirth: '', gender: '', category: 'GENERAL', groupId: '', dateJoined: '',
  smsPermission: true, address: '', notes: '', status: 'ACTIVE',
};

export function MembersView({ user, initialAdd }: { user: CurrentUser; initialAdd?: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set('q', q);
      if (statusFilter) params.set('status', statusFilter);
      const data = await api<{ members: Member[]; total: number }>(`/api/members?${params}`);
      setMembers(data.members); setTotal(data.total);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load members'); }
    finally { setLoading(false); }
  }, [page, q, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ groups: MemberGroup[] }>('/api/groups').then(d => setGroups(d.groups.filter(g => g.isActive))).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialAdd && can(user, 'members.create')) { setEditing(null); setForm(EMPTY); setDialogOpen(true); }
  }, [initialAdd, user]);

  const openEdit = (m: Member) => {
    setEditing(m);
    setForm({
      firstName: m.firstName, middleName: m.middleName || '', lastName: m.lastName,
      phone: m.phone.startsWith('+233') ? '0' + m.phone.slice(4) : m.phone,
      altPhone: m.altPhone || '', email: m.email || '', dateOfBirth: m.dateOfBirth,
      gender: m.gender || '', category: m.category, groupId: m.groupId || '',
      dateJoined: m.dateJoined || '', smsPermission: m.smsPermission, address: m.address || '',
      notes: m.notes || '', status: m.status,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/members/${editing.id}`, { method: 'PATCH', json: form });
        toast.success('Member updated');
      } else {
        await api('/api/members', { method: 'POST', json: form });
        toast.success('Member created');
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const deactivate = async (m: Member) => {
    if (!confirm(`Deactivate ${m.firstName} ${m.lastName}? They will stop receiving all SMS.`)) return;
    try {
      await api(`/api/members/${m.id}`, { method: 'DELETE' });
      toast.success('Member deactivated');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const toggleSms = async (m: Member) => {
    try {
      await api(`/api/members/${m.id}`, { method: 'PATCH', json: { smsPermission: !m.smsPermission } });
      toast.success(`SMS permission ${!m.smsPermission ? 'enabled' : 'disabled'} for ${m.firstName}`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <PageHeader
        title="Member Register"
        subtitle={`${total} registered members`}
        actions={can(user, 'members.create') ? (
          <Button className="bg-primary hover:bg-primary/90" onClick={() => { setEditing(null); setForm(EMPTY); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Member
          </Button>
        ) : undefined}
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search name, member ID, phone…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={statusFilter || 'all'} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-slate-200/80">
        <CardContent className="p-0">
          {loading ? <Spinner label="Loading members…" /> : members.length === 0 ? (
            <EmptyState title="No members found" hint="Adjust your search or add your first member." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Birthday</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Group</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">SMS</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{m.firstName} {m.lastName}</p>
                        <p className="text-xs text-slate-400">{m.memberCode}{m.category !== 'GENERAL' ? ` · ${m.category}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{m.phone}</td>
                      <td className="px-4 py-3 hidden md:table-cell">{m.dateOfBirth ? fmtDate(m.dateOfBirth) : '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">{m.group?.name || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-3">
                        {m.smsPermission
                          ? <Badge variant="outline" className="bg-emerald-50 text-primary border-emerald-200 text-xs">Enabled</Badge>
                          : <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-xs">Disabled</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {can(user, 'members.edit') && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(m)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {can(user, 'members.edit') && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title={m.smsPermission ? 'Disable SMS permission' : 'Enable SMS permission'} onClick={() => toggleSms(m)}>
                              {m.smsPermission ? <ShieldOff className="h-3.5 w-3.5 text-amber-600" /> : <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                            </Button>
                          )}
                          {can(user, 'members.delete') && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Deactivate" onClick={() => deactivate(m)}>
                              <UserX className="h-3.5 w-3.5 text-rose-500" />
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

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.firstName} ${editing.lastName}` : 'Add New Member'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5"><Label>First Name *</Label><Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Middle Name</Label><Input value={form.middleName} onChange={e => setForm({ ...form, middleName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Last Name *</Label><Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone Number * <span className="text-xs text-slate-400">(e.g. 0241234567)</span></Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0241234567" /></div>
            <div className="space-y-1.5"><Label>Alternative Phone</Label><Input value={form.altPhone} onChange={e => setForm({ ...form, altPhone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Date of Birth *</Label><Input type="date" value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender || 'unspecified'} onValueChange={v => setForm({ ...form, gender: v === 'unspecified' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unspecified">Not specified</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Membership Category</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={form.groupId || 'none'} onValueChange={v => setForm({ ...form, groupId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Date Joined</Label><Input type="date" value={form.dateJoined} onChange={e => setForm({ ...form, dateJoined: e.target.value })} /></div>
            {editing && (
              <div className="space-y-1.5">
                <Label>Membership Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 sm:col-span-2">
              <div>
                <p className="text-sm font-medium text-slate-800">SMS Permission</p>
                <p className="text-xs text-slate-500">Disabled members never receive automated SMS.</p>
              </div>
              <Switch checked={form.smsPermission} onCheckedChange={v => setForm({ ...form, smsPermission: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={saving || !form.firstName || !form.lastName || !form.phone || !form.dateOfBirth}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
