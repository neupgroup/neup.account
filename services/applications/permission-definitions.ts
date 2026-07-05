/*
::neup.documentation::application-permission-definitions
::title Application Permission Definitions

Defines the built-in application-management permissions that are seeded into the authz catalog.

::public

Each permission definition includes its generated permission name, human description, and the `scope_for` / `scope_level` policy used by authz management.

::public end

::end
*/

import {
  type AuthzScopeFor,
  type AuthzScopeLevel,
  getStoredPolicyForScopeLevel,
} from '@/services/applications/authz-scope-policy';

export type ApplicationPermissionBase =
  | 'basics.edit'
  | 'config.update'
  | 'config.view'
  | 'create'
  | 'delete'
  | 'devlogs.clear'
  | 'devlogs.view'
  | 'logs.view'
  | 'roles.manage'
  | 'roles.resetPush'
  | 'roles.view'
  | 'user.remove'
  | 'user.updateBasics'
  | 'user.updateRole'
  | 'user.view'
  | 'view';

export type ApplicationPermissionAudience = 'managed' | 'public' | 'root';

type ApplicationPermissionDefinition = {
  description: string;
  suffix: string;
};

type ApplicationPermissionPolicyDefinition = {
  scopeFor: AuthzScopeFor[];
  scopeLevel: AuthzScopeLevel[];
};

const APPLICATION_PERMISSION_DEFINITION_MAP: Record<ApplicationPermissionBase, ApplicationPermissionDefinition> = {
  'basics.edit': {
    suffix: 'basics.edit',
    description: 'Edit application basics such as name, description, icon, website, and status requests.',
  },
  'config.update': {
    suffix: 'config.update',
    description: 'Update application configuration, secrets, response fields, endpoints, and webhook settings.',
  },
  'config.view': {
    suffix: 'config.view',
    description: 'View application configuration details.',
  },
  create: {
    suffix: 'create',
    description: 'Create a new application.',
  },
  delete: {
    suffix: 'delete',
    description: 'Delete or deactivate an application.',
  },
  'devlogs.clear': {
    suffix: 'devlogs.clear',
    description: 'Clear captured development API logs for the application.',
  },
  'devlogs.view': {
    suffix: 'devlogs.view',
    description: 'View development API request/response logs for the application.',
  },
  'logs.view': {
    suffix: 'logs.view',
    description: 'View application activity logs.',
  },
  'roles.manage': {
    suffix: 'roles.manage',
    description: 'Create, update, and delete application roles and permissions.',
  },
  'roles.resetPush': {
    suffix: 'roles.resetPush',
    description: 'Reset role/authz push status so the application can re-sync from scratch.',
  },
  'roles.view': {
    suffix: 'roles.view',
    description: 'View application roles and permissions.',
  },
  'user.remove': {
    suffix: 'user.remove',
    description: 'Remove a user connection from the application.',
  },
  'user.updateBasics': {
    suffix: 'user.updateBasics',
    description: 'Update basic application-user details.',
  },
  'user.updateRole': {
    suffix: 'user.updateRole',
    description: 'Assign or change application roles for connected users.',
  },
  'user.view': {
    suffix: 'user.view',
    description: 'View connected users for the application.',
  },
  view: {
    suffix: 'view',
    description: 'View application details and settings.',
  },
};

function permissionName(base: ApplicationPermissionBase, audience: ApplicationPermissionAudience): string {
  const suffix = APPLICATION_PERMISSION_DEFINITION_MAP[base].suffix;
  void audience;
  return `application.${suffix}`;
}

function permissionDescription(base: ApplicationPermissionBase, audience: ApplicationPermissionAudience): string {
  const baseDescription = APPLICATION_PERMISSION_DEFINITION_MAP[base].description;
  void audience;
  return baseDescription;
}

function permissionPolicyDefinition(audience: ApplicationPermissionAudience): ApplicationPermissionPolicyDefinition {
  if (audience === 'root') {
    return {
      scopeFor: ['for_individual'],
      scopeLevel: ['rootManaged'],
    };
  }

  if (audience === 'managed') {
    return {
      scopeFor: ['for_individual'],
      scopeLevel: ['assignable'],
    };
  }

  return {
    scopeFor: ['for_individual'],
    scopeLevel: ['publiclyEnrollable'],
  };
}

export function getApplicationPermissionName(
  base: ApplicationPermissionBase,
  audience: ApplicationPermissionAudience,
): string {
  return permissionName(base, audience);
}

