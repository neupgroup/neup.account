export const LINKED_ACCOUNT_PERMISSION_GROUPS = {
  brand: [
    'linked_accounts.brand.create',
    'linked_accounts.brand.view',
    'linked_accounts.brand.manage',
    'linked_accounts.brand.manager',
  ],
  dependent: [
    'linked_accounts.dependent.create',
    'linked_accounts.dependent.view',
  ],
} as const;

export const LINKED_ACCOUNT_NAV_PERMISSIONS = Array.from(
  new Set(Object.values(LINKED_ACCOUNT_PERMISSION_GROUPS).flat()),
);
