'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, StatusBadge } from '@/components/shared';
import { api } from '@/lib/ui/client';
import { toast } from 'sonner';
import { Upload, FileUp, Download, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface ImportPreview {
  mode: string; totalRows: number; validCount: number; invalidCount: number;
  valid: ImportRow[]; invalid: ImportRow[];
}
interface ImportRow {
  row: number; firstName: string; lastName: string; phone: string; dateOfBirth: string;
  email: string; groupName: string; status: string; smsPermission: boolean;
  errors: string[]; duplicateOf?: string;
}

const SAMPLE = `First Name,Last Name,Phone,Date of Birth,Email,Group,Membership Status,SMS Permission
Yaw,Frimpong,0244001122,1998-04-12,yaw@example.com,General Members,Active,Yes
Efia,Sekyere,0559887766,2001-12-05,,Youth Wing,Active,Yes`;

export function ImportView() {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const runPreview = async () => {
    setBusy(true);
    try {
      const data = await api<ImportPreview>('/api/members/import', { method: 'POST', json: { mode: 'preview', csv } });
      setPreview(data);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Validation failed'); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    setImporting(true);
    try {
      const data = await api<{ imported: number; skipped: number }>('/api/members/import', { method: 'POST', json: { mode: 'commit', csv } });
      toast.success(`Imported ${data.imported} members — ${data.skipped} skipped (duplicates/invalid)`);
      setPreview(null); setCsv('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Import failed'); }
    finally { setImporting(false); }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(file);
  };

  return (
    <div>
      <PageHeader title="Import Members" subtitle="Bulk-import from CSV or Excel-exported CSV — validated before anything is saved" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><FileUp className="h-4 w-4 text-primary" /> Source data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label className="block text-xs text-slate-500 leading-relaxed">
              Required columns: <b>First Name, Last Name, Phone</b>. Optional: Middle Name, Date of Birth (YYYY-MM-DD or DD/MM/YYYY),
              Email, Group (must exist), Membership Status, SMS Permission. Duplicate phone numbers are detected against existing members
              <b> and within the file</b> — they are never imported automatically.
            </Label>
            <Input type="file" accept=".csv,text/csv" onChange={onFile} className="cursor-pointer" />
            <Textarea rows={10} value={csv} onChange={e => { setCsv(e.target.value); setPreview(null); }} placeholder="…or paste CSV content here" className="font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button className="bg-primary hover:bg-primary/90" onClick={runPreview} disabled={busy || !csv.trim()}>
                <Upload className="h-4 w-4 mr-1.5" /> {busy ? 'Validating…' : 'Validate & Preview'}
              </Button>
              <Button variant="outline" onClick={() => setCsv(SAMPLE)}>Load sample</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const header = 'First Name,Last Name,Phone,Date of Birth,Email,Group,Membership Status,SMS Permission';
                  const blob = new Blob([header], { type: 'text/csv' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob); a.download = 'member-import-template.csv'; a.click();
                }}
              >
                <Download className="h-4 w-4 mr-1.5" /> Template
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Validation results</CardTitle>
          </CardHeader>
          <CardContent>
            {!preview ? (
              <p className="text-sm text-slate-400 py-10 text-center">Upload or paste CSV, then click <b>Validate &amp; Preview</b>.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-slate-50 border p-3"><p className="text-2xl font-bold">{preview.totalRows}</p><p className="text-xs text-slate-500">rows found</p></div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><p className="text-2xl font-bold text-emerald-700">{preview.validCount}</p><p className="text-xs text-emerald-600">ready to import</p></div>
                  <div className="rounded-xl bg-rose-50 border border-rose-100 p-3"><p className="text-2xl font-bold text-rose-700">{preview.invalidCount}</p><p className="text-xs text-rose-600">will be skipped</p></div>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {preview.valid.slice(0, 50).map(r => (
                    <div key={`v${r.row}`} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2 bg-emerald-50/40">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-medium">{r.firstName} {r.lastName}</span>
                      <span className="text-slate-400 text-xs">{r.phone}</span>
                      {r.groupName && <StatusBadge status="ACTIVE" />}
                    </div>
                  ))}
                  {preview.invalid.slice(0, 50).map(r => (
                    <div key={`i${r.row}`} className="border border-rose-100 bg-rose-50/40 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                        <span className="font-medium">{r.firstName || '(no name)'} {r.lastName}</span>
                        <span className="text-xs text-slate-400">row {r.row}</span>
                      </div>
                      {r.duplicateOf && <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Duplicate — {r.duplicateOf}</p>}
                      {r.errors.map((er, i) => <p key={i} className="text-xs text-rose-600 mt-0.5">{er}</p>)}
                    </div>
                  ))}
                </div>
                <Button className="w-full bg-primary hover:bg-primary/90" onClick={commit} disabled={importing || preview.validCount === 0}>
                  {importing ? 'Importing…' : `Import ${preview.validCount} valid member${preview.validCount !== 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