export function getApplicationPermissionNames(
  bases: readonly ApplicationPermissionBase[],
  audiences: readonly ApplicationPermissionAudience[],
): string[] {
  return Array.from(new Set(
    bases.flatMap((base) => audiences.map((audience) => permissionName(base, audience))),
  ));
}

export function getApplicationPermissionDefinitions(
  audiences: readonly ApplicationPermissionAudience[],
): Array<{
  name: string;
  description: string;
  scopeFor: AuthzScopeFor[];
  scopeLevel: AuthzScopeLevel[];
  acquisitionType: string;
  approvalPolicy: string;
}> {
  const definitions = new Map<string, {
    name: string;
    description: string;
    scopeFor: AuthzScopeFor[];
    scopeLevel: AuthzScopeLevel[];
    acquisitionType: string;
    approvalPolicy: string;
  }>();

  for (const audience of audiences) {
    for (const base of Object.keys(APPLICATION_PERMISSION_DEFINITION_MAP) as ApplicationPermissionBase[]) {
      const name = permissionName(base, audience);
      const policy = permissionPolicyDefinition(audience);
      const existing = definitions.get(name);
      const storedPolicy = getStoredPolicyForScopeLevel(policy.scopeLevel[0] ?? 'assignable');

      if (existing) {
        existing.scopeFor = Array.from(new Set([...existing.scopeFor, ...policy.scopeFor]));
        existing.scopeLevel = Array.from(new Set([...existing.scopeLevel, ...policy.scopeLevel]));
        continue;
      }

      definitions.set(name, {
        name,
        description: permissionDescription(base, audience),
        scopeFor: [...policy.scopeFor],
        scopeLevel: [...policy.scopeLevel],
        acquisitionType: storedPolicy.acquisitionType,
        approvalPolicy: storedPolicy.approvalPolicy,
      });
    }
  }

  return Array.from(definitions.values());
}

export const ROOT_APPLICATION_VIEW_PERMISSION = getApplicationPermissionName('view', 'root');
export const ROOT_APPLICATION_CREATE_PERMISSION = getApplicationPermissionName('create', 'root');
export const ROOT_APPLICATION_BASICS_EDIT_PERMISSION = getApplicationPermissionName('basics.edit', 'root');
export const ROOT_APPLICATION_CONFIG_VIEW_PERMISSION = getApplicationPermissionName('config.view', 'root');
export const ROOT_APPLICATION_CONFIG_UPDATE_PERMISSION = getApplicationPermissionName('config.update', 'root');
export const ROOT_APPLICATION_DELETE_PERMISSION = getApplicationPermissionName('delete', 'root');
export const ROOT_APPLICATION_LOGS_VIEW_PERMISSION = getApplicationPermissionName('logs.view', 'root');
export const ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION = getApplicationPermissionName('devlogs.view', 'root');
export const ROOT_APPLICATION_DEVLOGS_CLEAR_PERMISSION = getApplicationPermissionName('devlogs.clear', 'root');
export const ROOT_APPLICATION_ROLES_VIEW_PERMISSION = getApplicationPermissionName('roles.view', 'root');
export const ROOT_APPLICATION_ROLES_MANAGE_PERMISSION = getApplicationPermissionName('roles.manage', 'root');
export const ROOT_APPLICATION_ROLES_RESET_PUSH_PERMISSION = getApplicationPermissionName('roles.resetPush', 'root');
export const ROOT_APPLICATION_USER_VIEW_PERMISSION = getApplicationPermissionName('user.view', 'root');
export const ROOT_APPLICATION_USER_REMOVE_PERMISSION = getApplicationPermissionName('user.remove', 'root');
export const ROOT_APPLICATION_USER_UPDATE_BASICS_PERMISSION = getApplicationPermissionName('user.updateBasics', 'root');
export const ROOT_APPLICATION_USER_UPDATE_ROLE_PERMISSION = getApplicationPermissionName('user.updateRole', 'root');

export const APPLICATION_PUBLIC_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['public']);
export const APPLICATION_MANAGED_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['managed']);
export const APPLICATION_ROOT_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['root']);
export const APPLICATION_PUBLIC_AND_MANAGED_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['public', 'managed']);
export const APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['public', 'managed', 'root']);
export const APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS =
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.filter(
    (permission) => permission.name !== 'application.create',
  );

const BUILT_IN_APPLICATION_MANAGEMENT_PERMISSION_NAMES = new Set(
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.map((permission) => permission.name),
);

export function isBuiltInApplicationManagementPermissionName(name: string): boolean {
  return BUILT_IN_APPLICATION_MANAGEMENT_PERMISSION_NAMES.has(name);
}
