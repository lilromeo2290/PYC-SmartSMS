'use client';

// ============ CLIENT API HELPERS + SHARED TYPES ============

export async function api<T = unknown>(path: string, options?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = options || {};
  const res = await fetch(path, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface Member {
  id: string; memberCode: string; firstName: string; middleName?: string | null; lastName: string;
  phone: string; altPhone?: string | null; email?: string | null; dateOfBirth: string;
  gender?: string | null; category: string; groupId?: string | null; group?: MemberGroup | null;
  dateJoined?: string | null; status: string; smsPermission: boolean;
  address?: string | null; notes?: string | null; createdAt?: string;
}

export interface MemberGroup {
  id: string; name: string; description?: string | null; color: string; isActive: boolean; memberCount?: number;
}

export interface Meeting {
  id: string; name: string; date: string; startTime: string; endTime?: string | null;
  venue: string; description?: string | null; organizer?: string | null;
  targetGroupId?: string | null; targetGroup?: MemberGroup | null; status: string;
}

export interface ClubEvent {
  id: string; name: string; date: string; startTime: string; endTime?: string | null;
  venue: string; description?: string | null; eventType?: string | null;
  organizer?: string | null; targetGroupId?: string | null; targetGroup?: MemberGroup | null; status: string;
}

export interface SmsTemplate {
  id: string; name: string; category: string; message: string; status: string; usageCount: number;
}

export interface Automation {
  id: string; name: string; type: string; triggerType: string; description?: string | null;
  config: string; audienceType: string; groupId?: string | null; group?: MemberGroup | null;
  memberIds: string; meetingId?: string | null; meeting?: Meeting | null;
  eventId?: string | null; event?: ClubEvent | null; templateId?: string | null; template?: SmsTemplate | null;
  status: string; lastRunAt?: string | null;
}

export interface AutomationExecution {
  id: string; automationId?: string | null; automationName: string; dedupeKey: string;
  recipientMemberId?: string | null; recipientName: string; recipientPhone: string;
  message: string; status: string; reason?: string | null; context?: string | null;
  smsMessageId?: string | null; executedAt: string;
}

export interface ScheduledSms {
  id: string; name?: string | null; recipientCount: number; message: string;
  scheduledDate: string; scheduledTime: string; status: string; sentAt?: string | null; error?: string | null;
}

export interface SmsMessage {
  id: string; recipientName: string; recipientMemberId?: string | null; phone: string; message: string;
  type: string; automationName?: string | null; status: string; providerRef?: string | null;
  error?: string | null; attempts: number; sentAt?: string | null; deliveredAt?: string | null; createdAt: string;
}

export interface DuesRecord {
  id: string; memberId: string; amount: number; currency: string; dueDate: string;
  period?: string | null; paymentStatus: string; reminderDate?: string | null; notes?: string | null;
  member?: Pick<Member, 'id' | 'memberCode' | 'firstName' | 'lastName' | 'phone' | 'smsPermission' | 'status'>;
}

export interface NextRun {
  automationId: string; automationName: string; kind: string; icon: string; target: string;
  dateStr: string; timeStr: string; inDays: number; recipients: number;
}

export interface CurrentUser {
  id: string; username: string; fullName: string; role: string; isSuperAdmin: boolean; permissions: string[];
}

export function can(user: CurrentUser | null, perm: string): boolean {
  if (!user) return false;
  return user.isSuperAdmin || user.permissions.includes(perm);
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Software Administrator',
  SMS_MANAGER: 'SMS Manager',
  EVENT_COORDINATOR: 'Event Coordinator',
  VIEWER: 'Viewer',
};

export const TRIGGER_LABELS: Record<string, string> = {
  BIRTHDAY: 'Birthday', BEFORE_MEETING: 'Before Meeting', BEFORE_EVENT: 'Before Event',
  DUES: 'Dues', SPECIFIC_DATE: 'Specific Date', MONTHLY: 'Monthly', WEEKLY: 'Weekly', DAILY: 'Daily',
};

export function fmtDate(d: string): string {
  if (!d || d.length < 10) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[m - 1]} ${y}`;
}

export function fmtDateLong(d: string): string {
  if (!d || d.length < 10) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${day} ${months[m - 1]} ${y}`;
}

export function fmtTime12(t?: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function fmtDateTime(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
