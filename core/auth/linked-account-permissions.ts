export const LINKED_ACCOUNT_PERMISSION_GROUPS = {
  brand: [
    'linked_accounts.brand.create.self',
    'linked_accounts.brand.view.self',
    'linked_accounts.brand.manage.self',
    'linked_accounts.brand.manager.self',
  ],
  dependent: [
    'linked_accounts.dependent.create.self',
    'linked_accounts.dependent.view.self',
  ],
} as const;

export const LINKED_ACCOUNT_NAV_PERMISSIONS = Array.from(
  new Set(Object.values(LINKED_ACCOUNT_PERMISSION_GROUPS).flat()),
);
