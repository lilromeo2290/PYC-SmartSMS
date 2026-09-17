'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader, StatusBadge, EmptyState, Spinner } from '@/components/shared';
import { api, can, CurrentUser, Member, MemberGroup } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Plus, Pencil, Users, Trash2 } from 'lucide-react';

export function GroupsView({ user }: { user: CurrentUser }) {
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MemberGroup | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#059669');

  // member management dialog
  const [membersOpen, setMembersOpen] = useState<MemberGroup | null>(null);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [groupMembers, setGroupMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api<{ groups: MemberGroup[] }>('/api/groups'); setGroups(d.groups); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (editing) await api(`/api/groups/${editing.id}`, { method: 'PATCH', json: { name, description, color } });
      else await api('/api/groups', { method: 'POST', json: { name, description, color } });
      toast.success(editing ? 'Group updated' : 'Group created');
      setDialogOpen(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const deactivate = async (g: MemberGroup) => {
    if (!confirm(`Deactivate group "${g.name}"? Members remain, but the group won't be selectable.`)) return;
    try { await api(`/api/groups/${g.id}`, { method: 'DELETE' }); toast.success('Group deactivated'); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const openMembers = async (g: MemberGroup) => {
    setMembersOpen(g); setSelected([]);
    try {
      const [all, inGroup] = await Promise.all([
        api<{ members: Member[] }>('/api/members?pageSize=200'),
        api<{ members: Member[] }>(`/api/groups/${g.id}/members`),
      ]);
      setAllMembers(all.members); setGroupMembers(inGroup.members);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const addSelected = async () => {
    if (!membersOpen || selected.length === 0) return;
    try {
      await api(`/api/groups/${membersOpen.id}/members`, { method: 'POST', json: { memberIds: selected } });
      toast.success(`${selected.length} member(s) added to ${membersOpen.name}`);
      openMembers(membersOpen); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const removeSelected = async () => {
    if (!membersOpen || selected.length === 0) return;
    try {
      await api(`/api/groups/${membersOpen.id}/members`, { method: 'DELETE', json: { memberIds: selected } });
      toast.success(`${selected.length} member(s) removed from ${membersOpen.name}`);
      openMembers(membersOpen); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const groupMemberIds = new Set(groupMembers.map(m => m.id));
  const candidates = allMembers.filter(m => !groupMemberIds.has(m.id) && m.status === 'ACTIVE'
    && (memberSearch === '' || `${m.firstName} ${m.lastName}`.toLowerCase().includes(memberSearch.toLowerCase()) || m.memberCode.toLowerCase().includes(memberSearch.toLowerCase())));

  return (
    <div>
      <PageHeader
        title="Member Groups"
        subtitle="Organize members for targeted group SMS and automations"
        actions={can(user, 'groups.manage') ? (
          <Button className="bg-primary hover:bg-primary/90" onClick={() => { setEditing(null); setName(''); setDescription(''); setColor('#059669'); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Create Group
          </Button>
        ) : undefined}
      />
      {loading ? <Spinner /> : groups.length === 0 ? <EmptyState title="No groups yet" hint="Create groups like Executives, Youth Wing or Welfare Committee." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(g => (
            <Card key={g.id} className="border-slate-200/80 overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: g.color }} />
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{g.name}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2 min-h-8">{g.description || '—'}</p>
                  </div>
                  <StatusBadge status={g.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                    <Users className="h-4 w-4 text-slate-400" /> {g.memberCount ?? 0} member{(g.memberCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => openMembers(g)}>Members</Button>
                    {can(user, 'groups.manage') && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(g); setName(g.name); setDescription(g.description || ''); setColor(g.color); setDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deactivate(g)}>
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Group create/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Group' : 'Create Group'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5"><Label>Group Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Welfare Committee" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Color</Label><input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-20 rounded border cursor-pointer" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={!name.trim()}>{editing ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group members manager */}
      <Dialog open={!!membersOpen} onOpenChange={v => !v && setMembersOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Members of {membersOpen?.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto flex-1 pr-1">
            {/* current members */}
            <div className="border rounded-lg p-3">
              <p className="text-sm font-semibold mb-2 text-slate-700">In group ({groupMembers.length})</p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {groupMembers.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm rounded hover:bg-slate-50 p-1.5 cursor-pointer">
                    <Checkbox checked={selected.includes(m.id)} onCheckedChange={c => setSelected(c ? [...selected, m.id] : selected.filter(id => id !== m.id))} />
                    <span className="truncate">{m.firstName} {m.lastName}</span>
                    <span className="text-xs text-slate-400 ml-auto">{m.memberCode}</span>
                  </label>
                ))}
                {groupMembers.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No members in this group yet.</p>}
              </div>
            </div>
            {/* candidates */}
            <div className="border rounded-lg p-3">
              <p className="text-sm font-semibold mb-2 text-slate-700">Add members</p>
              <Input placeholder="Search members…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} className="mb-2 h-8" />
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {candidates.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm rounded hover:bg-slate-50 p-1.5 cursor-pointer">
                    <Checkbox checked={selected.includes(m.id)} onCheckedChange={c => setSelected(c ? [...selected, m.id] : selected.filter(id => id !== m.id))} />
                    <span className="truncate">{m.firstName} {m.lastName}</span>
                    <span className="text-xs text-slate-400 ml-auto">{m.memberCode}</span>
                  </label>
                ))}
                {candidates.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No available members.</p>}
              </div>
            </div>
          </div>
          <div className="flex justify-between pt-2 border-t">
            <Button variant="destructive" size="sm" onClick={removeSelected} disabled={selected.length === 0}>Remove selected ({selected.length})</Button>
            <Button className="bg-primary hover:bg-primary/90" size="sm" onClick={addSelected} disabled={selected.length === 0}>Add selected ({selected.length})</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
