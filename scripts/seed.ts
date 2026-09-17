/**
 * PYC SmartSMS — Database Seed
 * Creates: permissions, roles, users, groups, members (incl. birthday TODAY),
 * templates, variables, club info, provider config, automations, meetings,
 * events and dues records.
 *
 * Run: bun scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: 'ALL',
  SMS_MANAGER: [
    'members.view', 'members.create', 'members.edit', 'members.import', 'groups.manage',
    'sms.send', 'sms.group', 'sms.schedule', 'sms.history', 'sms.reports',
    'automation.view', 'automation.create', 'automation.edit', 'automation.activate', 'automation.run',
    'dues.manage', 'templates.view', 'templates.create', 'templates.edit',
    'events.manage', 'reports.view', 'settings.sms', 'variables.manage',
  ],
  EVENT_COORDINATOR: [
    'members.view', 'groups.manage', 'sms.send', 'sms.history',
    'automation.view', 'automation.create', 'automation.edit', 'automation.run',
    'templates.view', 'templates.create', 'templates.edit',
    'events.manage', 'dues.manage', 'reports.view',
  ],
  VIEWER: ['members.view', 'sms.history', 'sms.reports', 'automation.view', 'templates.view', 'reports.view'],
};

const PERMISSIONS = [
  ['members.view', 'Members', 'View member register'], ['members.create', 'Members', 'Add new members'],
  ['members.edit', 'Members', 'Edit member records'], ['members.delete', 'Members', 'Deactivate/remove members'],
  ['members.import', 'Members', 'Import members from CSV/Excel'], ['groups.manage', 'Members', 'Create and manage member groups'],
  ['sms.send', 'SMS', 'Send individual SMS'], ['sms.group', 'SMS', 'Send group SMS'],
  ['sms.schedule', 'SMS', 'Schedule SMS for later'], ['sms.history', 'SMS', 'View SMS history'],
  ['sms.reports', 'SMS', 'View delivery reports'],
  ['automation.view', 'Automation', 'View automations and executions'], ['automation.create', 'Automation', 'Create automations'],
  ['automation.edit', 'Automation', 'Edit automations'], ['automation.activate', 'Automation', 'Activate/deactivate automations'],
  ['automation.run', 'Automation', 'Run automations manually'], ['dues.manage', 'Automation', 'Manage dues records'],
  ['templates.view', 'Templates', 'View SMS templates'], ['templates.create', 'Templates', 'Create templates'],
  ['templates.edit', 'Templates', 'Edit/duplicate templates'], ['templates.delete', 'Templates', 'Delete templates'],
  ['events.manage', 'Events', 'Manage meetings and events'], ['reports.view', 'Reports', 'View reports'],
  ['settings.sms', 'Settings', 'Configure SMS provider'], ['variables.manage', 'Settings', 'Manage SMS variables'],
  ['settings.club', 'Settings', 'Manage club information'], ['users.manage', 'Settings', 'Manage users and permissions'],
  ['audit.view', 'Audit', 'View audit trail'],
];

function dateStr(d: Date): string { return d.toISOString().slice(0, 10); }
function addDaysStr(base: string, days: number): string {
  const [y, m, dd] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dateStr(dt);
}

async function main() {
  const now = new Date();
  const accra = now.toISOString().slice(0, 10); // Accra = UTC+0
  const today = accra;
  console.log('Seed start. Today (Accra):', today);

  // ---------- Permissions ----------
  let sort = 1;
  for (const [key, module, description] of PERMISSIONS) {
    await db.permission.upsert({ where: { key }, update: { module, description }, create: { key, module, description, sortOrder: sort++ } });
  }
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const keys = perms === 'ALL' ? PERMISSIONS.map(p => p[0]) : perms;
    for (const key of keys) {
      await db.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey: key } },
        update: { allowed: true },
        create: { role, permissionKey: key, allowed: true },
      });
    }
  }
  console.log('✔ permissions + role matrix');

  // ---------- Users ----------
  const users = [
    { username: 'admin', email: 'admin@pyc.org', fullName: 'System Administrator', role: 'SUPER_ADMIN', pass: 'Admin@2026' },
    { username: 'smsmanager', email: 'sms@pyc.org', fullName: 'Ama Mensah', role: 'SMS_MANAGER', pass: 'Sms@2026' },
    { username: 'coordinator', email: 'events@pyc.org', fullName: 'Kwame Osei', role: 'EVENT_COORDINATOR', pass: 'Coord@2026' },
    { username: 'viewer', email: 'viewer@pyc.org', fullName: 'Akosua Boateng', role: 'VIEWER', pass: 'View@2026' },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { username: u.username },
      update: { role: u.role },
      create: {
        username: u.username, email: u.email, fullName: u.fullName, role: u.role,
        passwordHash: bcrypt.hashSync(u.pass, 10),
      },
    });
  }
  console.log('✔ users (admin/Admin@2026, smsmanager/Sms@2026, coordinator/Coord@2026, viewer/View@2026)');

  // ---------- Club info + provider ----------
  await db.clubInfo.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'Progressive Youth Club', shortName: 'PYC',
      phone: '+233241234000', email: 'info@pyc.org',
      address: 'PYC Club House, Independence Avenue, Accra, Ghana',
      website: 'https://pyc.org.gh', senderName: 'PYC-CLUB',
    },
  });
  await db.smsProviderConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', providerType: 'simulator', name: 'Built-in Simulator (Demo Gateway)' },
  });
  await db.systemSetting.upsert({
    where: { key: 'timezone' }, update: {},
    create: { key: 'timezone', value: 'Africa/Accra' },
  });
  console.log('✔ club info + provider (simulator) + timezone');

  // ---------- Groups ----------
  const groupDefs = [
    ['Executives', 'Club executive committee', '#047857'],
    ['General Members', 'All general membership', '#059669'],
    ['Youth Wing', 'Youth wing members (13-17)', '#D97706'],
    ['Welfare Committee', 'Welfare & member support committee', '#7C3AED'],
    ['Organizing Committee', 'Programs & organizing committee', '#BE185D'],
  ];
  const groups: Record<string, string> = {};
  for (const [name, description, color] of groupDefs) {
    const g = await db.memberGroup.upsert({ where: { name }, update: { description, color }, create: { name, description, color } });
    groups[name] = g.id;
  }
  console.log('✔ groups');

  // ---------- Members ----------
  // 14 members; Kwame Adu's birthday is TODAY, John Doe's birthday in 3 days,
  // Abena Owusu's birthday tomorrow → birthday automation is demonstrable.
  const memberDefs: Array<[string, string, string | null, string, string, string, string | null, string, string, boolean]> = [
    // firstName, lastName, middleName, phone, dob, gender, group, category, joined, smsEnabled
    ['Kwame', 'Adu', null, '0241234501', '1998-09-17', 'MALE', 'Executives', 'EXECUTIVE', '2021-01-15', true],   // BIRTHDAY TODAY
    ['John', 'Doe', 'Kofi', '0241234502', '1995-09-20', 'MALE', 'General Members', 'GENERAL', '2020-03-10', true], // birthday +3d
    ['Abena', 'Owusu', null, '0552345603', '2000-09-18', 'FEMALE', 'Youth Wing', 'GENERAL', '2022-06-01', true],   // birthday tomorrow
    ['Ama', 'Mensah', null, '0273456704', '1996-05-14', 'FEMALE', 'Executives', 'EXECUTIVE', '2019-11-20', true],
    ['Kofi', 'Boateng', null, '0204567805', '1999-01-25', 'MALE', 'Organizing Committee', 'GENERAL', '2023-02-14', true],
    ['Efua', 'Asante', 'Adjoa', '0565678906', '2001-07-08', 'FEMALE', 'Welfare Committee', 'GENERAL', '2022-08-30', true],
    ['Yaw', 'Darko', null, '0246789707', '1997-12-03', 'MALE', 'General Members', 'GENERAL', '2021-05-05', true],
    ['Adjoa', 'Nkrumah', null, '0577890808', '2002-03-29', 'FEMALE', 'Youth Wing', 'GENERAL', '2023-09-01', true],
    ['Kwesi', 'Amoah', null, '0268901909', '1994-10-11', 'MALE', 'General Members', 'PATRON', '2018-04-18', true],
    ['Akosua', 'Sarpong', null, '0559012010', '1998-06-21', 'FEMALE', 'Welfare Committee', 'GENERAL', '2022-01-09', true],
    ['Nana', 'Appiah', 'Kwabena', '0240123111', '2000-11-16', 'MALE', 'Organizing Committee', 'GENERAL', '2023-03-12', false], // SMS DISABLED → opt-out demo
    ['Esi', 'Quartey', null, '0501234212', '1996-02-27', 'FEMALE', 'General Members', 'GENERAL', '2021-07-22', true],
    ['Kojo', 'Antwi', null, '0272345313', '2003-04-05', 'MALE', 'Youth Wing', 'GENERAL', '2024-01-20', true],
    ['Maame', 'Yeboah', null, '0563456414', '1999-08-19', 'FEMALE', 'Executives', 'EXECUTIVE', '2020-10-02', true],
  ];
  let seq = 1;
  for (const [fn, ln, mn, phone, dob, gender, grp, cat, joined, smsOk] of memberDefs) {
    const code = `PYC-${String(seq).padStart(4, '0')}`;
    seq++;
    const normalized = phone.startsWith('0') ? '+233' + phone.slice(1) : phone;
    await db.member.upsert({
      where: { memberCode: code },
      update: {},
      create: {
        memberCode: code, firstName: fn, lastName: ln, middleName: mn,
        phone: normalized, dateOfBirth: dob, gender, category: cat,
        groupId: groups[grp], dateJoined: joined, smsPermission: smsOk,
        address: 'Accra, Ghana',
      },
    });
  }
  console.log(`✔ ${memberDefs.length} members (Nana Appiah has SMS disabled — opt-out demo)`);

  // ---------- Templates ----------
  const templates = [
    { name: 'Birthday Greeting', category: 'BIRTHDAY', message: 'Dear {{first_name}},\n\nHappy Birthday from everyone at Progressive Youth Club!\n\nWe wish you joy, good health, success and many more wonderful years ahead.\n\nEnjoy your special day!\n\nProgressive Youth Club (PYC)' },
    { name: 'Meeting Reminder', category: 'MEETING', message: 'Dear {{first_name}},\n\nThis is a reminder that the Progressive Youth Club meeting "{{meeting_name}}" will take place on {{meeting_date}} at {{meeting_time}}.\n\nVenue: {{meeting_location}}\n\nWe look forward to seeing you.\n\nProgressive Youth Club' },
    { name: 'Event Reminder', category: 'EVENT', message: 'Dear {{first_name}},\n\nYou are invited to {{event_name}} on {{event_date}} at {{event_time}}, {{event_location}}.\n\nCome and experience a memorable moment with the Progressive Youth Club family.\n\nProgressive Youth Club' },
    { name: 'Dues Reminder', category: 'DUES', message: 'Dear {{first_name}},\n\nThis is a reminder that your PYC contribution of {{amount}} is due on {{due_date}}.\n\nThank you.\n\nProgressive Youth Club.' },
    { name: 'Monthly Greeting', category: 'GENERAL', message: 'Dear {{first_name}},\n\nA new month has begun! Welcome to a fresh chapter with the Progressive Youth Club. Stay active, stay inspired.\n\n{{club_name}}' },
    { name: 'General Announcement', category: 'GENERAL', message: 'Dear {{first_name}},\n\n{{club_name}} brings you an important announcement.\n\n[Type your announcement here]\n\nThank you.' },
    { name: 'Welcome Message', category: 'CUSTOM', message: 'Dear {{first_name}},\n\nWelcome to {{club_name}}! Your member ID is {{member_id}}. We are excited to have you on board.\n\nWarm regards,\nPYC Executives' },
  ];
  const tplIds: Record<string, string> = {};
  for (const t of templates) {
    const rec = await db.smsTemplate.upsert({ where: { name: t.name }, update: { message: t.message, category: t.category }, create: t });
    tplIds[t.name] = rec.id;
  }
  console.log('✔ templates');

  // ---------- Variables ----------
  const vars = [
    ['member_name', 'Member Full Name', 'member', 'Full name of the recipient member', 'John Doe', 1],
    ['first_name', 'First Name', 'member', 'Recipient first name', 'John', 2],
    ['last_name', 'Last Name', 'member', 'Recipient last name', 'Doe', 3],
    ['member_id', 'Member ID', 'member', 'Unique club member code', 'PYC-0002', 4],
    ['phone_number', 'Phone Number', 'member', 'Recipient phone number', '+233241234567', 5],
    ['birthday', 'Birthday', 'member', "Member's date of birth", '20 September 1995', 6],
    ['email', 'Email', 'member', 'Member email address', 'john@example.com', 7],
    ['event_name', 'Event Name', 'event', 'Name of the event or meeting', 'PYC Anniversary', 10],
    ['event_date', 'Event Date', 'event', 'Event date in long format', '25 September 2026', 11],
    ['event_time', 'Event Time', 'event', 'Event start time', '4:00 PM', 12],
    ['event_location', 'Event Venue', 'event', 'Event venue/location', 'PYC Club House', 13],
    ['meeting_name', 'Meeting Name', 'meeting', 'Name of the meeting', 'PYC Monthly Meeting', 20],
    ['meeting_date', 'Meeting Date', 'meeting', 'Meeting date', '25 September 2026', 21],
    ['meeting_time', 'Meeting Time', 'meeting', 'Meeting start time', '4:00 PM', 22],
    ['meeting_location', 'Meeting Venue', 'meeting', 'Meeting venue', 'PYC Club House', 23],
    ['amount', 'Dues Amount', 'dues', 'Formatted dues amount with currency', 'GH₵50.00', 30],
    ['due_date', 'Due Date', 'dues', 'Dues payment deadline', '30 September 2026', 31],
    ['club_name', 'Club Name', 'club', 'Configured club name', 'Progressive Youth Club', 40],
    ['club_short_name', 'Club Short Name', 'club', 'Club short name', 'PYC', 41],
    ['today', 'Today', 'system', 'Current date', '17 September 2026', 50],
    ['current_year', 'Current Year', 'system', 'Current year', '2026', 51],
  ] as const;
  for (const [key, display, source, description, exampleValue, sortOrder] of vars) {
    await db.smsVariable.upsert({ where: { key }, update: { display, source, description, exampleValue }, create: { key, display, source, description, exampleValue, sortOrder } });
  }
  console.log('✔ variables');

  // ---------- Automations ----------
  await db.automation.upsert({
    where: { id: 'seed-birthday' },
    update: {},
    create: {
      id: 'seed-birthday',
      name: 'Birthday Wishes', type: 'BIRTHDAY', triggerType: 'BIRTHDAY',
      description: 'Automatically sends a birthday message to active members on their birthday (and optionally before).',
      config: JSON.stringify({ sendTime: '08:00', offsets: [0] }),
      audienceType: 'ALL_ACTIVE', templateId: tplIds['Birthday Greeting'], status: 'ACTIVE',
    },
  });
  await db.automation.upsert({
    where: { id: 'seed-meeting' },
    update: {},
    create: {
      id: 'seed-meeting',
      name: 'Meeting Reminder', type: 'MEETING_REMINDER', triggerType: 'BEFORE_MEETING',
      description: 'Sends reminders for scheduled meetings (applies to all meetings unless one is selected).',
      config: JSON.stringify({ sendTime: '09:00', offsets: [2, 1, 0] }),
      audienceType: 'ALL_ACTIVE', templateId: tplIds['Meeting Reminder'], status: 'ACTIVE',
    },
  });
  await db.automation.upsert({
    where: { id: 'seed-event' },
    update: {},
    create: {
      id: 'seed-event',
      name: 'Event Reminder', type: 'EVENT_REMINDER', triggerType: 'BEFORE_EVENT',
      description: 'Sends reminders for scheduled club events.',
      config: JSON.stringify({ sendTime: '10:00', offsets: [3, 1, 0] }),
      audienceType: 'ALL_ACTIVE', templateId: tplIds['Event Reminder'], status: 'ACTIVE',
    },
  });
  await db.automation.upsert({
    where: { id: 'seed-dues' },
    update: {},
    create: {
      id: 'seed-dues',
      name: 'Dues Reminder', type: 'DUES', triggerType: 'DUES',
      description: 'Reminds members about unpaid dues 3 days before and on the due date. Amounts are per-member.',
      config: JSON.stringify({ sendTime: '09:30', offsets: [3, 0] }),
      audienceType: 'DUES_RECORDS', templateId: tplIds['Dues Reminder'], status: 'ACTIVE',
    },
  });
  await db.automation.upsert({
    where: { id: 'seed-monthly' },
    update: {},
    create: {
      id: 'seed-monthly',
      name: 'Monthly PYC Greeting', type: 'CUSTOM', triggerType: 'MONTHLY',
      description: 'Custom automation — sends a monthly greeting to all active members on the 1st of every month.',
      config: JSON.stringify({ sendTime: '08:00', dayOfMonth: 1 }),
      audienceType: 'ALL_ACTIVE', templateId: tplIds['Monthly Greeting'], status: 'ACTIVE',
    },
  });
  console.log('✔ 5 automations (all ACTIVE)');

  // ---------- Meetings ----------
  await db.meeting.upsert({
    where: { id: 'seed-mtg-1' }, update: {},
    create: {
      id: 'seed-mtg-1', name: 'PYC Monthly General Meeting',
      date: addDaysStr(today, 2), startTime: '16:00', endTime: '18:00',
      venue: 'PYC Club House', description: 'September general meeting — agenda: anniversary planning, dues review, outreach program.',
      organizer: 'Kwame Adu (President)', status: 'SCHEDULED',
    },
  });
  await db.meeting.upsert({
    where: { id: 'seed-mtg-2' }, update: {},
    create: {
      id: 'seed-mtg-2', name: 'Executives Planning Session',
      date: addDaysStr(today, 6), startTime: '17:30', endTime: '19:00',
      venue: 'PYC Secretariat', description: 'Quarterly planning for executives.',
      organizer: 'Ama Mensah (Secretary)', targetGroupId: groups['Executives'], status: 'SCHEDULED',
    },
  });
  console.log('✔ meetings (Monthly General Meeting is in 2 days → reminder fires today at 09:00)');

  // ---------- Events ----------
  await db.event.upsert({
    where: { id: 'seed-evt-1' }, update: {},
    create: {
      id: 'seed-evt-1', name: 'Community Outreach — Accra Children\'s Home',
      date: addDaysStr(today, 1), startTime: '09:00', endTime: '14:00',
      venue: 'Accra Children\'s Home, Osu', eventType: 'OUTREACH',
      description: 'Donation drive and mentorship session with the children.',
      organizer: 'Welfare Committee', status: 'SCHEDULED',
    },
  });
  await db.event.upsert({
    where: { id: 'seed-evt-2' }, update: {},
    create: {
      id: 'seed-evt-2', name: 'PYC 15th Anniversary Celebration',
      date: addDaysStr(today, 7), startTime: '15:00', endTime: '20:00',
      venue: 'Accra International Conference Centre', eventType: 'ANNIVERSARY',
      description: 'Fifteen years of progressive youth development. Dress code: club colours.',
      organizer: 'Organizing Committee', status: 'SCHEDULED',
    },
  });
  console.log('✔ events (Outreach is tomorrow → reminder fires today at 10:00)');

  // ---------- Dues ----------
  const duesDefs: Array<[string, number, number, string]> = [
    // memberCode offset, amount, dueDateOffset, period
    ['PYC-0002', 50, 3, 'September 2026'],
    ['PYC-0003', 30, 3, 'September 2026'],
    ['PYC-0007', 50, 0, 'September 2026'],
    ['PYC-0010', 20, 10, 'September 2026'],
    ['PYC-0005', 50, -5, 'August 2026'],
  ];
  for (const [code, amount, dueOffset, period] of duesDefs) {
    const member = await db.member.findUnique({ where: { memberCode: code } });
    if (!member) continue;
    const dueDate = addDaysStr(today, dueOffset);
    const existing = await db.duesRecord.findFirst({ where: { memberId: member.id, period } });
    if (!existing) {
      await db.duesRecord.create({ data: { memberId: member.id, amount, currency: 'GHS', dueDate, period, paymentStatus: dueOffset < 0 ? 'UNPAID' : 'UNPAID' } });
    }
  }
  console.log('✔ dues records (amounts differ per member; 3-day reminders fire today at 09:30)');

  // ---------- Audit ----------
  const admin = await db.user.findUnique({ where: { username: 'admin' } });
  await db.auditLog.create({
    data: {
      userId: admin?.id, userName: 'admin', action: 'SYSTEM_SEEDED', module: 'SETTINGS',
      target: 'PYC SmartSMS', details: 'Database seeded with demo data', ip: 'local',
    },
  }).catch(() => {});

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
