import { db } from '@/lib/db';
import { getAccraNow, addDays, birthdayMatches, daysBetween, isoWeekKey, monthKey, weekdayOf } from '@/lib/timezone';
import { buildVariableMap, resolveVariables, getClubData } from '@/lib/sms/variables';
import { sendSms } from '@/lib/sms/send';
import { recordAudit } from '@/lib/audit';

// ============================================================================
//                PYC SmartSMS — CENTRAL AUTOMATION ENGINE
// ============================================================================
// ONE engine for ALL automation types. Birthday, meeting, event, dues and
// custom automations are DATA (Automation rows), not code branches. Adding a
// new automation type means adding a row + a trigger evaluator here.
//
// Pipeline per recipient:
//   Trigger → Determine Audience → Retrieve Recipients → Check SMS Permission
//   → Load Template → Resolve Variables → Generate Message
//   → Check Duplicate Execution (dedupeKey) → Send SMS → Record Result
//   → Delivery Tracking → Audit
// ============================================================================

export interface EngineJob {
  dedupeKey: string;
  memberId?: string | null;
  recipientName: string;
  recipientPhone: string;
  context: Record<string, unknown>;
  contextVars: {
    member?: unknown;
    event?: unknown;
    meeting?: unknown;
    dues?: unknown;
    extra?: Record<string, string>;
  };
}

export interface TriggerResult {
  jobs: EngineJob[];
  note?: string;
}

export interface EngineRunSummary {
  automationId: string;
  automationName: string;
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
  duplicates: number;
  notes: string[];
}

// Global mutex — prevents overlapping engine runs within the single server process.
const g = globalThis as unknown as { __pycEngineRunning?: boolean };
export function isEngineRunning() { return !!g.__pycEngineRunning; }

// ---------------------------------------------------------------------------
// AUDIENCE RESOLUTION
// ---------------------------------------------------------------------------

async function resolveAudience(automation: {
  audienceType: string; groupId: string | null; memberIds: string;
}): Promise<{ id: string; firstName: string; lastName: string; phone: string; smsPermission: boolean; status: string }[]> {
  const memberIds: string[] = JSON.parse(automation.memberIds || '[]');
  const where: Record<string, unknown> = { status: 'ACTIVE' };
  if (automation.audienceType === 'GROUP' && automation.groupId) where.groupId = automation.groupId;
  if (automation.audienceType === 'SELECTED') where.id = { in: memberIds };
  const members = await db.member.findMany({
    where: where as never,
    select: { id: true, firstName: true, lastName: true, phone: true, smsPermission: true, status: true },
    orderBy: { memberCode: 'asc' },
  });
  return members;
}

function memberName(m: { firstName: string; lastName: string }) {
  return `${m.firstName} ${m.lastName}`.trim();
}

// ---------------------------------------------------------------------------
// TRIGGER EVALUATORS — each returns due jobs for the current Accra minute
// ---------------------------------------------------------------------------

interface AutomationRow {
  id: string; name: string; type: string; triggerType: string; config: string;
  audienceType: string; groupId: string | null; memberIds: string;
  meetingId: string | null; eventId: string | null; templateId: string | null; status: string;
}

interface AutomationConfig {
  sendTime?: string;
  offsets?: number[];
  dayOfMonth?: number;
  weekday?: number;
  specificDate?: string;
  [k: string]: unknown;
}

function parseConfig(automation: AutomationRow): AutomationConfig {
  try { return JSON.parse(automation.config || '{}'); } catch { return {}; }
}

function timeReached(nowTime: string, sendTime?: string): boolean {
  const gate = sendTime && /^\d{2}:\d{2}$/.test(sendTime) ? sendTime : '08:00';
  return nowTime >= gate;
}

