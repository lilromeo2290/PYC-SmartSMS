import { runEngineTick } from '@/lib/automation/engine';

// ============================================================================
// SERVER-SIDE SCHEDULER
// ============================================================================
// Runs INSIDE the Next.js server process (started via src/instrumentation.ts).
// It does NOT depend on any browser being open — automations, scheduled SMS
// and delivery tracking keep running even when nobody is logged in.
//
// Tick every 30 seconds:
//   1. Process due Scheduled SMS (catch-up safe)
//   2. Resolve simulator deliveries (SENT → DELIVERED/FAILED after ~20s)
//   3. Evaluate ALL active automations against the current Africa/Accra time
//      (catch-up safe: if the server starts at 09:15, a birthday job gated at
//      08:00 still fires; dedupeKeys prevent double-sends)
// ============================================================================

const g = globalThis as unknown as {
  __pycSchedulerStarted?: boolean;
  __pycLastTick?: string;
  __pycTickCount?: number;
  __pycEngineBusy?: boolean;
};

const TICK_INTERVAL_MS = 30_000;

export function startScheduler() {
  if (g.__pycSchedulerStarted) return;
  g.__pycSchedulerStarted = true;

  console.log('[SCHEDULER] PYC SmartSMS automation scheduler starting — timezone Africa/Accra, tick every 30s');

  const tick = async () => {
    if (g.__pycEngineBusy) return; // skip if previous tick still running
    g.__pycEngineBusy = true;
    try {
      const result = await runEngineTick();
      g.__pycLastTick = result.ranAt;
      g.__pycTickCount = (g.__pycTickCount || 0) + 1;
      const interesting = result.scheduledProcessed > 0 || result.deliveriesResolved > 0
        || result.automations.some(a => a.sent > 0 || a.failed > 0 || a.skipped > 0 || a.duplicates > 0);
      if (interesting) {
        console.log(`[SCHEDULER] tick #${g.__pycTickCount}`, JSON.stringify(result));
      }
    } catch (e) {
      console.error('[SCHEDULER] tick error:', e);
    } finally {
      g.__pycEngineBusy = false;
    }
  };

  // Initial catch-up run shortly after boot, then every 30 seconds
  setTimeout(tick, 3000);
  setInterval(tick, TICK_INTERVAL_MS);
}

export function schedulerStatus() {
  return {
    started: !!g.__pycSchedulerStarted,
    lastTick: g.__pycLastTick || null,
    tickCount: g.__pycTickCount || 0,
    busy: !!g.__pycEngineBusy,
    intervalMs: TICK_INTERVAL_MS,
    timezone: 'Africa/Accra',
  };
}
