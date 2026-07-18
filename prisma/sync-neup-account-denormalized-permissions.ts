/*
::neup.documentation::sync-denormalized-neup-account-permissions
::title Neup Account Authz Rebuild Script

Rebuilds the Neup Account role and permission catalog from the checked-in authz snapshots.

::public

Run this script to rewrite the Neup Account authz catalog in the database so `authz_permission`,
`authz_role`, `authz_role_permission_map`, and legacy role permission snapshots all agree.

::public end

::private

The script treats `local/basics/permissions.json` and `local/basics/roles.json` as the
source of truth, updates only `app_id = neup.account`, and leaves unrelated apps untouched.

::private end

::end
*/

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import prisma from '@/core/database/prisma';
import { Prisma } from '@/core/database/prisma';
import {
  NEUP_ACCOUNT_PERMISSION_DEFINITIONS,
  stripPermissionAudience,
} from '@/inapp/permissions/permission-catalog';

const APP_ID = 'neup.account';
const PERMISSIONS_FILE = resolve(process.cwd(), 'local/basics/permissions.json');
const ROLES_FILE = resolve(process.cwd(), 'local/basics/roles.json');

type PermissionSnapshot = {
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

type RoleSnapshot = {
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

type DuplicateRoleNameResolution = {
  originalName: string;
  storedName: string;
};

type PermissionNameResolution = {
  originalName: string;
  storedName: string;
};

type SkippedRoleResolution = {
  roleId: string;
  roleName: string;
  missingPermissions: string[];
};

type IdReuseResolution = {
  snapshotId: string;
  storedId: string;
  name: string;
};

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => entry !== null),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeJsonArray(value: unknown, fallback: string[] = []): Prisma.InputJsonValue {
  return normalizeStringArray(value ?? fallback);
}

function normalizeRoleScopeLevel(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = normalizeString(candidate);
  if (normalized === 'assignable' || normalized === 'selfAssigned') return 'assignable.byTeam';
  if (normalized === 'publiclyEnrollable') return 'assignable.publicly';
  if (normalized === 'publiclyRequestable') return 'assignable.publicly.byRequest';
  if (normalized === 'requestableToOwner' || normalized === 'requestToOwner') return 'assignable.byTeam.fromRequest';
  if (normalized === 'rootAssigned' || normalized === 'rootManaged') return 'assignable.byRoot';
  if (normalized === 'assignable.byTeam') return 'assignable.byTeam';
  if (normalized === 'assignable.byRoot') return 'assignable.byRoot';
  return normalized ?? 'assignable.byTeam';
}

function slugifyPermission(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function audienceSuffixForRoleScopeLevel(scopeLevel: string): 'self' | 'managed' | 'root' {
  if (scopeLevel === 'assignable.byRoot') return 'root';
  if (scopeLevel === 'assignable.byTeam') return 'managed';
  return 'self';
}

function scopeLevelForCanonicalDefinition(definition: (typeof NEUP_ACCOUNT_PERMISSION_DEFINITIONS)[number]): string[] {
  if (definition.rootManaged) return ['assignable.byRoot'];
  if (definition.assignable) return ['assignable.byTeam'];
  if (definition.selfAssigned) return ['assignable.byTeam'];
  if (definition.publiclyEnrollable) return ['assignable.publicly'];
  return [];
}

function readPermissionName(permission: PermissionSnapshot): string {
  const name = normalizeString(permission.title) ?? normalizeString(permission.name);
  if (!name) {
    throw new Error(`Permission ${permission.id} is missing a title/name.`);
  }

  return name;
}

function readRoleName(role: RoleSnapshot): string {
  const name = normalizeString(role.title) ?? normalizeString(role.name);
  if (!name) {
    throw new Error(`Role ${role.id} is missing a title/name.`);
  }

  return name;
}

async function readSnapshotFile<T>(filePath: string, label: string): Promise<T[]> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} snapshot must be a JSON array.`);
  }

  return parsed as T[];
}

function normalizeRolePermissionNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const names = value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      return trimmed ? [trimmed] : [];
    }

    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const maybeName = normalizeString((entry as { name?: unknown; title?: unknown }).name)
        ?? normalizeString((entry as { title?: unknown }).title);
      return maybeName ? [maybeName] : [];
    }

    return [];
  });

  return Array.from(new Set(names)).sort((left, right) => left.localeCompare(right));
}

function resolvePermissionNameForRole(
  permissionName: string,
  roleScopeLevel: string,
  knownPermissionNames: Set<string>,
): string | null {
  if (knownPermissionNames.has(permissionName)) {
    return permissionName;
  }

  const basePermissionName = stripPermissionAudience(permissionName);
  if (knownPermissionNames.has(basePermissionName)) {
    return basePermissionName;
  }

  const candidates: string[] = [];
  const suffix = audienceSuffixForRoleScopeLevel(roleScopeLevel);
  const hasAudienceSuffix = /\.(self|managed|root)$/.test(permissionName);

  if (!hasAudienceSuffix) {
    candidates.push(`${basePermissionName}.${suffix}`);

    if (suffix !== 'root') candidates.push(`${basePermissionName}.root`);
    if (suffix !== 'managed') candidates.push(`${basePermissionName}.managed`);
    if (suffix !== 'self') candidates.push(`${basePermissionName}.self`);
  }

  if (basePermissionName.startsWith('root.') && !basePermissionName.endsWith('.root')) {
    candidates.push(`${basePermissionName}.root`);
  }

  for (const candidate of candidates) {
    if (knownPermissionNames.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }

  const [rawPermissionSnapshots, roleSnapshots] = await Promise.all([
    readSnapshotFile<PermissionSnapshot>(PERMISSIONS_FILE, 'Permission'),
    readSnapshotFile<RoleSnapshot>(ROLES_FILE, 'Role'),
  ]);

  const permissionSnapshots = [...rawPermissionSnapshots];
  const permissionNamesFromSnapshot = new Set(
    rawPermissionSnapshots.map((permission) => readPermissionName(permission)),
  );

  for (const definition of NEUP_ACCOUNT_PERMISSION_DEFINITIONS) {
    if (permissionNamesFromSnapshot.has(definition.name)) {
      continue;
    }

    permissionSnapshots.push({
      id: `cap-auto-${slugifyPermission(definition.name)}`,
      title: definition.name,
      description: definition.description,
      scopeFor: ['for_individual'],
      scopeLevel: scopeLevelForCanonicalDefinition(definition),
      acquisitionType: definition.acquisitionType,
      approvalPolicy: definition.approvalPolicy,
      rules: null,
      status: null,
      tag: null,
    });
  }

  const duplicatePermissionIds = new Set<string>();
  const duplicatePermissionNames = new Set<string>();
  const permissionIdSet = new Set<string>();
  const permissionNameSet = new Set<string>();

  for (const permission of permissionSnapshots) {
    if (!normalizeString(permission.id)) {
      throw new Error('Permission snapshot contains an entry without an id.');
    }

    const permissionName = readPermissionName(permission);
    if (permissionIdSet.has(permission.id)) duplicatePermissionIds.add(permission.id);
    if (permissionNameSet.has(permissionName)) duplicatePermissionNames.add(permissionName);
    permissionIdSet.add(permission.id);
    permissionNameSet.add(permissionName);
  }

  if (duplicatePermissionIds.size > 0) {
    throw new Error(`Duplicate permission ids: ${Array.from(duplicatePermissionIds).join(', ')}`);
  }

  if (duplicatePermissionNames.size > 0) {
    throw new Error(`Duplicate permission titles: ${Array.from(duplicatePermissionNames).join(', ')}`);
  }

  const duplicateRoleIds = new Set<string>();
  const roleIdSet = new Set<string>();
  const sourceRoleNameById = new Map<string, string>();
  const roleIdsBySourceName = new Map<string, string[]>();

  for (const role of roleSnapshots) {
    if (!normalizeString(role.id)) {
      throw new Error('Role snapshot contains an entry without an id.');
    }

    const roleName = readRoleName(role);
    if (roleIdSet.has(role.id)) duplicateRoleIds.add(role.id);
    roleIdSet.add(role.id);
    sourceRoleNameById.set(role.id, roleName);
    roleIdsBySourceName.set(roleName, [...(roleIdsBySourceName.get(roleName) ?? []), role.id]);
  }

  if (duplicateRoleIds.size > 0) {
    throw new Error(`Duplicate role ids: ${Array.from(duplicateRoleIds).join(', ')}`);
  }

  const permissionIdByName = new Map(permissionSnapshots.map((permission) => [readPermissionName(permission), permission.id]));
  const knownPermissionNames = new Set(permissionIdByName.keys());
  const storedRoleNameById = new Map<string, string>();
  const duplicateRoleNameResolutions: Array<{ roleId: string } & DuplicateRoleNameResolution> = [];
  const resolvedRolePermissionsById = new Map<string, string[]>();
  const permissionNameResolutions: Array<{ roleId: string } & PermissionNameResolution> = [];
  const skippedRoles: SkippedRoleResolution[] = [];

  for (const role of roleSnapshots) {
    const sourceRoleName = sourceRoleNameById.get(role.id)!;
    const conflictingRoleIds = roleIdsBySourceName.get(sourceRoleName) ?? [];
    const conflictIndex = conflictingRoleIds.indexOf(role.id);
    const storedRoleName = conflictIndex <= 0 ? sourceRoleName : role.id;

    storedRoleNameById.set(role.id, storedRoleName);

    if (storedRoleName !== sourceRoleName) {
      duplicateRoleNameResolutions.push({
        roleId: role.id,
        originalName: sourceRoleName,
        storedName: storedRoleName,
      });
    }
  }

  for (const role of roleSnapshots) {
    const roleScopeLevel = normalizeRoleScopeLevel(role.scopeLevel);
    const missingPermissions: string[] = [];
    const resolvedPermissions = normalizeRolePermissionNames(role.permissions).flatMap((permissionName) => {
      const resolvedName = resolvePermissionNameForRole(permissionName, roleScopeLevel, knownPermissionNames);

      if (!resolvedName) {
        missingPermissions.push(permissionName);
        return [];
      }

      if (resolvedName !== permissionName) {
        permissionNameResolutions.push({
          roleId: role.id,
          originalName: permissionName,
          storedName: resolvedName,
        });
      }

      return resolvedName;
    });

    if (missingPermissions.length > 0) {
      skippedRoles.push({
        roleId: role.id,
        roleName: sourceRoleNameById.get(role.id) ?? role.id,
        missingPermissions,
      });
      continue;
    }

    resolvedRolePermissionsById.set(
      role.id,
      Array.from(new Set(resolvedPermissions)).sort((left, right) => left.localeCompare(right)),
    );
  }

  const summary = await prisma.$transaction(async (tx) => {
    const permissionDbIdByName = new Map<string, string>();
    const reusedPermissionIds: IdReuseResolution[] = [];
    const reusedRoleIds: IdReuseResolution[] = [];

    for (const permission of permissionSnapshots) {
      const permissionName = readPermissionName(permission);
      const existingById = await tx.authzPermission.findUnique({
        where: { id: permission.id },
        select: { id: true, appId: true },
      });
      const existingByName = await tx.authzPermission.findFirst({
        where: { appId: APP_ID, name: permissionName },
        select: { id: true },
      });
      const targetPermissionId = existingById?.id ?? existingByName?.id ?? permission.id;

      if (existingById && existingById.appId && existingById.appId !== APP_ID) {
        throw new Error(
          `Permission id ${permission.id} already belongs to another app and cannot be reused for ${permissionName}.`,
        );
      }

      if (targetPermissionId !== permission.id) {
        reusedPermissionIds.push({
          snapshotId: permission.id,
          storedId: targetPermissionId,
          name: permissionName,
        });
      }

      await tx.authzPermission.upsert({
        where: { id: targetPermissionId },
        update: {
          name: permissionName,
          description: normalizeString(permission.description) ?? null,
          appId: APP_ID,
          scopeLevel: normalizeJsonArray(permission.scopeLevel),
          scopeFor: normalizeJsonArray(permission.scopeFor),
          approvalPolicy: normalizeString(permission.approvalPolicy) ?? 'none',
          rules: normalizeString(permission.rules) ?? null,
          status: normalizeString(permission.status) ?? null,
          tag: permission.tag === undefined ? Prisma.JsonNull : (permission.tag as Prisma.InputJsonValue),
        },
        create: {
          id: targetPermissionId,
          name: permissionName,
          description: normalizeString(permission.description) ?? null,
          appId: APP_ID,
          scopeLevel: normalizeJsonArray(permission.scopeLevel),
          scopeFor: normalizeJsonArray(permission.scopeFor),
          approvalPolicy: normalizeString(permission.approvalPolicy) ?? 'none',
          rules: normalizeString(permission.rules) ?? null,
          status: normalizeString(permission.status) ?? null,
          tag: permission.tag === undefined ? Prisma.JsonNull : (permission.tag as Prisma.InputJsonValue),
        },
      });

      permissionDbIdByName.set(permissionName, targetPermissionId);
    }

    for (const role of roleSnapshots) {
      if (!resolvedRolePermissionsById.has(role.id)) {
        continue;
      }

      const roleName = storedRoleNameById.get(role.id) ?? readRoleName(role);
      const permissionNames = resolvedRolePermissionsById.get(role.id) ?? [];
      const scopeFor = normalizeStringArray(role.scopeFor);
      const scopeLevel = normalizeRoleScopeLevel(role.scopeLevel);
      const existingById = await tx.authzRole.findUnique({
        where: { id: role.id },
        select: { id: true, appId: true },
      });
      const existingByName = await tx.authzRole.findFirst({
        where: { appId: APP_ID, name: roleName },
        select: { id: true },
      });
      const targetRoleId = existingById?.id ?? existingByName?.id ?? role.id;

      if (existingById && existingById.appId && existingById.appId !== APP_ID) {
        throw new Error(`Role id ${role.id} already belongs to another app and cannot be reused for ${roleName}.`);
      }

      if (targetRoleId !== role.id) {
        reusedRoleIds.push({
          snapshotId: role.id,
          storedId: targetRoleId,
          name: roleName,
        });
      }

      await tx.authzRole.upsert({
        where: { id: targetRoleId },
        update: {
          name: roleName,
          description: normalizeString(role.description) ?? null,
          appId: APP_ID,
          scopeFor: normalizeJsonArray(scopeFor),
          scopeLevel,
          acquisitionType: normalizeString(role.acquisitionType) ?? 'assignment',
          approvalPolicy: normalizeString(role.approvalPolicy) ?? 'none',
          pushed: Boolean(role.pushed),
          applicableFor: normalizeJsonArray(role.applicableFor),
          permissions: permissionNames,
        },
        create: {
          id: targetRoleId,
          name: roleName,
          description: normalizeString(role.description) ?? null,
          appId: APP_ID,
          scopeFor: normalizeJsonArray(scopeFor),
          scopeLevel,
          acquisitionType: normalizeString(role.acquisitionType) ?? 'assignment',
          approvalPolicy: normalizeString(role.approvalPolicy) ?? 'none',
          pushed: Boolean(role.pushed),
          applicableFor: normalizeJsonArray(role.applicableFor),
          permissions: permissionNames,
        },
      });

      await tx.authzRolePermissionMap.deleteMany({ where: { roleId: targetRoleId } });

      const mappingScopeFor = scopeFor.length > 0 ? scopeFor : ['for_individual'];
      if (permissionNames.length > 0) {
        await tx.authzRolePermissionMap.createMany({
          data: permissionNames.flatMap((permissionName) =>
            mappingScopeFor.map((scopeForValue) => ({
              roleId: targetRoleId,
              permissionId: permissionDbIdByName.get(permissionName) ?? permissionIdByName.get(permissionName)!,
              scopeFor: scopeForValue,
              scopeLevel,
            })),
          ),
          skipDuplicates: true,
        });
      }

      await tx.role.updateMany({
        where: { roleId: targetRoleId },
        data: {
          roleName,
          permissions: permissionNames,
        },
      });
    }

    const [dbRoles, dbPermissions] = await Promise.all([
      tx.authzRole.findMany({
        where: { appId: APP_ID },
        select: { id: true, name: true, permissions: true },
        orderBy: { name: 'asc' },
      }),
      tx.authzPermission.count({ where: { appId: APP_ID } }),
    ]);

    const rolesOutsideSnapshot = dbRoles
      .filter((role) => !roleIdSet.has(role.id))
      .map((role) => `${role.name} (${role.id})`);

    return {
      permissionCount: dbPermissions,
      roleCount: dbRoles.length,
      syncedRoleCount: resolvedRolePermissionsById.size,
      rolesOutsideSnapshot,
      reusedPermissionIds,
      reusedRoleIds,
      roleStats: dbRoles.map((role) => ({
        id: role.id,
        name: role.name,
        permissionCount: Array.isArray(role.permissions) ? role.permissions.length : 0,
        permissions: Array.isArray(role.permissions)
          ? role.permissions.filter((permission): permission is string => typeof permission === 'string')
          : [],
      })),
    };
  }, { timeout: 120000 });

  console.log(`Rebuilt authz catalog for app: ${APP_ID}`);
  console.table(summary.roleStats.map((role) => ({
    id: role.id,
    name: role.name,
    permissionCount: role.permissionCount,
  })));

  if (summary.rolesOutsideSnapshot.length > 0) {
    console.warn('Roles present in the database but not in the checked-in snapshot were left untouched:');
    for (const role of summary.rolesOutsideSnapshot) {
      console.warn(`- ${role}`);
    }
  }

  console.log(
    `Permissions synced: ${permissionSnapshots.length}/${summary.permissionCount}. Roles synced: ${summary.syncedRoleCount}/${summary.roleCount}.`,
  );

  if (duplicateRoleNameResolutions.length > 0) {
    console.warn('Duplicate role titles were normalized to unique stored names:');
    for (const resolution of duplicateRoleNameResolutions) {
      console.warn(
        `- ${resolution.roleId}: "${resolution.originalName}" stored as "${resolution.storedName}"`,
      );
    }
  }

  if (permissionNameResolutions.length > 0) {
    console.warn('Legacy role permission names were upgraded to canonical stored names:');
    for (const resolution of permissionNameResolutions) {
      console.warn(
        `- ${resolution.roleId}: "${resolution.originalName}" -> "${resolution.storedName}"`,
      );
    }
  }

  if (summary.reusedPermissionIds.length > 0) {
    console.warn('Permission rows reused existing database ids for matching names:');
    for (const resolution of summary.reusedPermissionIds) {
      console.warn(
        `- ${resolution.name}: snapshot id "${resolution.snapshotId}" -> stored id "${resolution.storedId}"`,
      );
    }
  }

  if (summary.reusedRoleIds.length > 0) {
    console.warn('Role rows reused existing database ids for matching names:');
    for (const resolution of summary.reusedRoleIds) {
      console.warn(
        `- ${resolution.name}: snapshot id "${resolution.snapshotId}" -> stored id "${resolution.storedId}"`,
      );
    }
  }

  if (skippedRoles.length > 0) {
    console.warn('Roles skipped because their snapshots still reference missing permissions:');
    for (const skippedRole of skippedRoles) {
      console.warn(
        `- ${skippedRole.roleId} (${skippedRole.roleName}): ${skippedRole.missingPermissions.join(', ')}`,
      );
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(
      'sync-neup-account-denormalized-permissions failed:',
      error instanceof Error ? error.message : error,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
