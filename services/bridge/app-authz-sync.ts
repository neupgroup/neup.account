import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { Prisma } from '@/prisma/generated/client/client';

/*
::neup.documentation::app-authz-sync-service
::title App Authz Sync Service

Imports and exports app roles and permissions for bridge sync clients.

::public

Bridge clients authenticate with `neup_app_id` and `neup_app_secret`, then use this service through `/bridge/api.v1/app/roles` and `/bridge/api.v1/app/permissions`.

::public end

::private

IDs for synced roles and permissions may contain only ASCII letters, digits, `.`, `-`, and `_`.

::private end

::end
*/

const AUTHZ_ID_PATTERN = /^[0-9A-Za-z._-]+$/;

type SyncFailureStatus = 400 | 401 | 404 | 409 | 500;
type SyncFailure = {
  status: SyncFailureStatus;
  body: { success: false; error: string; error_description?: string };
};

type SyncSuccess<T extends Record<string, unknown>> = {
  status: 200;
  body: { success: true } & T;
};

type AppCredentials = {
  neupAppId: string | null;
  neupAppSecret: string | null;
};

type PermissionInput = {
  id: string;
  title?: string;
  name?: string;
  description?: string | null;
  scopeFor?: unknown;
  scopeLevel?: unknown;
  acquisitionType?: string | null;
  approvalPolicy?: string | null;
  rules?: string | null;
  status?: string | null;
  tag?: unknown;
};

type RoleInput = {
  id: string;
  title?: string;
  name?: string;
  description?: string | null;
  scopeFor?: unknown;
  scopeLevel?: unknown;
  acquisitionType?: string | null;
  approvalPolicy?: string | null;
  pushed?: boolean;
  applicableFor?: unknown;
  permissions?: unknown;
};

function normalizeJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeJsonValue(entry)]),
    );
  }

  return value;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean),
    ),
  );
}

function toNullableJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}

function toJsonInput(value: unknown, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value === null || value === undefined ? fallback : value as Prisma.InputJsonValue;
}

function normalizeRoleScopeLevel(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.trim() ? first.trim() : 'assignable';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPermissionName(permission: PermissionInput): string | null {
  return normalizeString(permission.title) ?? normalizeString(permission.name);
}

function readRoleName(role: RoleInput): string | null {
  return normalizeString(role.title) ?? normalizeString(role.name);
}

function validateAuthzId(id: string, entity: string): SyncFailure | null {
  if (!AUTHZ_ID_PATTERN.test(id)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_id',
        error_description: `${entity} id may only contain 0-9, a-z, A-Z, ".", "-", and "_".`,
      },
    };
  }
  return null;
}

async function validateApplicationCredentials(credentials: AppCredentials): Promise<
  | SyncFailure
  | {
      status: 200;
      app: { id: string; name: string; description: string | null; appSecret: string | null };
    }
> {
  const appId = credentials.neupAppId?.trim();
  const appSecret = credentials.neupAppSecret?.trim();

  if (!appId || !appSecret) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: 'neup_app_id and neup_app_secret are required.',
      },
    };
  }

  const app = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true, name: true, description: true, appSecret: true },
  });

  if (!app) {
    return {
      status: 404,
      body: { success: false, error: 'app_not_found' },
    };
  }

  if (!app.appSecret || app.appSecret !== appSecret) {
    return {
      status: 401,
      body: { success: false, error: 'invalid_app_credentials' },
    };
  }

  return { status: 200, app };
}

function appInfo(app: { id: string; name: string; description: string | null }) {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
  };
}

function serializePermission(permission: {
  id: string;
  name: string;
  description: string | null;
  scopeFor: unknown;
  scopeLevel: unknown;
  acquisitionType?: string | null;
  approvalPolicy: string | null;
  rules: string | null;
  status: string | null;
  tag: unknown;
}) {
  return {
    id: permission.id,
    title: permission.name,
    description: permission.description,
    scopeFor: normalizeJsonValue(permission.scopeFor),
    scopeLevel: normalizeJsonValue(permission.scopeLevel),
    acquisitionType: permission.acquisitionType ?? null,
    approvalPolicy: permission.approvalPolicy,
    rules: permission.rules,
    status: permission.status,
    tag: normalizeJsonValue(permission.tag),
  };
}

function serializeRole(role: {
  id: string;
  name: string;
  description: string | null;
  scopeFor: unknown;
  scopeLevel: string;
  acquisitionType: string;
  approvalPolicy: string;
  pushed: boolean;
  applicableFor: unknown;
  permissions: unknown;
}) {
  return {
    id: role.id,
    title: role.name,
    description: role.description,
    scopeFor: normalizeJsonValue(role.scopeFor),
    scopeLevel: normalizeJsonValue(role.scopeLevel),
    acquisitionType: role.acquisitionType,
    approvalPolicy: role.approvalPolicy,
    pushed: role.pushed,
    applicableFor: normalizeJsonValue(role.applicableFor),
    permissions: normalizeJsonValue(role.permissions),
  };
}

