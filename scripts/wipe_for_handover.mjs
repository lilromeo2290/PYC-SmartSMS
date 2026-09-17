// PYC SmartSMS — handover wipe
// Clears ALL operational/demo data so the system is delivered clean to the client.
// KEPT:   User accounts, Permission/RolePermission (RBAC), SmsProviderConfig (BMS
//         gateway + PYC CLUB-HO sender), ClubInfo (branding), SystemSetting, SmsVariable.
// WIPED:  AutomationExecution, Automation, SmsMessage, ScheduledSms, DuesRecord,
//         Member, Meeting, Event, MemberGroup, SmsTemplate, AuditLog.
// A timestamped backup of the SQLite file is taken before anything is deleted.
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const db = new PrismaClient();
const DB_FILE = '/home/z/my-project/db/custom.db';
const BACKUP_DIR = '/home/z/my-project/backups';

async function main() {
  // 1. Checkpoint WAL so the file copy is complete
  try { await db.$queryRaw`PRAGMA wal_checkpoint(TRUNCATE)`; } catch {}

  // 2. Backup
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(BACKUP_DIR, `pyc-smartsms-backup-${stamp}.db`);
  fs.copyFileSync(DB_FILE, backupPath);
  // include WAL/SHM sidecars if present (harmless if absent after checkpoint)
  for (const ext of ['-wal', '-shm']) {
    const side = DB_FILE + ext;
    if (fs.existsSync(side)) fs.copyFileSync(side, backupPath + ext);
  }
  console.log(`BACKUP: ${backupPath} (${fs.statSync(backupPath).size} bytes)`);

  // 3. Pre-wipe counts
  const models = [
    'automationExecution', 'automation', 'smsMessage', 'scheduledSms',
    'duesRecord', 'member', 'meeting', 'event', 'memberGroup',
    'smsTemplate', 'auditLog',
  ];
  console.log('\n--- PRE-WIPE COUNTS ---');
  for (const m of models) {
    console.log(`${m}: ${await db[m].count()}`);
  }

  // 4. Ordered wipe (children first to respect FK constraints)
  console.log('\n--- WIPING ---');
  for (const m of models) {
    const r = await db[m].deleteMany({});
    console.log(`deleted ${m}: ${r.count}`);
  }

  // 5. Post-wipe verification
  console.log('\n--- KEPT (must be non-empty where applicable) ---');
  console.log(`users: ${await db.user.count()}`);
  console.log(`permissions: ${await db.permission.count()}`);
  console.log(`rolePermissions: ${await db.rolePermission.count()}`);
  console.log(`smsVariables: ${await db.smsVariable.count()}`);
  console.log(`systemSettings: ${await db.systemSetting.count()}`);
  const cfg = await db.smsProviderConfig.findUnique({ where: { id: 'default' } });
  console.log(`providerConfig: ${cfg ? `${cfg.providerType} / sender=${cfg.senderId} / active=${cfg.isActive}` : 'MISSING!'}`);
  const club = await db.clubInfo.findUnique({ where: { id: 'default' } });
  console.log(`clubInfo: ${club ? `${club.name} / logo=${club.logoUrl ? 'set' : 'none'}` : 'MISSING!'}`);
  console.log('\n--- POST-WIPE COUNTS (all must be 0) ---');
  for (const m of models) {
    const c = await db[m].count();
    console.log(`${m}: ${c}${c === 0 ? '' : '  <-- NOT EMPTY!'}`);
  }
}

main()
  .catch((e) => { console.error('WIPE FAILED:', e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
