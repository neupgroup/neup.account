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
    'security.third_party.view.self',
    'security.third_party.add.self',
    'security.third_party.remove.self',
  ],
} as const;

export const SECURITY_HUB_PERMISSIONS = Array.from(
  new Set(Object.values(SECURITY_PERMISSION_GROUPS).flat()),
);
