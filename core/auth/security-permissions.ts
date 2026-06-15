export const SECURITY_PERMISSION_GROUPS = {
  password: ['security.pass.modify'],
  totp: ['security.totp.add', 'security.totp.remove'],
  backup: ['security.backup_codes.view', 'security.backup_codes.create'],
  recoveryAccounts: [
    'security.recovery_accounts.view',
    'security.recovery_accounts.add',
    'security.recovery_accounts.remove',
  ],
  recoveryPhone: [
    'security.recovery_phone.view',
    'security.recovery_phone.add',
    'security.recovery_phone.remove',
  ],
  recoveryEmail: [
    'security.recovery_email.view',
    'security.recovery_email.add',
    'security.recovery_email.remove',
  ],
  devices: ['security.login_devices.view'],
  recentActivities: ['security.recent_activities.view'],
  thirdParty: [
    'security.third_party.view',
    'security.third_party.add',
    'security.third_party.remove',
  ],
} as const;

export const SECURITY_HUB_PERMISSIONS = Array.from(
  new Set(Object.values(SECURITY_PERMISSION_GROUPS).flat()),
);