async function evalBirthday(auto: AutomationRow, now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  const cfg = parseConfig(auto);
  const offsets = (cfg.offsets && cfg.offsets.length ? cfg.offsets : [0]).sort((a, b) => a - b);
  const jobs: EngineJob[] = [];
  for (const offset of offsets) {
    // offset 0 = birthday today, 1 = one day BEFORE birthday (birthday is tomorrow)
    const targetDate = addDays(now.dateStr, -offset);
    const members = await db.member.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, phone: true, smsPermission: true, dateOfBirth: true },
    });
    const celebrants = members.filter(m => birthdayMatches(m.dateOfBirth, targetDate));
    for (const m of celebrants) {
      jobs.push({
        dedupeKey: `bday:${auto.id}:${m.id}:${targetDate.slice(0, 4)}:${offset}`,
        memberId: m.id,
        recipientName: memberName(m),
        recipientPhone: m.phone,
        context: { birthday: targetDate, offset, trigger: 'BIRTHDAY' },
        contextVars: { member: m, extra: { birthday_year: targetDate.slice(0, 4) } },
      });
    }
  }
  return { jobs };
}

async function evalBeforeMeeting(auto: AutomationRow, now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  const cfg = parseConfig(auto);
  const offsets = cfg.offsets && cfg.offsets.length ? cfg.offsets : [1];
  const jobs: EngineJob[] = [];
  const where: Record<string, unknown> = { status: 'SCHEDULED' };
  if (auto.meetingId) where.id = auto.meetingId;
  const meetings = await db.meeting.findMany({ where: where as never });
  for (const meeting of meetings) {
    const daysUntil = daysBetween(meeting.date, now.dateStr); // positive = future
    if (!offsets.includes(daysUntil)) continue;
    // Audience: automation audience, narrowed by the meeting's own target group if set
    let audience = await resolveAudience(auto);
    if (auto.audienceType === 'ALL_ACTIVE' && meeting.targetGroupId) {
      audience = audience.filter(m => true);
      const groupMembers = await db.member.findMany({
        where: { status: 'ACTIVE', groupId: meeting.targetGroupId },
        select: { id: true, firstName: true, lastName: true, phone: true, smsPermission: true, status: true },
      });
      audience = groupMembers;
    }
    for (const m of audience) {
      jobs.push({
        dedupeKey: `mtg:${auto.id}:${meeting.id}:${daysUntil}:${m.id}`,
        memberId: m.id,
        recipientName: memberName(m),
        recipientPhone: m.phone,
        context: { meetingId: meeting.id, meetingDate: meeting.date, offset: daysUntil, trigger: 'MEETING_REMINDER' },
        contextVars: { member: m, meeting },
      });
    }
  }
  return { jobs };
}

async function evalBeforeEvent(auto: AutomationRow, now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  const cfg = parseConfig(auto);
  const offsets = cfg.offsets && cfg.offsets.length ? cfg.offsets : [1];
  const jobs: EngineJob[] = [];
  const where: Record<string, unknown> = { status: 'SCHEDULED' };
  if (auto.eventId) where.id = auto.eventId;
  const events = await db.event.findMany({ where: where as never });
  for (const event of events) {
    const daysUntil = daysBetween(event.date, now.dateStr);
    if (!offsets.includes(daysUntil)) continue;
    let audience = await resolveAudience(auto);
    if (auto.audienceType === 'ALL_ACTIVE' && event.targetGroupId) {
      const groupMembers = await db.member.findMany({
        where: { status: 'ACTIVE', groupId: event.targetGroupId },
        select: { id: true, firstName: true, lastName: true, phone: true, smsPermission: true, status: true },
      });
      audience = groupMembers;
    }
    for (const m of audience) {
      jobs.push({
        dedupeKey: `evt:${auto.id}:${event.id}:${daysUntil}:${m.id}`,
        memberId: m.id,
        recipientName: memberName(m),
        recipientPhone: m.phone,
        context: { eventId: event.id, eventDate: event.date, offset: daysUntil, trigger: 'EVENT_REMINDER' },
        contextVars: { member: m, event },
      });
    }
  }
  return { jobs };
}

