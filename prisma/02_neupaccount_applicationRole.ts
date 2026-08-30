/*
::neup.documentation::seed-application-owner-role-script

Seeds the `application.owner` authz role for the Neup Account app.

::public

Run this script to ensure the owner role and its canonical application-management permissions exist.

::public end

::private

The script is idempotent and rebuilds the role-permission mappings after upserting the source permission rows.

::private end

::end
*/

import 'dotenv/config';
import prisma from '#/core/database/prisma';
import { APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS } from '../services/applications/permission-definitions';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

const APP_ID = 'neup.account';

// ---------------------------------------------------------------------------
// Permission definitions
// ---------------------------------------------------------------------------
const CAPABILITIES = APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS.map((permission, index) => ({
  id: `cap-appowner-${index + 1}-${permission.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()}`,
  name: permission.name,
  description: permission.description,
  scopeFor: permission.scopeFor,
  scopeLevel: permission.scopeLevel,
  approvalPolicy: permission.approvalPolicy,
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
        scopeFor: cap.scopeFor,
        scopeLevel: cap.scopeLevel,
        approvalPolicy: cap.approvalPolicy,
      },
      create: {
        id: cap.id,
        name: cap.name,
        description: cap.description,
        appId: APP_ID,
        scopeFor: cap.scopeFor,
        scopeLevel: cap.scopeLevel,
        approvalPolicy: cap.approvalPolicy,
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
    await prisma.authzRolePermissionMap.deleteMany({
      where: {
        roleId: ROLE.id,
        permissionId: cap.id,
      },
    });
    await prisma.authzRolePermissionMap.create({
      data: {
        roleId: ROLE.id,
        permissionId: cap.id,
        scopeFor: 'for_individual',
        scopeLevel: 'assignable.byTeam',
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
