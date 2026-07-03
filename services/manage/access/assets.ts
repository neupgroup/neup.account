'use server';

/*
::neup.documentation::manage-access-assets-removed
::title Removed Portfolio Asset Access

Compatibility exports for the removed portfolio asset-access system.

::public

Portfolio asset groups are no longer part of Neup Account. Read helpers return empty results, and mutation helpers return an explicit removed-feature error.

::public end

::private

These exports remain so older route components and forms fail closed while callers are migrated to direct account, application, and connection access flows.

::private end

::end
*/

const REMOVED_ERROR = 'Portfolio access has been removed.';

type RemovedResult = {
  success: false;
  error: string;
};

export type AccessAssetGroup = {
  id: string;
  name: string;
  description: string | null;
  members: Array<{
    id: string;
    memberAccountId: string | null;
    status: string;
    details: unknown;
  }>;
  assets: Array<{
    id: string;
    member_account_id: string | null;
    access_application_id: string | null;
    member_connection_id: string | null;
    access_type: string;
  }>;
};

export type AssetRole = {
  id: string;
  name: string;
  description?: string;
};

export type MemberAssetGrant = {
  id: string;
  assetId: string;
  assetName: string;
  assetType: string;
  roleId: string;
  roleIds: string[];
  roleName: string;
  roleDescription?: string;
};

function removed(): RemovedResult {
  return { success: false, error: REMOVED_ERROR };
}

export async function getAccessAssetGroups(): Promise<AccessAssetGroup[]> {
  return [];
}

export async function getAccessAssetGroup(_groupId: string): Promise<AccessAssetGroup | null> {
  return null;
}

export async function createAssetGroup(_input: { name: string; details?: string }): Promise<RemovedResult & { id?: never }> {
  return removed();
}

export async function addAssetGroupMember(_input: {
  groupId: string;
  member: string;
  isPermanent?: boolean;
  validTill?: Date;
  hasFullPermit?: boolean;
}): Promise<RemovedResult> {
  return removed();
}

export async function updatePortfolioMemberFlags(_input: {
  groupId: string;
  memberId: string;
  isPermanent: boolean;
  hasFullAccess: boolean;
}): Promise<RemovedResult> {
  return removed();
}

export async function addAssetToGroup(_input: {
  groupId: string;
  asset: string;
  type: string;
  details?: string;
}): Promise<RemovedResult> {
  return removed();
}

export async function addAssetToGroupWithMode(
  input: { groupId: string; asset: string; type: string; details?: string },
  _options?: { rootMode?: boolean },
): Promise<RemovedResult> {
  return addAssetToGroup(input);
}

export async function removeAssetFromGroup(_input: {
  groupId: string;
  portfolioAssetId: string;
}): Promise<RemovedResult> {
  return removed();
}

export async function removeAssetFromGroupWithMode(
  input: { groupId: string; portfolioAssetId: string },
  _options?: { rootMode?: boolean },
): Promise<RemovedResult> {
  return removeAssetFromGroup(input);
}

export async function removeAssetGroupMember(_input: {
  groupId: string;
  memberId: string;
}): Promise<RemovedResult> {
  return removed();
}

export async function assignAssetMemberRole(
  _input: {
    groupId?: string;
    assetMember: string;
    asset: string;
    role: string;
  },
  _options?: { rootMode?: boolean },
): Promise<RemovedResult> {
  return removed();
}

export async function getRolesForAsset(_portfolioAssetId: string): Promise<AssetRole[]> {
  return [];
}

export async function getRolesForAssetType(_assetType: string): Promise<AssetRole[]> {
  return [];
}

export async function bulkAssignAssetRoles(
  _input: {
    groupId: string;
    memberId: string;
    assetIds: string[];
    assetType: string;
    roleIds: string[];
  },
  _options?: { rootMode?: boolean },
): Promise<RemovedResult> {
  return removed();
}

export async function getMemberAssetGrants(
  _groupId: string,
  _memberId: string,
): Promise<MemberAssetGrant[]> {
  return [];
}