async function evalDues(auto: AutomationRow, now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  const cfg = parseConfig(auto);
  const offsets = cfg.offsets && cfg.offsets.length ? cfg.offsets : [3, 0];
  const jobs: EngineJob[] = [];
  const dues = await db.duesRecord.findMany({
    where: { paymentStatus: { not: 'PAID' } },
    include: { member: true },
  });
  for (const d of dues) {
    if (!d.member || d.member.status !== 'ACTIVE') continue;
    const daysUntilDue = daysBetween(d.dueDate, now.dateStr);
    let matched: number | null = null;
    if (d.reminderDate && d.reminderDate === now.dateStr) matched = -1; // explicit reminder date
    else if (offsets.includes(daysUntilDue)) matched = daysUntilDue;
    if (matched === null) continue;
    jobs.push({
      dedupeKey: `dues:${auto.id}:${d.id}:${matched}:${d.member.id}`,
      memberId: d.member.id,
      recipientName: memberName(d.member),
      recipientPhone: d.member.phone,
      context: { duesId: d.id, dueDate: d.dueDate, amount: d.amount, offset: matched, trigger: 'DUES' },
      contextVars: { member: d.member, dues: d },
    });
  }
  return { jobs };
}

async function evalSpecificDate(auto: AutomationRow, now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  const cfg = parseConfig(auto);
  if (!cfg.specificDate || cfg.specificDate !== now.dateStr) return { jobs: [] };
  const audience = await resolveAudience(auto);
  return {
    jobs: audience.map(m => ({
      dedupeKey: `date:${auto.id}:${cfg.specificDate}:${m.id}`,
      memberId: m.id,
      recipientName: memberName(m),
      recipientPhone: m.phone,
      context: { specificDate: cfg.specificDate, trigger: 'SPECIFIC_DATE' },
      contextVars: { member: m },
    })),
  };
}

async function evalMonthly(auto: AutomationRow, now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  const cfg = parseConfig(auto);
  const dom = cfg.dayOfMonth || 1;
  const lastDay = new Date(now.year, now.month, 0).getDate();
  const isLastDay = now.day === lastDay;
  if (now.day !== dom && !(dom > lastDay && isLastDay)) return { jobs: [] };
  const audience = await resolveAudience(auto);
  return {
    jobs: audience.map(m => ({
      dedupeKey: `monthly:${auto.id}:${monthKey(now.dateStr)}:${m.id}`,
      memberId: m.id,
      recipientName: memberName(m),
      recipientPhone: m.phone,
      context: { month: monthKey(now.dateStr), trigger: 'MONTHLY' },
      contextVars: { member: m },
    })),
  };
}

async function evalWeekly(auto: AutomationRow, now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  const cfg = parseConfig(auto);
  if ((cfg.weekday ?? 0) !== now.weekday) return { jobs: [] };
  const audience = await resolveAudience(auto);
  return {
    jobs: audience.map(m => ({
      dedupeKey: `weekly:${auto.id}:${isoWeekKey(now.dateStr)}:${m.id}`,
      memberId: m.id,
      recipientName: memberName(m),
      recipientPhone: m.phone,
      context: { week: isoWeekKey(now.dateStr), trigger: 'WEEKLY' },
      contextVars: { member: m },
    })),
  };
}

async function evalDaily(auto: AutomationRow, _now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  const now = _now;
  const audience = await resolveAudience(auto);
  return {
    jobs: audience.map(m => ({
      dedupeKey: `daily:${auto.id}:${now.dateStr}:${m.id}`,
      memberId: m.id,
      recipientName: memberName(m),
      recipientPhone: m.phone,
      context: { date: now.dateStr, trigger: 'DAILY' },
      contextVars: { member: m },
    })),
  };
}

async function evaluateTrigger(auto: AutomationRow, now: ReturnType<typeof getAccraNow>): Promise<TriggerResult> {
  switch (auto.triggerType) {
    case 'BIRTHDAY': return evalBirthday(auto, now);
    case 'BEFORE_MEETING': return evalBeforeMeeting(auto, now);
    case 'BEFORE_EVENT': return evalBeforeEvent(auto, now);
    case 'DUES': return evalDues(auto, now);
    case 'SPECIFIC_DATE': return evalSpecificDate(auto, now);
    case 'MONTHLY': return evalMonthly(auto, now);
    case 'WEEKLY': return evalWeekly(auto, now);
    case 'DAILY': return evalDaily(auto, now);
    default: return { jobs: [] };
  }
}

