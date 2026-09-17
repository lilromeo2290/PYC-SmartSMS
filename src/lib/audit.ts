import { db } from '@/lib/db';

export interface AuditEntry {
  userId?: string | null;
  userName?: string | null;
  action: string;
  module: string;
  target?: string | null;
  details?: string | null;
  status?: 'SUCCESS' | 'FAILED';
  ip?: string | null;
}

/** Append an audit trail record. Never throws — audit failures must not break business flow. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId || null,
        userName: entry.userName || null,
        action: entry.action,
        module: entry.module,
        target: entry.target || null,
        details: entry.details || null,
        status: entry.status || 'SUCCESS',
        ip: entry.ip || null,
      },
    });
  } catch (e) {
    console.error('[AUDIT] failed to record:', entry.action, e);
  }
}