export async function getSyncedAppPermissions(credentials: AppCredentials): Promise<
  SyncFailure | SyncSuccess<{ appinfo: ReturnType<typeof appInfo>; permissions: ReturnType<typeof serializePermission>[] }>
> {
  const auth = await validateApplicationCredentials(credentials);
  if (auth.status !== 200) return auth;

  try {
    const permissions = await prisma.authzPermission.findMany({
      where: { appId: auth.app.id },
      orderBy: { name: 'asc' },
    });

    return {
      status: 200,
      body: {
        success: true,
        appinfo: appInfo(auth.app),
        permissions: permissions.map(serializePermission),
      },
    };
  } catch (error) {
    await logError('auth', error, `app/permissions:get:${auth.app.id}`);
    return { status: 500, body: { success: false, error: 'internal_server_error' } };
  }
}

export async function getSyncedAppRoles(credentials: AppCredentials): Promise<
  SyncFailure | SyncSuccess<{ appinfo: ReturnType<typeof appInfo>; roles: ReturnType<typeof serializeRole>[] }>
> {
  const auth = await validateApplicationCredentials(credentials);
  if (auth.status !== 200) return auth;

  try {
    const roles = await prisma.authzRole.findMany({
      where: { appId: auth.app.id },
      orderBy: { name: 'asc' },
    });

    return {
      status: 200,
      body: {
        success: true,
        appinfo: appInfo(auth.app),
        roles: roles.map(serializeRole),
      },
    };
  } catch (error) {
    await logError('auth', error, `app/roles:get:${auth.app.id}`);
    return { status: 500, body: { success: false, error: 'internal_server_error' } };
  }
}

export async function postSyncedAppPermissions(credentials: AppCredentials, input: unknown): Promise<
  SyncFailure | SyncSuccess<{ imported: number }>
> {
  const auth = await validateApplicationCredentials(credentials);
  if (auth.status !== 200) return auth;

  const permissionsInput = Array.isArray(input)
    ? input
    : isPlainObject(input) && Array.isArray(input.permissions)
      ? input.permissions
      : null;

  if (!permissionsInput) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: 'Request body must be an array or an object with a permissions array.',
      },
    };
  }

  const permissions = permissionsInput as PermissionInput[];
  for (const permission of permissions) {
    if (!isPlainObject(permission)) {
      return { status: 400, body: { success: false, error: 'invalid_permission' } };
    }

    const id = normalizeString(permission.id);
    const name = readPermissionName(permission);
    if (!id || !name) {
      return {
        status: 400,
        body: { success: false, error: 'invalid_permission', error_description: 'Each permission requires id and title.' },
      };
    }

    const idError = validateAuthzId(id, 'Permission');
    if (idError) return idError;
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const permission of permissions) {
        const id = permission.id.trim();
        const name = readPermissionName(permission) as string;
        const existingById = await tx.authzPermission.findUnique({
          where: { id },
          select: { appId: true },
        });
        if (existingById && existingById.appId !== auth.app.id) {
          throw new Error(`permission_id_conflict:${id}`);
        }

        const existingByName = await tx.authzPermission.findFirst({
          where: { appId: auth.app.id, name },
          select: { id: true },
        });
        if (existingByName && existingByName.id !== id) {
          throw new Error(`permission_name_conflict:${name}`);
        }

        await tx.authzPermission.upsert({
          where: { id },
          update: {
            name,
            description: permission.description?.trim() || null,
            scopeFor: toJsonInput(permission.scopeFor, []),
            scopeLevel: toJsonInput(permission.scopeLevel, []),
            approvalPolicy: permission.approvalPolicy?.trim() || 'none',
            rules: permission.rules?.trim() || null,
            status: permission.status?.trim() || null,
            tag: toNullableJsonInput(permission.tag),
            appId: auth.app.id,
          },
          create: {
            id,
            name,
            description: permission.description?.trim() || null,
            scopeFor: toJsonInput(permission.scopeFor, []),
            scopeLevel: toJsonInput(permission.scopeLevel, []),
            approvalPolicy: permission.approvalPolicy?.trim() || 'none',
            rules: permission.rules?.trim() || null,
            status: permission.status?.trim() || null,
            tag: toNullableJsonInput(permission.tag),
            appId: auth.app.id,
          },
        });
      }
    });

    return { status: 200, body: { success: true, imported: permissions.length } };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('permission_name_conflict:')) {
      return {
        status: 409,
        body: {
          success: false,
          error: 'permission_name_conflict',
          error_description: `Permission title already exists with another id: ${message.replace('permission_name_conflict:', '')}`,
        },
      };
    }
    if (message.startsWith('permission_id_conflict:')) {
      return {
        status: 409,
        body: {
          success: false,
          error: 'permission_id_conflict',
          error_description: `Permission id already belongs to another app: ${message.replace('permission_id_conflict:', '')}`,
        },
      };
    }
    await logError('auth', error, `app/permissions:post:${auth.app.id}`);
    return { status: 500, body: { success: false, error: 'internal_server_error' } };
  }
}