// ---------------------------------------------------------------------------
// JOB EXECUTION — the pipeline
// ---------------------------------------------------------------------------

async function executeJob(
  auto: AutomationRow,
  job: EngineJob,
  opts: { force?: boolean } = {}
): Promise<'SENT' | 'FAILED' | 'SKIPPED' | 'DUPLICATE'> {
  // 1. Reserve execution record — the UNIQUE dedupeKey is the duplicate guard.
  let execution;
  try {
    execution = await db.automationExecution.create({
      data: {
        automationId: auto.id,
        automationName: auto.name,
        dedupeKey: opts.force ? `${job.dedupeKey}:force:${Date.now()}` : job.dedupeKey,
        recipientMemberId: job.memberId || null,
        recipientName: job.recipientName,
        recipientPhone: job.recipientPhone,
        message: '',
        status: 'PENDING',
        context: JSON.stringify(job.context),
      },
    });
  } catch {
    return 'DUPLICATE'; // unique constraint → already executed for this event/recipient
  }

  // 2. Check SMS permission (OPT-OUT)
  if (job.memberId) {
    const member = await db.member.findUnique({ where: { id: job.memberId } });
    if (!member) {
      await db.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', reason: 'Member not found.' } });
      return 'SKIPPED';
    }
    if (member.status !== 'ACTIVE') {
      await db.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', reason: `SMS skipped — member status is ${member.status}.` } });
      return 'SKIPPED';
    }
    if (!member.smsPermission) {
      await db.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', reason: 'SMS skipped — member has SMS disabled.' } });
      await recordAudit({
        action: 'AUTOMATION_SKIPPED', module: 'AUTOMATION',
        target: `${auto.name} → ${job.recipientName}`,
        details: 'SMS skipped — member has SMS disabled.',
      });
      return 'SKIPPED';
    }
  }

  // 3. Load template
  let templateMessage: string | null = null;
  if (auto.templateId) {
    const tpl = await db.smsTemplate.findUnique({ where: { id: auto.templateId } });
    if (tpl && tpl.status === 'ACTIVE') templateMessage = tpl.message;
    else {
      await db.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', reason: tpl ? 'Template is inactive.' : 'Template not found.' } });
      return 'SKIPPED';
    }
  } else {
    await db.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', reason: 'No template configured.' } });
    return 'SKIPPED';
  }

  // 4. Resolve variables & generate message
  const map = await buildVariableMap(job.contextVars as never);
  const { text, unresolved } = resolveVariables(templateMessage, map, 'send');
  if (unresolved.length > 0 && text.trim().length === 0) {
    await db.automationExecution.update({ where: { id: execution.id }, data: { status: 'SKIPPED', reason: `Message empty after variable resolution (unresolved: ${unresolved.join(', ')}).` } });
    return 'SKIPPED';
  }

  await db.automationExecution.update({
    where: { id: execution.id },
    data: {
      message: text,
      reason: unresolved.length ? `Unresolved variables removed: ${unresolved.join(', ')}` : null,
    },
  });

  // 5. Send via provider (records SmsMessage + delivery tracking)
  const result = await sendSms({
    phone: job.recipientPhone,
    message: text,
    recipientName: job.recipientName,
    recipientMemberId: job.memberId || null,
    type: 'AUTOMATED',
    automationId: auto.id,
    automationName: auto.name,
    templateId: auto.templateId,
  });

  // 6. Record result
  await db.automationExecution.update({
    where: { id: execution.id },
    data: {
      status: result.status,
      smsMessageId: result.messageId,
      reason: result.status === 'FAILED' ? (result.error || 'Provider failure') : undefined,
    },
  });

  await db.automation.update({ where: { id: auto.id }, data: { lastRunAt: new Date() } });

  await recordAudit({
    action: result.status === 'SENT' ? 'AUTOMATION_SMS_SENT' : 'AUTOMATION_SMS_FAILED',
    module: 'AUTOMATION',
    target: `${auto.name} → ${job.recipientName} (${job.recipientPhone})`,
    details: `dedupe=${job.dedupeKey}${result.providerRef ? ` ref=${result.providerRef}` : ''}`,
    status: result.status === 'SENT' ? 'SUCCESS' : 'FAILED',
  });

  return result.status;
}

