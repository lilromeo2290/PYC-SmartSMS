// Permission catalog + role defaults — database-driven, enforced server-side.
export interface PermissionDef {
  key: string;
  module: string;
  description: string;
  sortOrder: number;
}

export const PERMISSIONS: PermissionDef[] = [
  // Members
  { key: 'members.view', module: 'Members', description: 'View member register', sortOrder: 1 },
  { key: 'members.create', module: 'Members', description: 'Add new members', sortOrder: 2 },
  { key: 'members.edit', module: 'Members', description: 'Edit member records', sortOrder: 3 },
  { key: 'members.delete', module: 'Members', description: 'Deactivate/remove members', sortOrder: 4 },
  { key: 'members.import', module: 'Members', description: 'Import members from CSV/Excel', sortOrder: 5 },
  { key: 'groups.manage', module: 'Members', description: 'Create and manage member groups', sortOrder: 6 },
  // SMS
  { key: 'sms.send', module: 'SMS', description: 'Send individual SMS', sortOrder: 10 },
  { key: 'sms.group', module: 'SMS', description: 'Send group SMS', sortOrder: 11 },
  { key: 'sms.schedule', module: 'SMS', description: 'Schedule SMS for later', sortOrder: 12 },
  { key: 'sms.history', module: 'SMS', description: 'View SMS history', sortOrder: 13 },
  { key: 'sms.reports', module: 'SMS', description: 'View delivery reports', sortOrder: 14 },
  // Automation
  { key: 'automation.view', module: 'Automation', description: 'View automations and executions', sortOrder: 20 },
  { key: 'automation.create', module: 'Automation', description: 'Create automations', sortOrder: 21 },
  { key: 'automation.edit', module: 'Automation', description: 'Edit automations', sortOrder: 22 },
  { key: 'automation.activate', module: 'Automation', description: 'Activate/deactivate automations', sortOrder: 23 },
  { key: 'automation.run', module: 'Automation', description: 'Run automations manually', sortOrder: 24 },
  { key: 'dues.manage', module: 'Automation', description: 'Manage dues records', sortOrder: 25 },
  // Templates
  { key: 'templates.view', module: 'Templates', description: 'View SMS templates', sortOrder: 30 },
  { key: 'templates.create', module: 'Templates', description: 'Create templates', sortOrder: 31 },
  { key: 'templates.edit', module: 'Templates', description: 'Edit/duplicate templates', sortOrder: 32 },
  { key: 'templates.delete', module: 'Templates', description: 'Delete templates', sortOrder: 33 },
  // Events
  { key: 'events.manage', module: 'Events', description: 'Manage meetings and events', sortOrder: 40 },
  // Reports
  { key: 'reports.view', module: 'Reports', description: 'View reports', sortOrder: 50 },
  // Settings
  { key: 'settings.sms', module: 'Settings', description: 'Configure SMS provider', sortOrder: 60 },
  { key: 'variables.manage', module: 'Settings', description: 'Manage SMS variables', sortOrder: 61 },
  { key: 'settings.club', module: 'Settings', description: 'Manage club information', sortOrder: 62 },
  { key: 'users.manage', module: 'Settings', description: 'Manage users and permissions', sortOrder: 63 },
  // Audit
  { key: 'audit.view', module: 'Audit', description: 'View audit trail', sortOrder: 70 },
];

export const ROLES = ['SUPER_ADMIN', 'SMS_MANAGER', 'EVENT_COORDINATOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Software Administrator',
  SMS_MANAGER: 'SMS Manager',
  EVENT_COORDINATOR: 'Event Coordinator',
  VIEWER: 'Viewer',
};

function allKeys(): string[] { return PERMISSIONS.map(p => p.key); }

/** Default permission matrix per role (seeded into RolePermission, editable in DB). */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: allKeys(),
  SMS_MANAGER: [
    'members.view', 'members.create', 'members.edit', 'members.import', 'groups.manage',
    'sms.send', 'sms.group', 'sms.schedule', 'sms.history', 'sms.reports',
    'automation.view', 'automation.create', 'automation.edit', 'automation.activate', 'automation.run',
    'dues.manage',
    'templates.view', 'templates.create', 'templates.edit',
    'events.manage', 'reports.view', 'settings.sms', 'variables.manage',
  ],
  EVENT_COORDINATOR: [
    'members.view', 'groups.manage',
    'sms.send', 'sms.history',
    'automation.view', 'automation.create', 'automation.edit', 'automation.run',
    'templates.view', 'templates.create', 'templates.edit',
    'events.manage', 'dues.manage', 'reports.view',
  ],
  VIEWER: [
    'members.view', 'sms.history', 'sms.reports', 'automation.view',
    'templates.view', 'reports.view',
  ],
};
