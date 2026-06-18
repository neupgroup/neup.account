export const BRAND_OWNER_ROLE_ID = 'neup_account.brand_owner';
export const BRAND_OWNER_ROLE_NAME = 'neup_account.brand_owner';

export const BRAND_OWNER_PERMISSION_NAMES = [
  'brand.profile.view',
  'brand.profile.edit',
  'brand.settings.view',
  'brand.settings.edit',
  'brand.members.view',
  'account.brand.members.manage.scopeManaged',
  'linked_accounts.brand.view',
  'linked_accounts.brand.manage',
  'linked_accounts.brand.manager',
  'account.brand.kyc.view.scopeManaged',
  'account.brand.kyc.submit.scopeManaged',
  'brand.platforms.view',
  'brand.platforms.manage',
  'account.brand.delete.scopeManaged',
] as const;

export const BRAND_ROOT_PERMISSION_NAMES = [
  'account.brand.delete.scopeRoot',
  'account.brand.kyc.submit.scopeRoot',
  'account.brand.kyc.view.scopeRoot',
  'account.brand.members.manage.scopeRoot',
] as const;