// ---------------------------------------------------------------------------
// ENGINE RUNS
// ---------------------------------------------------------------------------

interface RunOptions {
  force?: boolean;       // manual: ignore time gate (still dedupe unless explicitForce)
  explicitForce?: boolean; // manual re-send: bypass dedupe too
  dryRun?: boolean;      // report what would send without sending
}

async function runAutomation(auto: AutomationRow, now: ReturnType<typeof getAccraNow>, opts: RunOptions): Promise<EngineRunSummary> {
  const summary: EngineRunSummary = {
    automationId: auto.id, automationName: auto.name,
    candidates: 0, sent: 0, failed: 0, skipped: 0, duplicates: 0, notes: [],
  };

  const cfg = parseConfig(auto);
  if (!opts.force && !timeReached(now.timeStr, cfg.sendTime)) {
    summary.notes.push(`Send time ${cfg.sendTime || '08:00'} not reached yet (now ${now.timeStr}).`);
    return summary;
  }

  const trigger = await evaluateTrigger(auto, now);
  summary.candidates = trigger.jobs.length;
  if (trigger.note) summary.notes.push(trigger.note);
  if (trigger.jobs.length === 0) return summary;

  for (const job of trigger.jobs) {
    if (opts.dryRun) { summary.sent++; continue; }
    const r = await executeJob(auto, job, { force: opts.explicitForce });
    if (r === 'SENT') summary.sent++;
    else if (r === 'FAILED') summary.failed++;
    else if (r === 'SKIPPED') summary.skipped++;
    else if (r === 'DUPLICATE') summary.duplicates++;
  }
  return summary;
}

export interface FullTickResult {
  ranAt: string;
  scheduledProcessed: number;
  deliveriesResolved: number;
  automations: EngineRunSummary[];
  skippedInactive: number;
}

/** Main engine tick — called every 30s by the server-side scheduler. */
export async function runEngineTick(): Promise<FullTickResult> {
  const result: FullTickResult = {
    ranAt: new Date().toISOString(),
    scheduledProcessed: 0,
    deliveriesResolved: 0,
    automations: [],
    skippedInactive: 0,
  };
  if (g.__pycEngineRunning) return result;
  g.__pycEngineRunning = true;
  try {
    const now = getAccraNow();
    result.scheduledProcessed = await processScheduledSms(now);
    result.deliveriesResolved = await resolveSimulatorDeliveries();

    const automations = await db.automation.findMany({ where: { status: 'ACTIVE' } });
    const inactiveCount = await db.automation.count({ where: { status: 'INACTIVE' } });
    result.skippedInactive = inactiveCount;

    for (const auto of automations) {
      try {
        const s = await runAutomation(auto, now, {});
        if (s.candidates > 0 || s.notes.length) result.automations.push(s);
      } catch (e) {
        console.error(`[ENGINE] automation ${auto.name} failed:`, e);
        result.automations.push({
          automationId: auto.id, automationName: auto.name,
          candidates: 0, sent: 0, failed: 0, skipped: 0, duplicates: 0,
          notes: [e instanceof Error ? e.message : 'engine error'],
        });
      }
    }
  } finally {
    g.__pycEngineRunning = false;
  }
  return result;
}

/** Manual "Run now" — ignores the time gate; dedupe still applies unless explicitForce.
 *  Inactive automations never execute (configuration and history are preserved). */
