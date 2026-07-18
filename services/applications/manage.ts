'use server';

import {
  canCurrentAccountUseRootApplicationMode as canCurrentAccountUseRootApplicationModeImpl,
  hasRootApplicationPermission as hasRootApplicationPermissionImpl,
  isApplicationOwnerForAccount as isApplicationOwnerForAccountImpl,
  resolveAvailableApplicationId as resolveAvailableApplicationIdImpl,
} from '@/services/applications/manage-shared';
import {
  getApplicationDetailsForViewer as getApplicationDetailsForViewerImpl,
  deleteManagedApplication as deleteManagedApplicationImpl,
  createManagedApplication as createManagedApplicationImpl,
  getManagedApplications as getManagedApplicationsImpl,
  getManagedApplication as getManagedApplicationImpl,
  saveApplicationSecret as saveApplicationSecretImpl,
  saveApplicationAccess as saveApplicationAccessImpl,
  saveApplicationPolicies as saveApplicationPoliciesImpl,
  saveApplicationEndpoints as saveApplicationEndpointsImpl,
  updateManagedApplicationStatus as updateManagedApplicationStatusImpl,
} from '@/services/applications/manage-core';
import {
  getApps as getAppsImpl,
  getAppDetails as getAppDetailsImpl,
} from '@/services/applications/manage-catalog';
import {
  getSilentSsoOrigins as getSilentSsoOriginsImpl,
  addSilentSsoOrigin as addSilentSsoOriginImpl,
  removeSilentSsoOrigin as removeSilentSsoOriginImpl,
  addServerIp as addServerIpImpl,
  removeServerIp as removeServerIpImpl,
} from '@/services/applications/manage-connections';
import {
  getApplicationDetailsForViewerV2 as getApplicationDetailsForViewerV2Impl,
  getApplicationDetailPageData as getApplicationDetailPageDataImpl,
} from '@/services/applications/manage-details';
import {
  canCurrentAccountManageApplicationRoles as canCurrentAccountManageApplicationRolesImpl,
  canCurrentAccountEditApplicationBasics as canCurrentAccountEditApplicationBasicsImpl,
  canCurrentAccountDeleteApplication as canCurrentAccountDeleteApplicationImpl,
  canCurrentAccountViewApplicationConfig as canCurrentAccountViewApplicationConfigImpl,
  canCurrentAccountUpdateApplicationConfig as canCurrentAccountUpdateApplicationConfigImpl,
  canCurrentAccountViewApplicationRoles as canCurrentAccountViewApplicationRolesImpl,
  canCurrentAccountResetApplicationRolePush as canCurrentAccountResetApplicationRolePushImpl,
  canCurrentAccountViewApplicationUsers as canCurrentAccountViewApplicationUsersImpl,
  canCurrentAccountRemoveApplicationUser as canCurrentAccountRemoveApplicationUserImpl,
  canCurrentAccountUpdateApplicationUserRole as canCurrentAccountUpdateApplicationUserRoleImpl,
  canCurrentAccountViewApplicationLogs as canCurrentAccountViewApplicationLogsImpl,
  canCurrentAccountViewApplicationDevLogs as canCurrentAccountViewApplicationDevLogsImpl,
  canCurrentAccountClearApplicationDevLogs as canCurrentAccountClearApplicationDevLogsImpl,
  canCurrentAccountViewApplication as canCurrentAccountViewApplicationImpl,
} from '@/services/applications/manage-permissions';
import {
  updateAppMeta as updateAppMetaImpl,
  getAppStatusLog as getAppStatusLogImpl,
  requestAppPublication as requestAppPublicationImpl,
  getAppPublicationRequestStatus as getAppPublicationRequestStatusImpl,
  getAppOwnershipData as getAppOwnershipDataImpl,
} from '@/services/applications/manage-lifecycle';
import {
  getApplicationUserStats as getApplicationUserStatsImpl,
  getApplicationUsersPaginated as getApplicationUsersPaginatedImpl,
  getApplicationUserConnectionDetails as getApplicationUserConnectionDetailsImpl,
  getApplicationRoleOptions as getApplicationRoleOptionsImpl,
  assignApplicationConnectionRole as assignApplicationConnectionRoleImpl,
} from '@/services/applications/manage-users';
import {
  updateAppEdit as updateAppEditImpl,
  saveAppConfig as saveAppConfigImpl,
  getAppConfigData as getAppConfigDataImpl,
  getApplicationAuthzConfig as getApplicationAuthzConfigImpl,
  saveAccountUpdateWebhookUrl as saveAccountUpdateWebhookUrlImpl,
  saveRoleUpdateWebhookUrl as saveRoleUpdateWebhookUrlImpl,
} from '@/services/applications/manage-config';
import {
  getApplicationDevLogs as getApplicationDevLogsImpl,
  getApplicationDevLogsPaginated as getApplicationDevLogsPaginatedImpl,
  clearApplicationDevLogs as clearApplicationDevLogsImpl,
  getApplicationLogPermissions as getApplicationLogPermissionsImpl,
  logRootApplicationActivity as logRootApplicationActivityImpl,
} from '@/services/applications/manage-logs';

