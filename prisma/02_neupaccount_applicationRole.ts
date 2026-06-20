/**
 * 02_neupaccount_applicationRole.ts
 *
 * Seeds the application.owner role for the neupaccount application.
 *
 * Order of operations (must be followed to satisfy FK constraints):
 *   1. Upsert permissions  (application.* unified permission names)
 *   2. Upsert role          (application.owner)
 *   3. Upsert permission-to-role maps (AuthzRolePermissionMap)
 *
 * Safe to re-run — all operations are idempotent upserts.
 *
 * Usage:
 *   tsx prisma/02_neupaccount_applicationRole.ts
 */

import 'dotenv/config';
import prisma from '../core/helpers/prisma';
import { APPLICATION_PUBLIC_AND_MANAGED_PERMISSION_DEFINITIONS } from '../services/applications/permission-definitions';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

const APP_ID = 'neup.account';

// ---------------------------------------------------------------------------
// Permission definitions
// ---------------------------------------------------------------------------
const CAPABILITIES = APPLICATION_PUBLIC_AND_MANAGED_PERMISSION_DEFINITIONS.map((permission, index) => ({
  id: `cap-appowner-${index + 1}-${permission.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()}`,
  name: permission.name,
  description: permission.description,
  scope: permission.scope,
}));

// ---------------------------------------------------------------------------
// Role definition
// ---------------------------------------------------------------------------
const ROLE = {
  id: 'application.owner',
  name: 'application.owner',
  description: 'Full ownership of an application — can view, edit, and delete.',
  scope: 'application',
} as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[02_neupaccount_applicationRole] Seeding role "${ROLE.id}" for app "${APP_ID}"…`);
  const persistedCapabilities: Array<{ id: string; name: string }> = [];

  // 1. Upsert permissions
  for (const cap of CAPABILITIES) {
    const permission = await prisma.authzPermission.upsert({
      where: { name_appId: { name: cap.name, appId: APP_ID } },
      update: {
        name: cap.name,
        description: cap.description,
        appId: APP_ID,
        scope: cap.scope,
      },
      create: {
        id: cap.id,
        name: cap.name,
        description: cap.description,
        appId: APP_ID,
        scope: cap.scope,
      },
      select: {
        id: true,
        name: true,
      },
    });
    persistedCapabilities.push(permission);
    console.log(`  ✓ Permission upserted: ${permission.id}`);
  }

  // 2. Upsert role
  await prisma.authzRole.upsert({
    where: { id: ROLE.id },
    update: {
      name: ROLE.name,
      description: ROLE.description,
      appId: APP_ID,
      scope: ROLE.scope,
      permissions: persistedCapabilities.map((cap) => cap.name),
    },
    create: {
      id: ROLE.id,
      name: ROLE.name,
      description: ROLE.description,
      appId: APP_ID,
      scope: ROLE.scope,
      permissions: persistedCapabilities.map((cap) => cap.name),
    },
  });
  console.log(`  ✓ Role upserted: ${ROLE.id}`);

  // 3. Upsert permission-to-role maps
  for (const cap of persistedCapabilities) {
    await prisma.authzRolePermissionMap.upsert({
      where: {
        roleId_permissionId: {
          roleId: ROLE.id,
          permissionId: cap.id,
        },
      },
      update: {},
      create: {
        roleId: ROLE.id,
        permissionId: cap.id,
      },
    });
    console.log(`  ✓ Role-permission map upserted: ${ROLE.id} → ${cap.id}`);
  }

  console.log('[02_neupaccount_applicationRole] Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('[02_neupaccount_applicationRole] Failed:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