export async function runAutomationManually(automationId: string, opts: { force?: boolean } = {}): Promise<EngineRunSummary> {
  const auto = await db.automation.findUnique({ where: { id: automationId } });
  if (!auto) throw new Error('Automation not found.');
  if (auto.status !== 'ACTIVE') {
    return {
      automationId: auto.id, automationName: auto.name,
      candidates: 0, sent: 0, failed: 0, skipped: 0, duplicates: 0,
      notes: ['Automation is INACTIVE — it does not execute until reactivated (configuration and history preserved).'],
    };
  }
  const now = getAccraNow();
  const summary = await runAutomation(auto as unknown as AutomationRow, now, { force: true, explicitForce: opts.force });
  await recordAudit({
    action: 'AUTOMATION_MANUAL_RUN', module: 'AUTOMATION',
    target: auto.name,
    details: `sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped} duplicates=${summary.duplicates}`,
  });
  return summary;
}

// ---------------------------------------------------------------------------
// SCHEDULED SMS PROCESSOR + SIMULATOR DELIVERY RESOLUTION
// ---------------------------------------------------------------------------

export async function processScheduledSms(now: ReturnType<typeof getAccraNow>): Promise<number> {
  const due = await db.scheduledSms.findMany({
    where: { status: 'PENDING', scheduledDate: { lte: now.dateStr } },
    orderBy: { scheduledDate: 'asc' },
  });
  let processed = 0;
  for (const s of due) {
    if (s.scheduledDate === now.dateStr && s.scheduledTime > now.timeStr) continue; // not yet today
    // Claim it first (prevents double-processing)
    await db.scheduledSms.update({ where: { id: s.id }, data: { status: 'PROCESSING' } });
    processed++;

    const memberIds: string[] = JSON.parse(s.recipientMemberIds || '[]');
    const phones: string[] = JSON.parse(s.recipientPhones || '[]');
    const members = await db.member.findMany({
      where: { id: { in: memberIds }, status: 'ACTIVE', smsPermission: true },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });

    let okCount = 0, failCount = 0;
    for (const m of members) {
      const r = await sendSms({
        phone: m.phone, message: s.message,
        recipientName: `${m.firstName} ${m.lastName}`.trim(),
        recipientMemberId: m.id, type: 'SCHEDULED', scheduledSmsId: s.id,
        templateId: s.templateId, createdById: s.createdById,
      });
      if (r.status === 'SENT') okCount++; else failCount++;
    }
    for (const p of phones) {
      const r = await sendSms({
        phone: p, message: s.message, recipientName: 'External recipient',
        type: 'SCHEDULED', scheduledSmsId: s.id, templateId: s.templateId, createdById: s.createdById,
      });
      if (r.status === 'SENT') okCount++; else failCount++;
    }

    const status = okCount > 0 && failCount === 0 ? 'SENT' : okCount > 0 ? 'SENT' : 'FAILED';
    await db.scheduledSms.update({
      where: { id: s.id },
      data: {
        status,
        sentAt: new Date(),
        error: failCount > 0 ? `${failCount} of ${okCount + failCount} messages failed (see SMS history).` : null,
      },
    });
    await recordAudit({
      action: 'SCHEDULED_SMS_PROCESSED', module: 'SMS',
      target: s.name || `Scheduled SMS ${s.id.slice(-6)}`,
      details: `recipients=${okCount + failCount}, sent=${okCount}, failed=${failCount}`,
      status: okCount > 0 ? 'SUCCESS' : 'FAILED',
    });
  }
  return processed;
}

