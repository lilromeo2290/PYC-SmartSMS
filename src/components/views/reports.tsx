'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState, Spinner, downloadCsv } from '@/components/shared';
import { api } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Download, FileBarChart } from 'lucide-react';

const REPORTS = [
  { id: 'members', label: 'Member Report' },
  { id: 'birthdays', label: 'Birthday Report' },
  { id: 'meetings', label: 'Meeting Report' },
  { id: 'events', label: 'Event Report' },
  { id: 'sms_usage', label: 'SMS Usage Report' },
  { id: 'sms_delivery', label: 'SMS Delivery Report' },
  { id: 'automations', label: 'Automation Report' },
];

interface ReportData {
  type: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

export function ReportsView() {
  const [type, setType] = useState('members');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      setData(await api<ReportData>(`/api/reports?${params}`));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [type, from, to]);
  useEffect(() => { load(); }, [load]);

  const dateFilters = ['sms_usage', 'sms_delivery'].includes(type);

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Operational and delivery intelligence — filter and export to CSV"
        actions={data && data.rows.length > 0 ? (
          <Button variant="outline" onClick={() => downloadCsv(`pyc-${type}-report.csv`, data.columns, data.rows)}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        ) : undefined}
      />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {REPORTS.map(r => (
          <button key={r.id} onClick={() => setType(r.id)}
            className={`inline-flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 font-medium transition-colors ${type === r.id ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40'}`}>
            <FileBarChart className="h-3.5 w-3.5" /> {r.label}
          </button>
        ))}
      </div>
      {dateFilters && (
        <div className="flex gap-2 mb-4">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-44" />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-44" />
        </div>
      )}
      <Card className="border-slate-200/80">
        <CardContent className="p-0">
          {loading ? <Spinner /> : !data || data.rows.length === 0 ? <EmptyState title="No data for this report" /> : (
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0"><tr className="bg-slate-50/95 backdrop-blur border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  {data.columns.map(c => <th key={c.key} className="px-4 py-3 font-semibold whitespace-nowrap">{c.label}</th>)}
                </tr></thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-accent/50">
                      {data.columns.map(c => (
                        <td key={c.key} className="px-4 py-2.5 whitespace-nowrap max-w-[280px] truncate" title={String(row[c.key] ?? '')}>
                          {row[c.key] === true ? 'Yes' : row[c.key] === false ? 'No' : String(row[c.key] ?? '—') || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
