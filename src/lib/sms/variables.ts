import { db } from '@/lib/db';
import { formatDisplayDate, formatDisplayTime12 } from '@/lib/timezone';

// ============ VARIABLE RESOLVER ENGINE ============
// Variables are defined in the SmsVariable DB table (source-driven), resolved here
// against real member/event/meeting/dues/club data. Never sends raw {{variables}}
// when a valid value exists.

export interface MemberLike {
  memberCode?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  phone?: string;
  email?: string | null;
  dateOfBirth?: string;
  status?: string;
  category?: string;
  address?: string | null;
}

export interface EventLike {
  name?: string;
  date?: string;
  startTime?: string;
  venue?: string;
  description?: string | null;
}

export interface DuesLike {
  amount?: number;
  currency?: string;
  dueDate?: string;
  period?: string | null;
  paymentStatus?: string;
}

export interface ResolveContext {
  member?: MemberLike | null;
  event?: EventLike | null;
  meeting?: EventLike | null;
  dues?: DuesLike | null;
  extra?: Record<string, string>;
}

const CURRENCY_SYMBOLS: Record<string, string> = { GHS: 'GH₵', USD: '$', EUR: '€', GBP: '£' };

export async function getClubData() {
  let club = await db.clubInfo.findUnique({ where: { id: 'default' } });
  if (!club) {
    club = await db.clubInfo.create({ data: { id: 'default' } });
  }
  return club;
}

/** Build the variable value map from context, driven by SmsVariable sources. */
export async function buildVariableMap(ctx: ResolveContext): Promise<Record<string, string>> {
  const club = await getClubData();
  const vars: Record<string, string> = {};

  // club source
  vars['club_name'] = club?.name || 'Progressive Youth Club';
  vars['club_short_name'] = club?.shortName || 'PYC';
  vars['club_phone'] = club?.phone || '';
  vars['club_email'] = club?.email || '';
  vars['club_address'] = club?.address || '';
  vars['club_website'] = club?.website || '';
  vars['sender_name'] = club?.senderName || 'PYC-CLUB';

  // member source
  const m = ctx.member;
  if (m) {
    const middle = m.middleName ? ` ${m.middleName}` : '';
    vars['member_name'] = `${m.firstName || ''}${middle} ${m.lastName || ''}`.trim();
    vars['first_name'] = m.firstName || '';
    vars['middle_name'] = m.middleName || '';
    vars['last_name'] = m.lastName || '';
    vars['member_id'] = m.memberCode || '';
    vars['phone_number'] = m.phone || '';
    vars['email'] = m.email || '';
    vars['birthday'] = m.dateOfBirth ? formatDisplayDate(m.dateOfBirth) : '';
    vars['membership_category'] = m.category || '';
    vars['membership_status'] = m.status || '';
    vars['address'] = m.address || '';
  }

  // event source
  const ev = ctx.event || ctx.meeting;
  if (ev) {
    vars['event_name'] = ev.name || '';
    vars['event_date'] = ev.date ? formatDisplayDate(ev.date) : '';
    vars['event_time'] = ev.startTime ? formatDisplayTime12(ev.startTime) : '';
    vars['event_location'] = ev.venue || '';
    vars['event_description'] = ev.description || '';
    vars['meeting_name'] = ev.name || '';
    vars['meeting_date'] = ev.date ? formatDisplayDate(ev.date) : '';
    vars['meeting_time'] = ev.startTime ? formatDisplayTime12(ev.startTime) : '';
    vars['meeting_location'] = ev.venue || '';
  }

  // dues source
  const d = ctx.dues;
  if (d) {
    const sym = CURRENCY_SYMBOLS[d.currency || 'GHS'] || d.currency || 'GH₵';
    vars['amount'] = d.amount != null ? `${sym}${d.amount.toFixed(2)}` : '';
    vars['due_date'] = d.dueDate ? formatDisplayDate(d.dueDate) : '';
    vars['dues_period'] = d.period || '';
    vars['payment_status'] = d.paymentStatus || '';
  }

  // system source
  vars['today'] = formatDisplayDate(new Date().toISOString().slice(0, 10));
  vars['current_year'] = String(new Date().getFullYear());

  if (ctx.extra) Object.assign(vars, ctx.extra);
  return vars;
}