/** Simulator delivery resolution: SENT messages older than 20s become DELIVERED/FAILED. */
export async function resolveSimulatorDeliveries(): Promise<number> {
  const cfg = await db.smsProviderConfig.findUnique({ where: { id: 'default' } });
  if (!cfg || cfg.providerType !== 'simulator') return 0;

  const cutoff = new Date(Date.now() - 20000);
  const pending = await db.smsMessage.findMany({
    where: { status: 'SENT', sentAt: { lt: cutoff } },
    take: 200,
  });
  let resolved = 0;
  for (const m of pending) {
    let planned: string | null = null;
    try {
      const resp = JSON.parse(m.providerResponse || '{}');
      planned = resp.planned || null;
    } catch { planned = null; }
    if (planned === 'FAILED') {
      await db.smsMessage.update({
        where: { id: m.id },
        data: { status: 'FAILED', error: 'Delivery failed — recipient unreachable (simulated).', deliveredAt: null },
      });
    } else {
      await db.smsMessage.update({
        where: { id: m.id },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
    }
    resolved++;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// NEXT AUTOMATIONS PREVIEW (for dashboards)
// ---------------------------------------------------------------------------

export interface NextRunPreview {
  automationId: string;
  automationName: string;
  kind: string; // Birthday / Meeting Reminder / Event Reminder / Dues / Custom
  icon: string;
  target: string;
  dateStr: string; // YYYY-MM-DD
  timeStr: string;
  inDays: number;
  recipients: number;
}

export async function computeNextRuns(limit = 8): Promise<NextRunPreview[]> {
  const now = getAccraNow();
  const out: NextRunPreview[] = [];
  const autos = await db.automation.findMany({ where: { status: 'ACTIVE' } });
  const club = await getClubData().catch(() => null);

  for (const auto of autos) {
    const cfg = parseConfig(auto as unknown as AutomationRow);
    const sendTime = cfg.sendTime || '08:00';
    const offsets = (cfg.offsets && cfg.offsets.length ? cfg.offsets : [0]).slice().sort((a, b) => a - b);

    if (auto.triggerType === 'BIRTHDAY') {
      // next 3 upcoming birthdays among active members
      const members = await db.member.findMany({ where: { status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true } });
      const upcoming: { m: typeof members[number]; dateStr: string }[] = [];
      for (let i = 0; i < 400 && upcoming.length < 3; i++) {
        const d = addDays(now.dateStr, i);
        const celebrants = members.filter(m => birthdayMatches(m.dateOfBirth, d));
        for (const c of celebrants) {
          if (upcoming.length < 3) upcoming.push({ m: c, dateStr: d });
        }
      }
      for (const u of upcoming.slice(0, 3)) {
        out.push({
          automationId: auto.id, automationName: auto.name, kind: 'Birthday', icon: '🎂',
          target: `${u.m.firstName} ${u.m.lastName}`, dateStr: u.dateStr, timeStr: sendTime,
          inDays: daysBetween(u.dateStr, now.dateStr),
          recipients: 1,
        });
      }
    } else if (auto.triggerType === 'BEFORE_MEETING') {
      const meetings = await db.meeting.findMany({ where: { status: 'SCHEDULED', date: { gte: now.dateStr } }, orderBy: { date: 'asc' }, take: 5 });
      for (const mt of meetings.slice(0, 3)) {
        const daysUntil = daysBetween(mt.date, now.dateStr);
        const off = offsets.find(o => o <= daysUntil);
        if (off === undefined) continue;
        const fireDate = addDays(mt.date, -off);
        if (daysBetween(fireDate, now.dateStr) < 0) continue;
        const count = await countAudience(auto as unknown as AutomationRow, mt.targetGroupId);
        out.push({
          automationId: auto.id, automationName: auto.name, kind: 'Meeting Reminder', icon: '📅',
          target: mt.name, dateStr: fireDate, timeStr: sendTime,
          inDays: daysBetween(fireDate, now.dateStr), recipients: count,
        });
      }
    } else if (auto.triggerType === 'BEFORE_EVENT') {
      const events = await db.event.findMany({ where: { status: 'SCHEDULED', date: { gte: now.dateStr } }, orderBy: { date: 'asc' }, take: 5 });
      for (const ev of events.slice(0, 3)) {
        const daysUntil = daysBetween(ev.date, now.dateStr);
        const off = offsets.find(o => o <= daysUntil);
        if (off === undefined) continue;
        const fireDate = addDays(ev.date, -off);
        if (daysBetween(fireDate, now.dateStr) < 0) continue;
        const count = await countAudience(auto as unknown as AutomationRow, ev.targetGroupId);
        out.push({
          automationId: auto.id, automationName: auto.name, kind: 'Event Reminder', icon: '🎉',
          target: ev.name, dateStr: fireDate, timeStr: sendTime,
          inDays: daysBetween(fireDate, now.dateStr), recipients: count,
        });
      }
    } else if (auto.triggerType === 'DUES') {
      const dues = await db.duesRecord.findMany({ where: { paymentStatus: { not: 'PAID' }, dueDate: { gte: now.dateStr } }, orderBy: { dueDate: 'asc' }, take: 3, include: { member: true } });
      for (const d of dues) {
        const daysUntil = daysBetween(d.dueDate, now.dateStr);
        const off = offsets.find(o => o <= daysUntil);
        if (off === undefined) continue;
        const fireDate = addDays(d.dueDate, -off);
        out.push({
          automationId: auto.id, automationName: auto.name, kind: 'Dues Reminder', icon: '💰',
          target: `${d.member.firstName} ${d.member.lastName} — ${d.currency === 'GHS' ? 'GH₵' : d.currency}${d.amount.toFixed(2)}`,
          dateStr: fireDate, timeStr: sendTime,
          inDays: daysBetween(fireDate, now.dateStr), recipients: 1,
        });
      }
    } else if (auto.triggerType === 'MONTHLY') {
      const dom = cfg.dayOfMonth || 1;
      let target: string;
      if (now.day < dom) target = `${now.dateStr.slice(0, 7)}-${String(dom).padStart(2, '0')}`;
      else {
        const nm = new Date(Date.UTC(now.year, now.month, 1, 12));
        target = `${nm.toISOString().slice(0, 7)}-${String(Math.min(dom, new Date(nm.getUTCFullYear(), nm.getUTCMonth() + 1, 0).getUTCDate())).padStart(2, '0')}`;
      }
      const count = await countAudience(auto as unknown as AutomationRow, null);
      out.push({
        automationId: auto.id, automationName: auto.name, kind: 'Custom Automation', icon: '🔁',
        target: `Monthly on day ${dom}`, dateStr: target, timeStr: sendTime,
        inDays: daysBetween(target, now.dateStr), recipients: count,
      });
    } else if (auto.triggerType === 'WEEKLY') {
      const wd = cfg.weekday ?? 0;
      let delta = (wd - now.weekday + 7) % 7;
      if (delta === 0 && now.timeStr >= sendTime) delta = 7;
      const target = addDays(now.dateStr, delta);
      const count = await countAudience(auto as unknown as AutomationRow, null);
      out.push({
        automationId: auto.id, automationName: auto.name, kind: 'Custom Automation', icon: '🔁',
        target: `Every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][wd]}`,
        dateStr: target, timeStr: sendTime, inDays: delta, recipients: count,
      });
    } else if (auto.triggerType === 'SPECIFIC_DATE' && cfg.specificDate) {
      const inDays = daysBetween(cfg.specificDate, now.dateStr);
      if (inDays >= 0) {
        const count = await countAudience(auto as unknown as AutomationRow, null);
        out.push({
          automationId: auto.id, automationName: auto.name, kind: 'Custom Automation', icon: '🗓️',
          target: cfg.specificDate, dateStr: cfg.specificDate, timeStr: sendTime, inDays, recipients: count,
        });
      }
    } else if (auto.triggerType === 'DAILY') {
      const target = now.timeStr >= sendTime ? addDays(now.dateStr, 1) : now.dateStr;
      const count = await countAudience(auto as unknown as AutomationRow, null);
      out.push({
        automationId: auto.id, automationName: auto.name, kind: 'Custom Automation', icon: '🔁',
        target: 'Daily', dateStr: target, timeStr: sendTime,
        inDays: daysBetween(target, now.dateStr), recipients: count,
      });
    }
  }
  out.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.timeStr.localeCompare(b.timeStr));
  return out.slice(0, limit);
}

async function countAudience(auto: AutomationRow, targetGroupId: string | null): Promise<number> {
  const where: Record<string, unknown> = { status: 'ACTIVE' };
  if (auto.audienceType === 'GROUP' && auto.groupId) where.groupId = auto.groupId;
  if (auto.audienceType === 'SELECTED') {
    const ids: string[] = JSON.parse(auto.memberIds || '[]');
    where.id = { in: ids };
  }
  if (auto.audienceType === 'ALL_ACTIVE' && targetGroupId) where.groupId = targetGroupId;
  return db.member.count({ where: where as never });
}
