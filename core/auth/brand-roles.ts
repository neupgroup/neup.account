export const BRAND_OWNER_ROLE_ID = 'neup_account.brand_owner';
export const BRAND_OWNER_ROLE_NAME = 'neup_account.brand_owner';

export const BRAND_OWNER_PERMISSION_NAMES = [
  'brand.profile.view',
  'brand.profile.edit',
  'brand.settings.view',
  'brand.settings.edit',
  'brand.members.view',
  'access.view',
  'account.brand.members.manage',
  'linked_accounts.brand.view',
  'linked_accounts.brand.manage',
  'linked_accounts.brand.manager',
  'account.brand.kyc.view',
  'account.brand.kyc.submit',
  'brand.platforms.view',
  'brand.platforms.manage',
  'account.brand.delete',
] as const;

export const BRAND_ROOT_PERMISSION_NAMES = [
  'account.brand.delete',
  'account.brand.kyc.submit',
  'account.brand.kyc.view',
  'account.brand.members.manage',
] as const;
