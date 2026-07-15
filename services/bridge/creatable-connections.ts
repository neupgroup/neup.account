import { getAccessableAccountsWithPermissions, type AccountBasicsWithPermissions } from '@/services/manage/accounts';
import { resolveNeupAccountPermissionCandidates } from '@/inapp/permissions/permission-catalog';

const ACCOUNT_CONNECTION_CREATE_PERMISSIONS: Record<string, readonly string[]> = {
  individual: [
    'access.connection.create.individual',
    'access.application.add',
  ],
  brand: [
    'access.connection.create.brand',
    'brand.platforms.manage',
    'linked_accounts.brand.manage',
    'linked_accounts.brand.manager',
    'access.application.add',
  ],
  subbrand: [
    'access.connection.create.brand',
    'brand.platforms.manage',
    'linked_accounts.brand.manage',
    'linked_accounts.brand.manager',
    'access.application.add',
  ],
  branch: [
    'access.connection.create.brand',
    'brand.platforms.manage',
    'linked_accounts.brand.manage',
    'linked_accounts.brand.manager',
    'access.application.add',
  ],
  dependent: [
    'access.connection.create.dependent',
    'access.application.add',
  ],
};

/*
::neup.documentation::bridge-creatable-connections-service
::title Creatable Connections Bridge Service

Shared service helpers for accounts that may create application connections.

::public

Use this module when a bridge route or helper needs accounts the caller can both access and use to create a connection.

::public end

::private

Eligibility requires an accessible delegated account plus at least one account-type-specific connection-creation permission on that target account.

::private end

::end
*/

export function canCreateConnectionForAccount(account: {
  accountType: string;
  permissions: string[];
}): boolean {
  const allowedPermissions = ACCOUNT_CONNECTION_CREATE_PERMISSIONS[account.accountType];
  if (!allowedPermissions || allowedPermissions.length === 0) {
    return false;
  }

  return allowedPermissions.some((requiredPermission) => {
    const candidates = new Set([
      ...resolveNeupAccountPermissionCandidates(requiredPermission, 'managed'),
      ...resolveNeupAccountPermissionCandidates(requiredPermission, 'selfOrRoot'),
    ]);

    return account.permissions.some((permission) => candidates.has(permission));
  });
}

export async function getCreatableConnectionAccounts(
  accountId: string,
): Promise<AccountBasicsWithPermissions[]> {
  const accounts = await getAccessableAccountsWithPermissions(accountId);
  return accounts.filter((account) => canCreateConnectionForAccount(account));
}
