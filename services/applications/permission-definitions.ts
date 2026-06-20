import { type PermissionScopeOption } from '@/services/applications/permission-scopes';

export type ApplicationPermissionBase =
  | 'delete'
  | 'devlogs.view'
  | 'edit'
  | 'logs.view'
  | 'roles.manage'
  | 'roles.view'
  | 'view';

export type ApplicationPermissionAudience = 'managed' | 'public' | 'root';

type ApplicationPermissionDefinition = {
  description: string;
  suffix: string;
};

const APPLICATION_PERMISSION_DEFINITION_MAP: Record<ApplicationPermissionBase, ApplicationPermissionDefinition> = {
  delete: {
    suffix: 'delete',
    description: 'Delete or deactivate an application.',
  },
  'devlogs.view': {
    suffix: 'devlogs.view',
    description: 'View development API request/response logs for the application.',
  },
  edit: {
    suffix: 'edit',
    description: 'Edit application details, secrets, access fields, policies, and endpoints.',
  },
  'logs.view': {
    suffix: 'logs.view',
    description: 'View application activity logs.',
  },
  'roles.manage': {
    suffix: 'roles.manage',
    description: 'Create, update, and delete application roles and permissions.',
  },
  'roles.view': {
    suffix: 'roles.view',
    description: 'View application roles and permissions.',
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

function permissionScope(audience: ApplicationPermissionAudience): PermissionScopeOption {
  if (audience === 'root') return 'root';
  if (audience === 'managed') return 'managable';
  return 'public';
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
): Array<{ name: string; description: string; scope: PermissionScopeOption[] }> {
  const definitions = new Map<string, { name: string; description: string; scope: PermissionScopeOption[] }>();

  for (const audience of audiences) {
    for (const base of Object.keys(APPLICATION_PERMISSION_DEFINITION_MAP) as ApplicationPermissionBase[]) {
      const name = permissionName(base, audience);
      const scope = permissionScope(audience);
      const existing = definitions.get(name);

      if (existing) {
        if (!existing.scope.includes(scope)) {
          existing.scope.push(scope);
        }
        continue;
      }

      definitions.set(name, {
        name,
        description: permissionDescription(base, audience),
        scope: [scope],
      });
    }
  }

  return Array.from(definitions.values());
}

export const ROOT_APPLICATION_VIEW_PERMISSION = getApplicationPermissionName('view', 'root');
export const ROOT_APPLICATION_EDIT_PERMISSION = getApplicationPermissionName('edit', 'root');
export const ROOT_APPLICATION_DELETE_PERMISSION = getApplicationPermissionName('delete', 'root');
export const ROOT_APPLICATION_LOGS_VIEW_PERMISSION = getApplicationPermissionName('logs.view', 'root');
export const ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION = getApplicationPermissionName('devlogs.view', 'root');
export const ROOT_APPLICATION_ROLES_VIEW_PERMISSION = getApplicationPermissionName('roles.view', 'root');
export const ROOT_APPLICATION_ROLES_MANAGE_PERMISSION = getApplicationPermissionName('roles.manage', 'root');

export const APPLICATION_PUBLIC_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['public']);
export const APPLICATION_MANAGED_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['managed']);
export const APPLICATION_ROOT_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['root']);
export const APPLICATION_PUBLIC_AND_MANAGED_PERMISSION_DEFINITIONS = getApplicationPermissionDefinitions(['public', 'managed']);