export async function postSyncedAppRoles(credentials: AppCredentials, input: unknown): Promise<
  SyncFailure | SyncSuccess<{ imported: number }>
> {
  const auth = await validateApplicationCredentials(credentials);
  if (auth.status !== 200) return auth;

  const rolesInput = Array.isArray(input)
    ? input
    : isPlainObject(input) && Array.isArray(input.roles)
      ? input.roles
      : null;

  if (!rolesInput) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: 'Request body must be an array or an object with a roles array.',
      },
    };
  }

  const roles = rolesInput as RoleInput[];
  for (const role of roles) {
    if (!isPlainObject(role)) {
      return { status: 400, body: { success: false, error: 'invalid_role' } };
    }

    const id = normalizeString(role.id);
    const name = readRoleName(role);
    if (!id || !name) {
      return {
        status: 400,
        body: { success: false, error: 'invalid_role', error_description: 'Each role requires id and title.' },
      };
    }

    const idError = validateAuthzId(id, 'Role');
    if (idError) return idError;
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const role of roles) {
        const id = role.id.trim();
        const name = readRoleName(role) as string;
        const existingById = await tx.authzRole.findUnique({
          where: { id },
          select: { appId: true },
        });
        if (existingById && existingById.appId !== auth.app.id) {
          throw new Error(`role_id_conflict:${id}`);
        }

        const existingByName = await tx.authzRole.findFirst({
          where: { appId: auth.app.id, name },
          select: { id: true },
        });
        if (existingByName && existingByName.id !== id) {
          throw new Error(`role_name_conflict:${name}`);
        }

        const permissionNames = normalizeStringArray(role.permissions);
        const matchedPermissions = permissionNames.length > 0
          ? await tx.authzPermission.findMany({
              where: { appId: auth.app.id, name: { in: permissionNames } },
              select: { id: true, name: true },
            })
          : [];
        const matchedNames = new Set(matchedPermissions.map((permission) => permission.name));
        const missingPermissions = permissionNames.filter((permission) => !matchedNames.has(permission));
        if (missingPermissions.length > 0) {
          throw new Error(`missing_permissions:${name}:${missingPermissions.join(', ')}`);
        }

        const scopeFor = normalizeStringArray(role.scopeFor);
        const scopeLevel = normalizeRoleScopeLevel(role.scopeLevel);
        await tx.authzRole.upsert({
          where: { id },
          update: {
            name,
            description: role.description?.trim() || null,
            scopeFor,
            scopeLevel,
            acquisitionType: role.acquisitionType?.trim() || 'assignment',
            approvalPolicy: role.approvalPolicy?.trim() || 'none',
            pushed: Boolean(role.pushed),
            applicableFor: Array.isArray(role.applicableFor) ? role.applicableFor : [],
            permissions: permissionNames,
            appId: auth.app.id,
          },
          create: {
            id,
            name,
            description: role.description?.trim() || null,
            scopeFor,
            scopeLevel,
            acquisitionType: role.acquisitionType?.trim() || 'assignment',
            approvalPolicy: role.approvalPolicy?.trim() || 'none',
            pushed: Boolean(role.pushed),
            applicableFor: Array.isArray(role.applicableFor) ? role.applicableFor : [],
            permissions: permissionNames,
            appId: auth.app.id,
          },
        });

        await tx.authzRolePermissionMap.deleteMany({ where: { roleId: id } });
        const mappingScopeFor = scopeFor.length > 0 ? scopeFor : ['for_individual'];
        if (matchedPermissions.length > 0) {
          await tx.authzRolePermissionMap.createMany({
            data: matchedPermissions.flatMap((permission) =>
              mappingScopeFor.map((scopeForValue) => ({
                roleId: id,
                permissionId: permission.id,
                scopeFor: scopeForValue,
                scopeLevel,
              })),
            ),
            skipDuplicates: true,
          });
        }
      }
    });

    return { status: 200, body: { success: true, imported: roles.length } };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('role_name_conflict:')) {
      return {
        status: 409,
        body: {
          success: false,
          error: 'role_name_conflict',
          error_description: `Role title already exists with another id: ${message.replace('role_name_conflict:', '')}`,
        },
      };
    }
    if (message.startsWith('role_id_conflict:')) {
      return {
        status: 409,
        body: {
          success: false,
          error: 'role_id_conflict',
          error_description: `Role id already belongs to another app: ${message.replace('role_id_conflict:', '')}`,
        },
      };
    }
    if (message.startsWith('missing_permissions:')) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'missing_permissions',
          error_description: message.replace('missing_permissions:', ''),
        },
      };
    }
    await logError('auth', error, `app/roles:post:${auth.app.id}`);
    return { status: 500, body: { success: false, error: 'internal_server_error' } };
  }
}
