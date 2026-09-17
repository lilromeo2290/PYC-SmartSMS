'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PageHeader, EmptyState, Spinner, StatCard } from '@/components/shared';
import { api, can, fmtDateTime, CurrentUser } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Save, FlaskConical, Radio, ShieldCheck, Braces, Users as UsersIcon, Clock, Cpu } from 'lucide-react';

// =================== SMS PROVIDER ===================

interface ProviderSummary {
  providerType: string; name: string; apiUrl?: string; apiMethod?: string; senderId?: string;
  username?: string; paramTpl?: string; hasApiKey: boolean; hasPassword: boolean; isActive?: boolean;
  creditExpiresAt?: string;
}

export function ProviderSettingsView({ user }: { user: CurrentUser }) {
  const [provider, setProvider] = useState<ProviderSummary | null>(null);
  const [form, setForm] = useState({ providerType: 'simulator', name: '', apiUrl: '', apiMethod: 'GET', senderId: '', username: '', apiKey: '', password: '', paramTpl: '', creditExpiresAt: '' });
  const [testPhone, setTestPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api<{ provider: ProviderSummary }>('/api/settings/provider');
    setProvider(d.provider);
    setForm({
      providerType: d.provider.providerType, name: d.provider.name, apiUrl: d.provider.apiUrl || '',
      apiMethod: d.provider.apiMethod || 'GET', senderId: d.provider.senderId || '', username: d.provider.username || '',
      apiKey: '', password: '', paramTpl: d.provider.paramTpl || '', creditExpiresAt: d.provider.creditExpiresAt || '',
    });
  }, []);
  useEffect(() => { load().catch(e => toast.error(e.message)); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/settings/provider', { method: 'PATCH', json: form });
      toast.success('Provider configuration saved — credentials are encrypted at rest.');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const sendTest = async () => {
    setTestBusy(true);
    try {
      const r = await api<{ result: { ok: boolean; ref?: string; error?: string } }>('/api/settings/provider/test', { method: 'POST', json: { phone: testPhone } });
      if (r.result.ok) toast.success(`Test accepted by gateway — ref ${r.result.ref}`);
      else toast.error(r.result.error || 'Test failed');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setTestBusy(false); }
  };

  if (!provider) return <Spinner />;

  return (
    <div>
      <PageHeader title="SMS Provider" subtitle="Gateway configuration — secrets are AES-256-GCM encrypted and never exposed to the browser" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 border-slate-200/80">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Radio className="h-4 w-4 text-primary" /> Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Provider Type</Label>
              <Select value={form.providerType} onValueChange={v => setForm({ ...form, providerType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bms">BMS Africa — app.bms.africa (mNotify gateway)</SelectItem>
                  <SelectItem value="simulator">Built-in Simulator (demo gateway)</SelectItem>
                  <SelectItem value="generic_http">Generic HTTP Gateway (custom)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Display Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            {form.providerType === 'generic_http' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5 col-span-2"><Label>API URL</Label><Input value={form.apiUrl} onChange={e => setForm({ ...form, apiUrl: e.target.value })} placeholder="https://sms-gateway.example.com/api/send" /></div>
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={form.apiMethod} onValueChange={v => setForm({ ...form, apiMethod: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Parameter template</Label>
                  <Input value={form.paramTpl} onChange={e => setForm({ ...form, paramTpl: e.target.value })} placeholder="apikey={apikey}&sender={sender}&to={phone}&message={message}" className="font-mono text-xs" />
                  <p className="text-xs text-slate-400">Placeholders: {'{phone} {message} {sender} {apikey} {username} {password}'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>API Key {provider.hasApiKey && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-primary border-emerald-200">saved ✓ encrypted</Badge>}</Label><Input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder={provider.hasApiKey ? '•••••••• (leave blank to keep)' : 'API key'} /></div>
                  <div className="space-y-1.5"><Label>Username</Label><Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Password {provider.hasPassword && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-primary border-emerald-200">saved ✓ encrypted</Badge>}</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={provider.hasPassword ? '•••••••• (leave blank to keep)' : 'Password'} /></div>
                  <div className="space-y-1.5"><Label>Default Sender ID</Label><Input value={form.senderId} onChange={e => setForm({ ...form, senderId: e.target.value })} placeholder="PYC-CLUB" /></div>
                </div>
              </>
            )}
            {form.providerType === 'bms' && (
              <>
                <div className="rounded-lg bg-accent border border-primary/20 p-3 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-primary">BMS Africa — Bulk SMS platform (app.bms.africa)</p>
                  <p>Messages are sent via the mNotify REST API v2 (<code>POST https://api.mnotify.com/api/sms/quick</code>). Ghana numbers are delivered in local format (0XXXXXXXXX). Get your API key from your dashboard at <span className="font-mono">app.bms.africa</span>.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>API Key {provider.hasApiKey && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-primary border-emerald-200">saved ✓ encrypted</Badge>}</Label><Input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder={provider.hasApiKey ? '•••••••• (leave blank to keep)' : 'Your BMS API key'} /></div>
                  <div className="space-y-1.5"><Label>Sender ID (max 11 chars)</Label><Input value={form.senderId} onChange={e => setForm({ ...form, senderId: e.target.value })} placeholder="PYC-CLUB" maxLength={11} />
                  <p className="text-xs text-slate-400">Must be a Sender ID registered/approved on your BMS account.</p></div>
                </div>
                <div className="space-y-1.5 max-w-xs"><Label>SMS credit expiry date</Label><Input type="date" value={form.creditExpiresAt} onChange={e => setForm({ ...form, creditExpiresAt: e.target.value })} />
                  <p className="text-xs text-slate-400">Shown boldly on the dashboard — copy it from your BMS dashboard bundle info.</p></div>
              </>
            )}
            {form.providerType === 'simulator' && (
              <div className="space-y-1.5">
                <Label>Default Sender ID</Label>
                <Input value={form.senderId} onChange={e => setForm({ ...form, senderId: e.target.value })} placeholder="PYC-CLUB" />
                <p className="text-xs text-slate-400">The simulator accepts every message and resolves delivery after ~20 seconds (96% delivered) so all reporting flows can be demonstrated without a paid gateway.</p>
              </div>
            )}
            <div className="flex gap-2">
              {can(user, 'settings.sms') && <Button className="bg-primary hover:bg-primary/90" onClick={save} disabled={busy}><Save className="h-4 w-4 mr-1.5" /> Save Configuration</Button>}
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 border-slate-200/80 h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" /> Test gateway</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Phone e.g. 0241234567" />
            <Button variant="outline" className="w-full" onClick={sendTest} disabled={testBusy || !testPhone}>{testBusy ? 'Sending…' : 'Send Test SMS'}</Button>
            <div className="rounded-lg bg-slate-50 border p-3 text-xs text-slate-500 space-y-1.5">
              <p className="flex items-center gap-1.5 font-semibold text-slate-700"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Security</p>
              <p>API key and password are stored AES-256-GCM encrypted server-side. They are write-only from this screen and are never returned to any browser.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =================== SMS VARIABLES ===================

interface SmsVariableRow { key: string; display: string; source: string; description: string; exampleValue: string; isActive: boolean }

export function VariablesSettingsView({ user }: { user: CurrentUser }) {
  const [vars, setVars] = useState<SmsVariableRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ variables: SmsVariableRow[] }>('/api/variables');
      setVars(d.variables);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (v: SmsVariableRow) => {
    try { await api('/api/variables', { method: 'PATCH', json: { key: v.key, isActive: !v.isActive } }); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const sources = [...new Set(vars.map(v => v.source))];

  return (
    <div>
      <PageHeader title="SMS Variables" subtitle="The variable resolver is driven by this catalog — source-defined, resolved server-side with real data" />
      {loading ? <Spinner /> : (
        <div className="space-y-6">
          {sources.map(src => (
            <Card key={src} className="border-slate-200/80">
              <CardHeader className="pb-3"><CardTitle className="text-base capitalize flex items-center gap-2"><Braces className="h-4 w-4 text-primary" /> {src} variables</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
                      <th className="px-3 py-2 font-semibold">Variable</th>
                      <th className="px-3 py-2 font-semibold">Display Name</th>
                      <th className="px-3 py-2 font-semibold hidden md:table-cell">Description</th>
                      <th className="px-3 py-2 font-semibold">Example</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr></thead>
                    <tbody>
                      {vars.filter(v => v.source === src).map(v => (
                        <tr key={v.key} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-primary font-semibold">{`{{${v.key}}}`}</td>
                          <td className="px-3 py-2">{v.display}</td>
                          <td className="px-3 py-2 hidden md:table-cell text-xs text-slate-500">{v.description}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">{v.exampleValue}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Switch checked={v.isActive} onCheckedChange={() => toggle(v)} disabled={!can(user, 'variables.manage')} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =================== CLUB INFORMATION ===================

interface ClubInfoRow { name: string; shortName: string; phone?: string; email?: string; address?: string; website?: string; logoUrl?: string; senderName: string }

export function ClubSettingsView({ user }: { user: CurrentUser }) {
  const [form, setForm] = useState<ClubInfoRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api<{ club: ClubInfoRow }>('/api/settings/club');
    setForm(d.club);
  }, []);
  useEffect(() => { load().catch(e => toast.error(e.message)); }, [load]);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await api('/api/settings/club', { method: 'PATCH', json: form });
      toast.success('Club information saved — {{club_name}} now resolves to the updated name.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  if (!form) return <Spinner />;
  const fields: [keyof ClubInfoRow, string, string?][] = [
    ['name', 'Club Name'], ['shortName', 'Short Name'], ['phone', 'Phone'], ['email', 'Email'],
    ['address', 'Address'], ['website', 'Website'], ['logoUrl', 'Logo URL'], ['senderName', 'Default SMS Sender Name'],
  ];

  return (
    <div>
      <PageHeader title="Club Information" subtitle="Used by the variable engine — {{club_name}} resolves from here" />
      <Card className="border-slate-200/80 max-w-3xl">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} disabled={!can(user, 'settings.club')} />
              </div>
            ))}
          </div>
          {can(user, 'settings.club') && (
            <Button className="mt-5 bg-primary hover:bg-primary/90" onClick={save} disabled={busy}><Save className="h-4 w-4 mr-1.5" /> Save Club Information</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =================== USERS & PERMISSIONS ===================

interface UserRow { id: string; username: string; email?: string | null; fullName: string; role: string; isActive: boolean; lastLoginAt?: string | null }
interface PermissionDef { key: string; module: string; description: string }
interface PermissionsData {
  permissions: PermissionDef[]; roles: string[]; roleLabels: Record<string, string>;
  matrix: Record<string, Record<string, boolean>>;
}

export function UsersSettingsView({ user }: { user: CurrentUser }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [perms, setPerms] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', fullName: '', email: '', role: 'VIEWER', password: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([api<{ users: UserRow[] }>('/api/users'), api<PermissionsData>('/api/permissions')]);
      setUsers(u.users); setPerms(p);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    setBusy(true);
    try {
      await api('/api/users', { method: 'POST', json: form });
      toast.success('User created');
      setOpen(false); setForm({ username: '', fullName: '', email: '', role: 'VIEWER', password: '' });
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const toggleActive = async (u: UserRow) => {
    try { await api(`/api/users/${u.id}`, { method: 'PATCH', json: { isActive: !u.isActive } }); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const setRole = async (u: UserRow, role: string) => {
    try { await api(`/api/users/${u.id}`, { method: 'PATCH', json: { role } }); toast.success(`${u.username} is now ${role}`); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const toggleMatrix = async (role: string, permissionKey: string, allowed: boolean) => {
    try { await api('/api/permissions', { method: 'PATCH', json: { role, permissionKey, allowed } }); setPerms(p => p ? { ...p, matrix: { ...p.matrix, [role]: { ...p.matrix[role], [permissionKey]: allowed } } } : p); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  if (loading) return <Spinner />;
  if (!perms) return <EmptyState title="No data" />;

  const modules = [...new Set(perms.permissions.map(p => p.module))];

  return (
    <div>
      <PageHeader
        title="Users & Permissions"
        subtitle="Role-based access — database-driven, enforced server-side on every API call"
        actions={can(user, 'users.manage') ? <Button className="bg-primary hover:bg-primary/90" onClick={() => setOpen(true)}><UsersIcon className="h-4 w-4 mr-1.5" /> Add User</Button> : undefined}
      />
      <Card className="border-slate-200/80 mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-base">Users</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50/80 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Last login</th>
                <th className="px-4 py-3 font-semibold">Active</th>
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.fullName}</p>
                      <p className="text-xs text-slate-400">{u.username}{u.email ? ` · ${u.email}` : ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Select value={u.role} onValueChange={v => setRole(u, v)} disabled={!can(user, 'users.manage')}>
                        <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                        <SelectContent>{perms.roles.map(r => <SelectItem key={r} value={r}>{perms.roleLabels[r] || r}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'never'}</td>
                    <td className="px-4 py-3">
                      <Switch checked={u.isActive} onCheckedChange={() => toggleActive(u)} disabled={!can(user, 'users.manage') || u.id === user.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80">
        <CardHeader className="pb-3"><CardTitle className="text-base">Permission matrix (roles × permissions)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b">
                <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase">Permission</th>
                {perms.roles.map(r => <th key={r} className="px-2 py-2 font-semibold text-slate-600">{perms.roleLabels[r]?.split(' ')[0] || r}</th>)}
              </tr></thead>
              <tbody>
                {modules.map(mod => (
                  <>
                    <tr key={mod} className="bg-slate-50/70">
                      <td colSpan={perms.roles.length + 1} className="px-3 py-1.5 font-bold text-slate-600 uppercase text-[10px] tracking-wider">{mod}</td>
                    </tr>
                    {perms.permissions.filter(p => p.module === mod).map(p => (
                      <tr key={p.key} className="border-b last:border-0">
                        <td className="px-3 py-1.5">
                          <span className="font-mono text-primary">{p.key}</span>
                          <span className="text-slate-400 ml-2">{p.description}</span>
                        </td>
                        {perms.roles.map(r => (
                          <td key={r} className="px-2 py-1.5 text-center">
                            <Checkbox
                              checked={perms.matrix[r]?.[p.key] ?? false}
                              onCheckedChange={c => toggleMatrix(r, p.key, !!c)}
                              disabled={!can(user, 'users.manage')}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">Changes take effect immediately — the server validates permissions on every API request (frontend hiding is only cosmetic).</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5"><Label>Username *</Label><Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Full Name *</Label><Input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{perms.roles.map(r => <SelectItem key={r} value={r}>{perms.roleLabels[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Password * (min 8 chars)</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={createUser} disabled={busy || !form.username || !form.fullName || form.password.length < 8}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =================== SCHEDULER STATUS (used on automation page) ===================

export function SchedulerCard() {
  const [status, setStatus] = useState<{ started: boolean; lastTick: string | null; tickCount: number; intervalMs: number; timezone: string } | null>(null);
  const [now, setNow] = useState<{ dateStr: string; timeStr: string } | null>(null);

  useEffect(() => {
    const load = () => api<{ scheduler: typeof status; now: typeof now }>('/api/scheduler').then(d => { setStatus(d.scheduler); setNow(d.now); }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (!status) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <StatCard label="Engine" value={status.started ? 'RUNNING' : 'STOPPED'} icon={<Cpu className="h-5 w-5" />} tone={status.started ? 'emerald' : 'rose'} />
      <StatCard label="Server time (Accra)" value={now?.timeStr || '—'} icon={<Clock className="h-5 w-5" />} sub={now?.dateStr} />
      <StatCard label="Ticks completed" value={status.tickCount} icon={<RefreshCwHorizontal />} sub={`every ${status.intervalMs / 1000}s`} />
      <StatCard label="Timezone" value={status.timezone} icon={<Clock className="h-5 w-5" />} />
    </div>
  );
}

function RefreshCwHorizontal() { return <Cpu className="h-5 w-5" />; }