export type { ApplicationDetailsForViewer } from '@/services/applications/manage-core';
export type { ApplicationDetailPageData } from '@/services/applications/manage-details';
export type { AppAccessEntry, AppOwnerEntry, AppOwnershipData, AppStatusLogEntry } from '@/services/applications/manage-lifecycle';
export type { ApplicationDevLogEntry, ApplicationDevLogsPage } from '@/services/applications/manage-logs';
export type { ApplicationUserStats, AppRoleOption, AppUserConnectionDetails, AppUserEntry, AppUsersPage, AppUserSortKey, AppUserStatus } from '@/services/applications/manage-users';

export async function canCurrentAccountUseRootApplicationMode(...args: Parameters<typeof canCurrentAccountUseRootApplicationModeImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountUseRootApplicationModeImpl>>> {
  return canCurrentAccountUseRootApplicationModeImpl(...args);
}

export async function hasRootApplicationPermission(...args: Parameters<typeof hasRootApplicationPermissionImpl>): Promise<Awaited<ReturnType<typeof hasRootApplicationPermissionImpl>>> {
  return hasRootApplicationPermissionImpl(...args);
}

export async function isApplicationOwnerForAccount(...args: Parameters<typeof isApplicationOwnerForAccountImpl>): Promise<Awaited<ReturnType<typeof isApplicationOwnerForAccountImpl>>> {
  return isApplicationOwnerForAccountImpl(...args);
}

export async function resolveAvailableApplicationId(...args: Parameters<typeof resolveAvailableApplicationIdImpl>): Promise<Awaited<ReturnType<typeof resolveAvailableApplicationIdImpl>>> {
  return resolveAvailableApplicationIdImpl(...args);
}

export async function getApplicationDetailsForViewer(...args: Parameters<typeof getApplicationDetailsForViewerImpl>): Promise<Awaited<ReturnType<typeof getApplicationDetailsForViewerImpl>>> {
  return getApplicationDetailsForViewerImpl(...args);
}

export async function deleteManagedApplication(...args: Parameters<typeof deleteManagedApplicationImpl>): Promise<Awaited<ReturnType<typeof deleteManagedApplicationImpl>>> {
  return deleteManagedApplicationImpl(...args);
}

export async function createManagedApplication(...args: Parameters<typeof createManagedApplicationImpl>): Promise<Awaited<ReturnType<typeof createManagedApplicationImpl>>> {
  return createManagedApplicationImpl(...args);
}

export async function getManagedApplications(...args: Parameters<typeof getManagedApplicationsImpl>): Promise<Awaited<ReturnType<typeof getManagedApplicationsImpl>>> {
  return getManagedApplicationsImpl(...args);
}

export async function getManagedApplication(...args: Parameters<typeof getManagedApplicationImpl>): Promise<Awaited<ReturnType<typeof getManagedApplicationImpl>>> {
  return getManagedApplicationImpl(...args);
}

export async function saveApplicationSecret(...args: Parameters<typeof saveApplicationSecretImpl>): Promise<Awaited<ReturnType<typeof saveApplicationSecretImpl>>> {
  return saveApplicationSecretImpl(...args);
}

export async function saveApplicationAccess(...args: Parameters<typeof saveApplicationAccessImpl>): Promise<Awaited<ReturnType<typeof saveApplicationAccessImpl>>> {
  return saveApplicationAccessImpl(...args);
}

export async function saveApplicationPolicies(...args: Parameters<typeof saveApplicationPoliciesImpl>): Promise<Awaited<ReturnType<typeof saveApplicationPoliciesImpl>>> {
  return saveApplicationPoliciesImpl(...args);
}

export async function saveApplicationEndpoints(...args: Parameters<typeof saveApplicationEndpointsImpl>): Promise<Awaited<ReturnType<typeof saveApplicationEndpointsImpl>>> {
  return saveApplicationEndpointsImpl(...args);
}

export async function updateManagedApplicationStatus(...args: Parameters<typeof updateManagedApplicationStatusImpl>): Promise<Awaited<ReturnType<typeof updateManagedApplicationStatusImpl>>> {
  return updateManagedApplicationStatusImpl(...args);
}

export async function getApps(...args: Parameters<typeof getAppsImpl>): Promise<Awaited<ReturnType<typeof getAppsImpl>>> {
  return getAppsImpl(...args);
}

export async function getAppDetails(...args: Parameters<typeof getAppDetailsImpl>): Promise<Awaited<ReturnType<typeof getAppDetailsImpl>>> {
  return getAppDetailsImpl(...args);
}

export async function getSilentSsoOrigins(...args: Parameters<typeof getSilentSsoOriginsImpl>): Promise<Awaited<ReturnType<typeof getSilentSsoOriginsImpl>>> {
  return getSilentSsoOriginsImpl(...args);
}

export async function addSilentSsoOrigin(...args: Parameters<typeof addSilentSsoOriginImpl>): Promise<Awaited<ReturnType<typeof addSilentSsoOriginImpl>>> {
  return addSilentSsoOriginImpl(...args);
}

export async function removeSilentSsoOrigin(...args: Parameters<typeof removeSilentSsoOriginImpl>): Promise<Awaited<ReturnType<typeof removeSilentSsoOriginImpl>>> {
  return removeSilentSsoOriginImpl(...args);
}

export async function addServerIp(...args: Parameters<typeof addServerIpImpl>): Promise<Awaited<ReturnType<typeof addServerIpImpl>>> {
  return addServerIpImpl(...args);
}

export async function removeServerIp(...args: Parameters<typeof removeServerIpImpl>): Promise<Awaited<ReturnType<typeof removeServerIpImpl>>> {
  return removeServerIpImpl(...args);
}

export async function getApplicationDetailsForViewerV2(...args: Parameters<typeof getApplicationDetailsForViewerV2Impl>): Promise<Awaited<ReturnType<typeof getApplicationDetailsForViewerV2Impl>>> {
  return getApplicationDetailsForViewerV2Impl(...args);
}

export async function getApplicationDetailPageData(...args: Parameters<typeof getApplicationDetailPageDataImpl>): Promise<Awaited<ReturnType<typeof getApplicationDetailPageDataImpl>>> {
  return getApplicationDetailPageDataImpl(...args);
}

export async function canCurrentAccountManageApplicationRoles(...args: Parameters<typeof canCurrentAccountManageApplicationRolesImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountManageApplicationRolesImpl>>> {
  return canCurrentAccountManageApplicationRolesImpl(...args);
}

export async function canCurrentAccountEditApplicationBasics(...args: Parameters<typeof canCurrentAccountEditApplicationBasicsImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountEditApplicationBasicsImpl>>> {
  return canCurrentAccountEditApplicationBasicsImpl(...args);
}

export async function canCurrentAccountDeleteApplication(...args: Parameters<typeof canCurrentAccountDeleteApplicationImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountDeleteApplicationImpl>>> {
  return canCurrentAccountDeleteApplicationImpl(...args);
}

export async function canCurrentAccountViewApplicationConfig(...args: Parameters<typeof canCurrentAccountViewApplicationConfigImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountViewApplicationConfigImpl>>> {
  return canCurrentAccountViewApplicationConfigImpl(...args);
}

export async function canCurrentAccountUpdateApplicationConfig(...args: Parameters<typeof canCurrentAccountUpdateApplicationConfigImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountUpdateApplicationConfigImpl>>> {
  return canCurrentAccountUpdateApplicationConfigImpl(...args);
}

export async function canCurrentAccountViewApplicationRoles(...args: Parameters<typeof canCurrentAccountViewApplicationRolesImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountViewApplicationRolesImpl>>> {
  return canCurrentAccountViewApplicationRolesImpl(...args);
}

export async function canCurrentAccountResetApplicationRolePush(...args: Parameters<typeof canCurrentAccountResetApplicationRolePushImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountResetApplicationRolePushImpl>>> {
  return canCurrentAccountResetApplicationRolePushImpl(...args);
}

export async function canCurrentAccountViewApplicationUsers(...args: Parameters<typeof canCurrentAccountViewApplicationUsersImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountViewApplicationUsersImpl>>> {
  return canCurrentAccountViewApplicationUsersImpl(...args);
}

export async function canCurrentAccountRemoveApplicationUser(...args: Parameters<typeof canCurrentAccountRemoveApplicationUserImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountRemoveApplicationUserImpl>>> {
  return canCurrentAccountRemoveApplicationUserImpl(...args);
}

export async function canCurrentAccountUpdateApplicationUserRole(...args: Parameters<typeof canCurrentAccountUpdateApplicationUserRoleImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountUpdateApplicationUserRoleImpl>>> {
  return canCurrentAccountUpdateApplicationUserRoleImpl(...args);
}

export async function canCurrentAccountViewApplicationLogs(...args: Parameters<typeof canCurrentAccountViewApplicationLogsImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountViewApplicationLogsImpl>>> {
  return canCurrentAccountViewApplicationLogsImpl(...args);
}

export async function canCurrentAccountViewApplicationDevLogs(...args: Parameters<typeof canCurrentAccountViewApplicationDevLogsImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountViewApplicationDevLogsImpl>>> {
  return canCurrentAccountViewApplicationDevLogsImpl(...args);
}

export async function canCurrentAccountClearApplicationDevLogs(...args: Parameters<typeof canCurrentAccountClearApplicationDevLogsImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountClearApplicationDevLogsImpl>>> {
  return canCurrentAccountClearApplicationDevLogsImpl(...args);
}

export async function canCurrentAccountViewApplication(...args: Parameters<typeof canCurrentAccountViewApplicationImpl>): Promise<Awaited<ReturnType<typeof canCurrentAccountViewApplicationImpl>>> {
  return canCurrentAccountViewApplicationImpl(...args);
}

export async function updateAppMeta(...args: Parameters<typeof updateAppMetaImpl>): Promise<Awaited<ReturnType<typeof updateAppMetaImpl>>> {
  return updateAppMetaImpl(...args);
}

export async function getAppStatusLog(...args: Parameters<typeof getAppStatusLogImpl>): Promise<Awaited<ReturnType<typeof getAppStatusLogImpl>>> {
  return getAppStatusLogImpl(...args);
}

export async function requestAppPublication(...args: Parameters<typeof requestAppPublicationImpl>): Promise<Awaited<ReturnType<typeof requestAppPublicationImpl>>> {
  return requestAppPublicationImpl(...args);
}

export async function getAppPublicationRequestStatus(...args: Parameters<typeof getAppPublicationRequestStatusImpl>): Promise<Awaited<ReturnType<typeof getAppPublicationRequestStatusImpl>>> {
  return getAppPublicationRequestStatusImpl(...args);
}

export async function getAppOwnershipData(...args: Parameters<typeof getAppOwnershipDataImpl>): Promise<Awaited<ReturnType<typeof getAppOwnershipDataImpl>>> {
  return getAppOwnershipDataImpl(...args);
}

export async function getApplicationUserStats(...args: Parameters<typeof getApplicationUserStatsImpl>): Promise<Awaited<ReturnType<typeof getApplicationUserStatsImpl>>> {
  return getApplicationUserStatsImpl(...args);
}

export async function getApplicationUsersPaginated(...args: Parameters<typeof getApplicationUsersPaginatedImpl>): Promise<Awaited<ReturnType<typeof getApplicationUsersPaginatedImpl>>> {
  return getApplicationUsersPaginatedImpl(...args);
}

export async function getApplicationUserConnectionDetails(...args: Parameters<typeof getApplicationUserConnectionDetailsImpl>): Promise<Awaited<ReturnType<typeof getApplicationUserConnectionDetailsImpl>>> {
  return getApplicationUserConnectionDetailsImpl(...args);
}

export async function getApplicationRoleOptions(...args: Parameters<typeof getApplicationRoleOptionsImpl>): Promise<Awaited<ReturnType<typeof getApplicationRoleOptionsImpl>>> {
  return getApplicationRoleOptionsImpl(...args);
}

export async function assignApplicationConnectionRole(...args: Parameters<typeof assignApplicationConnectionRoleImpl>): Promise<Awaited<ReturnType<typeof assignApplicationConnectionRoleImpl>>> {
  return assignApplicationConnectionRoleImpl(...args);
}

export async function updateAppEdit(...args: Parameters<typeof updateAppEditImpl>): Promise<Awaited<ReturnType<typeof updateAppEditImpl>>> {
  return updateAppEditImpl(...args);
}

export async function saveAppConfig(...args: Parameters<typeof saveAppConfigImpl>): Promise<Awaited<ReturnType<typeof saveAppConfigImpl>>> {
  return saveAppConfigImpl(...args);
}

export async function getAppConfigData(...args: Parameters<typeof getAppConfigDataImpl>): Promise<Awaited<ReturnType<typeof getAppConfigDataImpl>>> {
  return getAppConfigDataImpl(...args);
}

export async function getApplicationAuthzConfig(...args: Parameters<typeof getApplicationAuthzConfigImpl>): Promise<Awaited<ReturnType<typeof getApplicationAuthzConfigImpl>>> {
  return getApplicationAuthzConfigImpl(...args);
}

export async function saveAccountUpdateWebhookUrl(...args: Parameters<typeof saveAccountUpdateWebhookUrlImpl>): Promise<Awaited<ReturnType<typeof saveAccountUpdateWebhookUrlImpl>>> {
  return saveAccountUpdateWebhookUrlImpl(...args);
}

export async function saveRoleUpdateWebhookUrl(...args: Parameters<typeof saveRoleUpdateWebhookUrlImpl>): Promise<Awaited<ReturnType<typeof saveRoleUpdateWebhookUrlImpl>>> {
  return saveRoleUpdateWebhookUrlImpl(...args);
}

export async function getApplicationDevLogs(...args: Parameters<typeof getApplicationDevLogsImpl>): Promise<Awaited<ReturnType<typeof getApplicationDevLogsImpl>>> {
  return getApplicationDevLogsImpl(...args);
}

export async function getApplicationDevLogsPaginated(...args: Parameters<typeof getApplicationDevLogsPaginatedImpl>): Promise<Awaited<ReturnType<typeof getApplicationDevLogsPaginatedImpl>>> {
  return getApplicationDevLogsPaginatedImpl(...args);
}

export async function clearApplicationDevLogs(...args: Parameters<typeof clearApplicationDevLogsImpl>): Promise<Awaited<ReturnType<typeof clearApplicationDevLogsImpl>>> {
  return clearApplicationDevLogsImpl(...args);
}

export async function getApplicationLogPermissions(...args: Parameters<typeof getApplicationLogPermissionsImpl>): Promise<Awaited<ReturnType<typeof getApplicationLogPermissionsImpl>>> {
  return getApplicationLogPermissionsImpl(...args);
}

export async function logRootApplicationActivity(...args: Parameters<typeof logRootApplicationActivityImpl>): Promise<Awaited<ReturnType<typeof logRootApplicationActivityImpl>>> {
  return logRootApplicationActivityImpl(...args);
}
