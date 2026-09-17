// Next.js instrumentation hook — starts the server-side automation scheduler
// exactly once per server process, regardless of whether any browser is open.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('@/lib/automation/scheduler');
    startScheduler();
  }
}
