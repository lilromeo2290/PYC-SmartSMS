'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, CurrentUser } from '@/lib/ui/client';
import { Loader2, ShieldCheck, Zap, Clock } from 'lucide-react';
import { toast } from 'sonner';

export function LoginView({ onLogin }: { onLogin: (user: CurrentUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/auth/login', { method: 'POST', json: { username, password } });
      const me = await api<{ user: CurrentUser }>('/api/auth/me');
      toast.success(`Welcome back, ${me.user.fullName.split(' ')[0]}!`);
      onLogin(me.user);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#0B1348] via-[#14257F] to-[#0B1348]">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-10 text-white">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="PYC Club logo" className="h-16 w-16 rounded-2xl shadow-lg ring-1 ring-white/20" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">PYC SmartSMS</h1>
            <p className="text-blue-200/80 text-sm">Progressive Youth Club, Ho — SMS Automation Platform</p>
          </div>
        </div>
        <div className="space-y-6 max-w-md">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
            <p className="text-xs font-semibold tracking-widest text-blue-100 uppercase">We stand for support</p>
          </div>
          <h2 className="text-3xl font-bold leading-snug">One central automation engine for every message your club sends.</h2>
          <div className="space-y-4 text-blue-100/90">
            <div className="flex gap-3 items-start"><Zap className="h-5 w-5 text-amber-300 mt-0.5 shrink-0" /><p>Birthdays, meeting reminders, event alerts, dues and custom schedules — all through a single server-side engine.</p></div>
            <div className="flex gap-3 items-start"><Clock className="h-5 w-5 text-amber-300 mt-0.5 shrink-0" /><p>Runs 24/7 on Ghana time (Africa/Accra) — no browser needs to stay open.</p></div>
            <div className="flex gap-3 items-start"><ShieldCheck className="h-5 w-5 text-amber-300 mt-0.5 shrink-0" /><p>Role-based permissions, duplicate protection and a complete audit trail.</p></div>
          </div>
        </div>
        <p className="text-xs text-blue-200/50">© 2026 Progressive Youth Club · Ho, Ghana · We stand for support</p>
      </div>

      {/* Login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardHeader className="text-center pb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="PYC Club logo" className="mx-auto h-16 w-16 rounded-2xl shadow-md mb-2 lg:hidden" />
            <CardTitle className="text-2xl font-bold">Sign in to SmartSMS</CardTitle>
            <CardDescription>Use your PYC administrator account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username or email</Label>
                <Input id="username" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="admin" autoComplete="username" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password" required />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
