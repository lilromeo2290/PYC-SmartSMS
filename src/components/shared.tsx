'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Inbox } from 'lucide-react';
import React from 'react';

// ============ SHARED UI ATOMS ============

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  DELIVERED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  SENT: 'bg-teal-100 text-teal-800 border-teal-200',
  SCHEDULED: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  QUEUED: 'bg-slate-100 text-slate-700 border-slate-200',
  PROCESSING: 'bg-amber-100 text-amber-800 border-amber-200',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  SKIPPED: 'bg-stone-100 text-stone-600 border-stone-200',
  FAILED: 'bg-rose-100 text-rose-800 border-rose-200',
  SUSPENDED: 'bg-rose-100 text-rose-800 border-rose-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  UNPAID: 'bg-rose-100 text-rose-800 border-rose-200',
  PARTIAL: 'bg-amber-100 text-amber-800 border-amber-200',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 border-slate-200';
  return <Badge variant="outline" className={`${style} font-semibold whitespace-nowrap`}>{status}</Badge>;
}

export function StatCard({ label, value, icon, sub, tone = 'default' }: {
  label: string; value: React.ReactNode; icon?: React.ReactNode; sub?: string;
  tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'teal' | 'violet';
}) {
  const tones: Record<string, string> = {
    default: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    teal: 'bg-teal-100 text-teal-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return (
    <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-1 truncate">{sub}</p>}
          </div>
          {icon && <div className={`rounded-xl p-2.5 shrink-0 ${tones[tone]}`}>{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-slate-100 p-4 mb-3"><Inbox className="h-7 w-7 text-slate-400" /></div>
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="text-sm text-slate-400 mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between pt-3 text-sm text-slate-500">
      <span>{total} record{total !== 1 ? 's' : ''} · page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function downloadCsv(filename: string, columns: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = [columns.map(c => esc(c.label)).join(','), ...rows.map(r => columns.map(c => esc(r[c.key])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
