// Africa/Accra timezone helpers — ALL scheduling uses the club timezone, never browser time.
export const CLUB_TZ = 'Africa/Accra';

export interface AccraNow {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  weekday: number; // 0=Sunday
  iso: string;
}

function partsIn(tz: string, date: Date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return parts;
}

export function getAccraNow(date: Date = new Date()): AccraNow {
  const p = partsIn(CLUB_TZ, date);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = Math.max(0, weekdays.indexOf(p.weekday));
  const dateStr = `${p.year}-${p.month}-${p.day}`;
  const timeStr = `${p.hour}:${p.minute}`;
  return {
    year: parseInt(p.year), month: parseInt(p.month), day: parseInt(p.day),
    hour: parseInt(p.hour), minute: parseInt(p.minute),
    dateStr, timeStr, weekday,
    iso: `${dateStr}T${timeStr}:00`,
  };
}

/** Add N days to a YYYY-MM-DD string (calendar-safe, via UTC noon anchor). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Days between two YYYY-MM-DD dates (a - b). */
export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  const da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((da - db) / 86400000);
}

/** Weekday of a YYYY-MM-DD date, 0=Sunday. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** ISO week string like 2026-W38 for weekly dedupe. */
export function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

/** "1995-09-20" -> "20 Sep" (month-day used for birthday matching). */
export function monthDay(dateStr: string): string {
  return dateStr ? dateStr.slice(5) : '';
}

/** Feb 29 birthdays: match on Feb 28 in non-leap years. */
export function birthdayMatches(dob: string, dateStr: string): boolean {
  if (!dob || dob.length < 10) return false;
  const md = monthDay(dob);
  const target = monthDay(dateStr);
  if (md === target) return true;
  if (md === '02-29' && target === '02-28') {
    const y = parseInt(dateStr.slice(0, 4));
    // not a leap year -> celebrate on 28th
    return !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0);
  }
  return false;
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d} ${months[m - 1]} ${y}`;
}

export function formatDisplayTime12(t: string): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
