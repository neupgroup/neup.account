/**
 * 02_neupaccount_applicationRole.ts
 *
 * Seeds the application.owner role for the neupaccount application.
 *
 * Order of operations (must be followed to satisfy FK constraints):
 *   1. Upsert permissions  (application.view, application.edit, application.delete, application.logs.view, application.devlogs.view)
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

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

const APP_ID = 'neup.account';

// ---------------------------------------------------------------------------
// Permission definitions
// ---------------------------------------------------------------------------
const CAPABILITIES = [
  {
    id: 'cap-appowner-application-view',
    name: 'application.view',
    description: 'View application details and settings.',
    tag: 'application',
  },
  {
    id: 'cap-appowner-application-edit',
    name: 'application.edit',
    description: 'Edit application details, secrets, access fields, policies, and endpoints.',
    tag: 'application',
  },
  {
    id: 'cap-appowner-application-delete',
    name: 'application.delete',
    description: 'Delete or deactivate an application.',
    tag: 'application',
  },
  {
    id: 'cap-appowner-application-logs-view',
    name: 'application.logs.view',
    description: 'View application activity logs.',
    tag: 'application',
  },
  {
    id: 'cap-appowner-application-devlogs-view',
    name: 'application.devlogs.view',
    description: 'View development API request/response logs for the application.',
    tag: 'application',
  },
] as const;

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

  // 1. Upsert permissions
  for (const cap of CAPABILITIES) {
    await prisma.authzPermission.upsert({
      where: { id: cap.id },
      update: {
        name: cap.name,
        description: cap.description,
        appId: APP_ID,
        tag: cap.tag,
      },
      create: {
        id: cap.id,
        name: cap.name,
        description: cap.description,
        appId: APP_ID,
        tag: cap.tag,
      },
    });
    console.log(`  ✓ Permission upserted: ${cap.id}`);
  }

  // 2. Upsert role
  await prisma.authzRole.upsert({
    where: { id: ROLE.id },
    update: {
      name: ROLE.name,
      description: ROLE.description,
      appId: APP_ID,
      scope: ROLE.scope,
    },
    create: {
      id: ROLE.id,
      name: ROLE.name,
      description: ROLE.description,
      appId: APP_ID,
      scope: ROLE.scope,
    },
  });
  console.log(`  ✓ Role upserted: ${ROLE.id}`);

  // 3. Upsert permission-to-role maps
  for (const cap of CAPABILITIES) {
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
