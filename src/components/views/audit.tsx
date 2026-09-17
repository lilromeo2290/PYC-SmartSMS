'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, EmptyState, Spinner, Pagination } from '@/components/shared';
import { api, fmtDateTime } from '@/lib/ui/client';
import { Search } from 'lucide-react';
import { toast } from 'sonner';

interface AuditRow {
  id: string; userName?: string | null; action: string; module: string;
  target?: string | null; details?: string | null; status: string; ip?: string | null; createdAt: string;
}

const MODULE_TONES: Record<string, string> = {
  AUTH: 'bg-slate-100 text-slate-600',
  MEMBERS: 'bg-emerald-50 text-primary',
  SMS: 'bg-teal-50 text-teal-700',
  AUTOMATION: 'bg-violet-50 text-violet-700',
  TEMPLATES: 'bg-amber-50 text-amber-700',
  EVENTS: 'bg-stone-100 text-stone-600',
  SETTINGS: 'bg-lime-50 text-lime-700',
  USERS: 'bg-orange-50 text-orange-700',
};

export function AuditView() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const [q, setQ] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const pageSize = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (module) params.set('module', module);
      if (q) params.set('q', q);
      const d = await api<{ logs: AuditRow[]; total: number; modules: string[] }>(`/api/audit?${params}`);
      setLogs(d.logs); setTotal(d.total); setModules(d.modules);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [page, module, q]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Audit Trail" subtitle={`${total} recorded actions — who did what, when, from where`} />
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search action, user, target…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={module || 'all'} onValueChange={v => { setModule(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card className="border-slate-200/80">
        <CardContent className="p-0">
          {loading ? <Spinner /> : logs.length === 0 ? <EmptyState title="No audit records" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-slate-50/80 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-semibold">Date / Time</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Module</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Details</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">IP</th>
                </tr></thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-600">{fmtDateTime(l.createdAt)}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">{l.userName || '—'}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{l.action}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${MODULE_TONES[l.module] || 'bg-slate-100'}`}>{l.module}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[220px]"><p className="truncate" title={l.target || ''}>{l.target || '—'}</p></td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 hidden lg:table-cell max-w-[200px]"><p className="truncate" title={l.details || ''}>{l.details || '—'}</p></td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${l.status === 'SUCCESS' ? 'text-primary' : 'text-rose-600'}`}>{l.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 hidden xl:table-cell">{l.ip || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 pb-3"><Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} /></div>
        </CardContent>
      </Card>
    </div>
  );
}
