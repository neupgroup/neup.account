export const ACCOUNT_ACCESS_PERMISSION_GROUPS = {
  view: ['root.account.access.view'],
  edit: ['root.account.access.edit'],
} as const;

export const ACCOUNT_ACCESS_NAV_PERMISSIONS = Array.from(
  new Set(Object.values(ACCOUNT_ACCESS_PERMISSION_GROUPS).flat()),
);
