'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoginView } from '@/components/views/login';
import { DashboardView } from '@/components/views/dashboard';
import { MembersView } from '@/components/views/members';
import { GroupsView } from '@/components/views/groups';
import { ImportView } from '@/components/views/import';
import { SendSmsView, GroupSmsView, ScheduledSmsView, SmsHistoryView, DeliveryReportsView } from '@/components/views/sms';
import { AutomationDashboardView, BirthdayAutomationView, ReminderListView, CustomAutomationView } from '@/components/views/automation';
import { DuesView } from '@/components/views/dues';
import { TemplatesView } from '@/components/views/templates';
import { MeetingsView, EventsView } from '@/components/views/events';
import { CalendarView } from '@/components/views/calendar';
import { ReportsView } from '@/components/views/reports';
import { ProviderSettingsView, VariablesSettingsView, ClubSettingsView, UsersSettingsView } from '@/components/views/settings';
import { AuditView } from '@/components/views/audit';
import { api, can, CurrentUser } from '@/lib/ui/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Menu, LogOut, LayoutDashboard, Users, UsersRound, FileUp, Send, Users2, Clock3, History, BarChart3, Bot, Cake, CalendarClock, PartyPopper, Wallet, Sparkles, FileText, CalendarDays, PartyPopper as PartyIcon, Settings, Radio, Braces, Building2, ShieldCheck, ScrollText, ChevronDown } from 'lucide-react';

// ============ NAVIGATION (grouped per spec) ============

interface NavLeaf { key: string; label: string; perm?: string; icon?: React.ReactNode }
interface NavSection { label?: string; items: NavLeaf[] }

