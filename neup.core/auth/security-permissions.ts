import {
  ACCESS_APPLICATION_ADD_PERMISSIONS,
  ACCESS_APPLICATION_REMOVE_PERMISSIONS,
  ACCESS_APPLICATION_VIEW_PERMISSIONS,
  ACCESS_CONNECTION_ADD_PERMISSIONS,
  ACCESS_CONNECTION_REMOVE_PERMISSIONS,
  ACCESS_CONNECTION_VIEW_PERMISSIONS,
} from '@/neup.core/auth/access-view-permissions';

export const SECURITY_PERMISSION_GROUPS = {
  password: ['security.pass.modify.self'],
  totp: ['security.totp.add.self', 'security.totp.remove.self'],
  backup: ['security.backup_codes.view.self', 'security.backup_codes.create.self'],
  recoveryAccounts: [
    'security.recovery_accounts.view.self',
    'security.recovery_accounts.add.self',
    'security.recovery_accounts.remove.self',
  ],
  recoveryPhone: [
    'security.recovery_phone.view.self',
    'security.recovery_phone.add.self',
    'security.recovery_phone.remove.self',
  ],
  recoveryEmail: [
    'security.recovery_email.view.self',
    'security.recovery_email.add.self',
    'security.recovery_email.remove.self',
  ],
  devices: ['security.login_devices.view.self'],
  recentActivities: ['security.recent_activities.view.self'],
  thirdParty: [
    ...ACCESS_CONNECTION_VIEW_PERMISSIONS,
    ...ACCESS_CONNECTION_ADD_PERMISSIONS,
    ...ACCESS_CONNECTION_REMOVE_PERMISSIONS,
    ...ACCESS_APPLICATION_VIEW_PERMISSIONS,
    ...ACCESS_APPLICATION_ADD_PERMISSIONS,
    ...ACCESS_APPLICATION_REMOVE_PERMISSIONS,
  ],
} as const;

export const SECURITY_HUB_PERMISSIONS = Array.from(
  new Set(Object.values(SECURITY_PERMISSION_GROUPS).flat()),
);

export type SecurityHubItem = {
  href: string;
  title: string;
  description: string;
  permissions: readonly string[];
  section: 'signIn' | 'recovery' | 'checks';
};

export const SECURITY_HUB_ITEMS: SecurityHubItem[] = [
  {
    section: 'signIn',
    href: '/security/password',
    title: 'Password',
    description: 'Change your password regularly to keep your account secure.',
    permissions: SECURITY_PERMISSION_GROUPS.password,
  },
  {
    section: 'signIn',
    href: '/security/totp',
    title: 'Authenticator App',
    description: 'Use an app for an extra layer of security (2FA).',
    permissions: SECURITY_PERMISSION_GROUPS.totp,
  },
  {
    section: 'recovery',
    href: '/security/backup',
    title: 'Backup Codes',
    description: 'Save codes to use if you lose access to your other recovery methods.',
    permissions: SECURITY_PERMISSION_GROUPS.backup,
  },
  {
    section: 'recovery',
    href: '/security/account',
    title: 'Recovery Account',
    description: 'Designate other NeupID accounts that can help you recover yours.',
    permissions: SECURITY_PERMISSION_GROUPS.recoveryAccounts,
  },
  {
    section: 'recovery',
    href: '/security/phone',
    title: 'Recovery Phone',
    description: 'Add or update your recovery phone number.',
    permissions: SECURITY_PERMISSION_GROUPS.recoveryPhone,
  },
  {
    section: 'recovery',
    href: '/security/email',
    title: 'Recovery Email',
    description: 'Add or update your recovery email address.',
    permissions: SECURITY_PERMISSION_GROUPS.recoveryEmail,
  },
  {
    section: 'checks',
    href: '/security/devices',
    title: 'Your Devices',
    description: 'See where you\'re signed in.',
    permissions: SECURITY_PERMISSION_GROUPS.devices,
  },
  {
    section: 'checks',
    href: '/data',
    title: 'Third-Party Apps',
    description: 'Manage apps that have access to your account data.',
    permissions: SECURITY_PERMISSION_GROUPS.thirdParty,
  },
];