/** Full variable catalog as displayed in UI (from SmsVariable table, fallback built-in). */
export async function listVariables() {
  const dbVars = await db.smsVariable.findMany({ orderBy: { sortOrder: 'asc' } });
  if (dbVars.length > 0) return dbVars;
  return BUILTIN_VARIABLES.map(v => ({ ...v, isActive: true }));
}

export const BUILTIN_VARIABLES = [
  { key: 'member_name', display: 'Member Full Name', source: 'member', description: 'Full name of the recipient member', exampleValue: 'John Doe', sortOrder: 1 },
  { key: 'first_name', display: 'First Name', source: 'member', description: 'Recipient first name', exampleValue: 'John', sortOrder: 2 },
  { key: 'last_name', display: 'Last Name', source: 'member', description: 'Recipient last name', exampleValue: 'Doe', sortOrder: 3 },
  { key: 'member_id', display: 'Member ID', source: 'member', description: 'Unique club member code', exampleValue: 'PYC-0001', sortOrder: 4 },
  { key: 'phone_number', display: 'Phone Number', source: 'member', description: 'Recipient phone number', exampleValue: '+233241234567', sortOrder: 5 },
  { key: 'birthday', display: 'Birthday', source: 'member', description: "Member's date of birth", exampleValue: '20 September 1995', sortOrder: 6 },
  { key: 'email', display: 'Email', source: 'member', description: 'Member email address', exampleValue: 'john@example.com', sortOrder: 7 },
  { key: 'event_name', display: 'Event Name', source: 'event', description: 'Name of the event or meeting', exampleValue: 'PYC Anniversary', sortOrder: 10 },
  { key: 'event_date', display: 'Event Date', source: 'event', description: 'Event date in long format', exampleValue: '25 September 2026', sortOrder: 11 },
  { key: 'event_time', display: 'Event Time', source: 'event', description: 'Event start time', exampleValue: '4:00 PM', sortOrder: 12 },
  { key: 'event_location', display: 'Event Venue', source: 'event', description: 'Event venue/location', exampleValue: 'PYC Club House', sortOrder: 13 },
  { key: 'meeting_name', display: 'Meeting Name', source: 'meeting', description: 'Name of the meeting', exampleValue: 'PYC Monthly Meeting', sortOrder: 20 },
  { key: 'meeting_date', display: 'Meeting Date', source: 'meeting', description: 'Meeting date', exampleValue: '25 September 2026', sortOrder: 21 },
  { key: 'meeting_time', display: 'Meeting Time', source: 'meeting', description: 'Meeting start time', exampleValue: '4:00 PM', sortOrder: 22 },
  { key: 'meeting_location', display: 'Meeting Venue', source: 'meeting', description: 'Meeting venue', exampleValue: 'PYC Club House', sortOrder: 23 },
  { key: 'amount', display: 'Dues Amount', source: 'dues', description: 'Formatted dues amount with currency', exampleValue: 'GH₵50.00', sortOrder: 30 },
  { key: 'due_date', display: 'Due Date', source: 'dues', description: 'Dues payment deadline', exampleValue: '30 September 2026', sortOrder: 31 },
  { key: 'club_name', display: 'Club Name', source: 'club', description: 'Configured club name', exampleValue: 'Progressive Youth Club', sortOrder: 40 },
  { key: 'club_short_name', display: 'Club Short Name', source: 'club', description: 'Club short name', exampleValue: 'PYC', sortOrder: 41 },
  { key: 'today', display: 'Today', source: 'system', description: 'Current date', exampleValue: '17 September 2026', sortOrder: 50 },
  { key: 'current_year', display: 'Current Year', source: 'system', description: 'Current year', exampleValue: '2026', sortOrder: 51 },
];

export interface ResolveResult {
  text: string;
  unresolved: string[];
}

/** Replace {{var}} tokens with real values. Unresolved tokens are removed on send-mode,
 *  but reported so senders can fix templates (never send raw variables when a valid value exists). */
export function resolveVariables(template: string, map: Record<string, string>, mode: 'preview' | 'send' = 'preview'): ResolveResult {
  const unresolved: string[] = [];
  const text = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => {
    const val = map[key];
    if (val !== undefined && val !== null && val !== '') return val;
    if (val === '' || val === null || val === undefined) {
      // variable known but empty, or unknown entirely
      unresolved.push(key);
      return mode === 'preview' ? `{{${key}}}` : '';
    }
    return '';
  });
  return { text, unresolved: [...new Set(unresolved)] };
}