const NAV: NavSection[] = [
  { items: [{ key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> }] },
  {
    label: 'MEMBERS',
    items: [
      { key: 'members', label: 'Member Register', perm: 'members.view', icon: <Users className="h-4 w-4" /> },
      { key: 'members.add', label: 'Add Member', perm: 'members.create', icon: <UsersRound className="h-4 w-4" /> },
      { key: 'groups', label: 'Groups', perm: 'members.view', icon: <Users2 className="h-4 w-4" /> },
      { key: 'members.import', label: 'Import Members', perm: 'members.import', icon: <FileUp className="h-4 w-4" /> },
    ],
  },
  {
    label: 'SMS',
    items: [
      { key: 'sms.send', label: 'Send SMS', perm: 'sms.send', icon: <Send className="h-4 w-4" /> },
      { key: 'sms.group', label: 'Group SMS', perm: 'sms.group', icon: <Users2 className="h-4 w-4" /> },
      { key: 'sms.scheduled', label: 'Scheduled SMS', perm: 'sms.schedule', icon: <Clock3 className="h-4 w-4" /> },
      { key: 'sms.history', label: 'SMS History', perm: 'sms.history', icon: <History className="h-4 w-4" /> },
      { key: 'sms.delivery', label: 'Delivery Reports', perm: 'sms.reports', icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
  {
    label: 'AUTOMATION',
    items: [
      { key: 'automation', label: 'Automation Dashboard', perm: 'automation.view', icon: <Bot className="h-4 w-4" /> },
      { key: 'automation.birthday', label: 'Birthday Wishes', perm: 'automation.view', icon: <Cake className="h-4 w-4" /> },
      { key: 'automation.meeting', label: 'Meeting Reminders', perm: 'automation.view', icon: <CalendarClock className="h-4 w-4" /> },
      { key: 'automation.event', label: 'Event Reminders', perm: 'automation.view', icon: <PartyPopper className="h-4 w-4" /> },
      { key: 'automation.dues', label: 'Dues Reminders', perm: 'automation.view', icon: <Wallet className="h-4 w-4" /> },
      { key: 'automation.custom', label: 'Custom Automation', perm: 'automation.view', icon: <Sparkles className="h-4 w-4" /> },
    ],
  },
  { items: [{ key: 'templates', label: 'Message Templates', perm: 'templates.view', icon: <FileText className="h-4 w-4" /> }] },
  {
    label: 'EVENTS & MEETINGS',
    items: [
      { key: 'meetings', label: 'Meetings', perm: 'members.view', icon: <CalendarDays className="h-4 w-4" /> },
      { key: 'events', label: 'Events', perm: 'members.view', icon: <PartyIcon className="h-4 w-4" /> },
      { key: 'calendar', label: 'Calendar', perm: 'members.view', icon: <CalendarDays className="h-4 w-4" /> },
    ],
  },
  { items: [{ key: 'reports', label: 'Reports', perm: 'reports.view', icon: <BarChart3 className="h-4 w-4" /> }] },
  {
    label: 'SETTINGS',
    items: [
      { key: 'settings.provider', label: 'SMS Provider', perm: 'settings.sms', icon: <Radio className="h-4 w-4" /> },
      { key: 'settings.variables', label: 'SMS Variables', perm: 'automation.view', icon: <Braces className="h-4 w-4" /> },
      { key: 'settings.club', label: 'Club Information', perm: 'settings.club', icon: <Building2 className="h-4 w-4" /> },
      { key: 'settings.users', label: 'Users & Permissions', perm: 'users.manage', icon: <ShieldCheck className="h-4 w-4" /> },
    ],
  },
  { label: 'AUDIT', items: [{ key: 'audit', label: 'Audit Trail', perm: 'audit.view', icon: <ScrollText className="h-4 w-4" /> }] },
];

// Group labels like "members.add" open the members view with dialog — map view keys:
function viewKey(key: string): string {
  if (key === 'members.add') return 'members';
  return key;
}

export default function Home() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState('dashboard');
  const [membersAdd, setMembersAdd] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(['MEMBERS', 'SMS', 'AUTOMATION']);
  const [clock, setClock] = useState('');

  // Accra clock in the header
  useEffect(() => {
    const update = () => {
      setClock(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
    };
    update();
    const t = setInterval(update, 20000);
    return () => clearInterval(t);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const d = await api<{ user: CurrentUser }>('/api/auth/me');
      setUser(d.user);
    } catch {
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, []);
  useEffect(() => { checkAuth(); }, [checkAuth]);

  const navigate = useCallback((key: string) => {
    setView(viewKey(key));
    setMembersAdd(key === 'members.add');
    setMobileOpen(false);
  }, []);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="PYC Club logo" className="h-16 w-16 rounded-2xl shadow-md animate-pulse" />
          <p className="text-sm font-semibold text-slate-600">PYC SmartSMS</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={u => { setUser(u); setView('dashboard'); }} />;
  }

  // auto-fallback to dashboard if user lacks permission for current view
  const currentSection = NAV.flatMap(s => s.items).find(i => i.key === view);
  if (currentSection?.perm && !can(user, currentSection.perm)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4"><ShieldCheck className="h-8 w-8 text-rose-500" /></div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Permission required</h1>
          <p className="text-sm text-slate-500 mt-1">Your role ({user.role}) does not include <code className="text-primary">{currentSection.perm}</code>. Ask an administrator for access.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={() => setView('dashboard')}>Back to Dashboard</Button>
      </div>
    );
  }

  const sidebar = (
    <div className="h-full flex flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.png" alt="PYC Club logo" className="h-10 w-10 rounded-xl shadow ring-1 ring-white/20 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold text-sm tracking-tight text-white">PYC SmartSMS</p>
          <p className="text-[10px] text-blue-200/70">Progressive Youth Club, Ho</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map((section, si) => {
          const visibleItems = section.items.filter(i => !i.perm || can(user, i.perm));
          if (visibleItems.length === 0) return null;
          if (!section.label) {
            return visibleItems.map(item => <NavItem key={item.key} item={item} active={view === item.key || (item.key === 'members' && view === 'members.add')} onClick={() => navigate(item.key)} />);
          }
          const isOpen = openGroups.includes(section.label);
          const hasActive = visibleItems.some(i => i.key === view);
          return (
            <div key={si}>
              <button
                onClick={() => setOpenGroups(isOpen ? openGroups.filter(g => g !== section.label) : [...openGroups, section.label!])}
                className="w-full flex items-center justify-between px-3 pt-3 pb-1.5 text-[10px] font-bold tracking-widest text-blue-200/60 hover:text-blue-100"
              >
                {section.label}
                <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
              </button>
              {isOpen && visibleItems.map(item => (
                <NavItem key={item.key} item={item} active={hasActive && view === item.key} onClick={() => navigate(item.key)} />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
        <p className="text-[10px] text-blue-200/70">{user.role}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 fixed inset-y-0 left-0 z-30">{sidebar}</aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 [&>button]:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="PYC" className="h-8 w-8 rounded-lg lg:hidden" />
            <p className="font-semibold text-slate-800 text-sm sm:text-base truncate">
              {NAV.flatMap(s => s.items).find(i => i.key === view)?.label || 'Dashboard'}
            </p>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500 rounded-full bg-slate-100 px-2.5 py-1">
                🕐 {clock} Accra
              </span>
              <Button variant="ghost" size="sm" onClick={logout} className="text-slate-500 hover:text-rose-600">
                <LogOut className="h-4 w-4 mr-1" /> Sign out
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-5 sm:py-7 max-w-[1500px] w-full mx-auto">
          {view === 'dashboard' && <DashboardView onNavigate={navigate} />}
          {view === 'members' && <MembersView user={user} key={membersAdd ? 'add' : 'list'} initialAdd={membersAdd} />}
          {view === 'groups' && <GroupsView user={user} />}
          {view === 'members.import' && <ImportView />}
          {view === 'sms.send' && <SendSmsView user={user} />}
          {view === 'sms.group' && <GroupSmsView user={user} />}
          {view === 'sms.scheduled' && <ScheduledSmsView user={user} />}
          {view === 'sms.history' && <SmsHistoryView user={user} />}
          {view === 'sms.delivery' && <DeliveryReportsView />}
          {view === 'automation' && <AutomationDashboardView user={user} onNavigate={navigate} />}
          {view === 'automation.birthday' && <BirthdayAutomationView user={user} />}
          {view === 'automation.meeting' && <ReminderListView user={user} kind="MEETING_REMINDER" />}
          {view === 'automation.event' && <ReminderListView user={user} kind="EVENT_REMINDER" />}
          {view === 'automation.dues' && <DuesView user={user} />}
          {view === 'automation.custom' && <CustomAutomationView user={user} />}
          {view === 'templates' && <TemplatesView user={user} />}
          {view === 'meetings' && <MeetingsView user={user} />}
          {view === 'events' && <EventsView user={user} />}
          {view === 'calendar' && <CalendarView />}
          {view === 'reports' && <ReportsView />}
          {view === 'settings.provider' && <ProviderSettingsView user={user} />}
          {view === 'settings.variables' && <VariablesSettingsView user={user} />}
          {view === 'settings.club' && <ClubSettingsView user={user} />}
          {view === 'settings.users' && <UsersSettingsView user={user} />}
          {view === 'audit' && <AuditView />}
        </main>

        <footer className="mt-auto border-t border-slate-200 bg-white px-6 py-3">
          <p className="text-xs text-slate-400 text-center">PYC SmartSMS · Progressive Youth Club, Ho · We stand for support · Automation engine runs on Africa/Accra time</p>
        </footer>
      </div>
    </div>
  );
}

function NavItem({ item, active, onClick }: { item: NavLeaf; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
        active ? 'bg-[#2C46B8] text-white shadow-sm' : 'text-blue-50/80 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span className={active ? 'text-white' : 'text-blue-300/80'}>{item.icon}</span>
      {item.label}
    </button>
  );
}
