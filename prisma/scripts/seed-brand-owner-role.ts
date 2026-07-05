import 'dotenv/config';
import prisma from '../../neup.core/helpers/prisma';
/*
::neup.documentation::seed-brand-owner-role-script

Ensures the canonical brand-owner authz role and related permission rows exist.

::public

Run this script after authz catalog changes that affect the brand-owner role.

::public end

::private

The script keeps the role-permission map aligned with the current canonical brand-owner permission name sets.

::private end

::end
*/

import {
  BRAND_OWNER_PERMISSION_NAMES,
  BRAND_ROOT_PERMISSION_NAMES,
  BRAND_OWNER_ROLE_ID,
  BRAND_OWNER_ROLE_NAME,
} from '../../neup.core/auth/brand-roles';

const APP_ID = 'neup.account';
const LEGACY_ROLE_ID = 'brand-owner-neup-account';

function slugifyPermission(permission: string): string {
  return permission.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }

  await prisma.$transaction(async (tx) => {
    const [existingBrandOwnerRole, legacyBrandOwnerRole] = await Promise.all([
      tx.authzRole.findUnique({
        where: { id: BRAND_OWNER_ROLE_ID },
        select: { id: true },
      }),
      tx.authzRole.findUnique({
        where: { id: LEGACY_ROLE_ID },
        select: { id: true },
      }),
    ]);

    if (!existingBrandOwnerRole && legacyBrandOwnerRole) {
      await tx.authzRole.update({
        where: { id: LEGACY_ROLE_ID },
        data: {
          id: BRAND_OWNER_ROLE_ID,
          name: BRAND_OWNER_ROLE_NAME,
          description: 'Brand ownership role for brand accounts.',
          appId: APP_ID,
          scopeFor: ['for_brand'],
          scopeLevel: 'assignable',
          permissions: BRAND_OWNER_PERMISSION_NAMES,
        },
      });
    } else {
      await tx.authzRole.upsert({
        where: { id: BRAND_OWNER_ROLE_ID },
        update: {
          name: BRAND_OWNER_ROLE_NAME,
          description: 'Brand ownership role for brand accounts.',
          appId: APP_ID,
          scopeFor: ['for_brand'],
          scopeLevel: 'assignable',
          permissions: BRAND_OWNER_PERMISSION_NAMES,
        },
        create: {
          id: BRAND_OWNER_ROLE_ID,
          name: BRAND_OWNER_ROLE_NAME,
          description: 'Brand ownership role for brand accounts.',
          appId: APP_ID,
          scopeFor: ['for_brand'],
          scopeLevel: 'assignable',
          permissions: BRAND_OWNER_PERMISSION_NAMES,
        },
      });
    }

    for (const permissionName of BRAND_OWNER_PERMISSION_NAMES) {
      const permissionId = `cap-brand-owner-${slugifyPermission(permissionName)}`;

      const permission = await tx.authzPermission.upsert({
        where: { name_appId: { name: permissionName, appId: APP_ID } },
        update: {
          name: permissionName,
          appId: APP_ID,
        },
        create: {
          id: permissionId,
          name: permissionName,
          appId: APP_ID,
        },
        select: { id: true },
      });

      await tx.authzRolePermissionMap.deleteMany({
        where: {
          roleId: BRAND_OWNER_ROLE_ID,
          permissionId: permission.id,
        },
      });

      await tx.authzRolePermissionMap.create({
        data: {
          roleId: BRAND_OWNER_ROLE_ID,
          permissionId: permission.id,
          scopeFor: 'for_brand',
          scopeLevel: 'assignable',
        } as any,
      });
    }

    const brandOwnerPermissionIds = await tx.authzPermission.findMany({
      where: {
        appId: APP_ID,
        name: { in: [...BRAND_OWNER_PERMISSION_NAMES] },
      },
      select: { id: true },
    });

    await tx.authzRolePermissionMap.deleteMany({
      where: {
        roleId: BRAND_OWNER_ROLE_ID,
        permissionId: {
          notIn: brandOwnerPermissionIds.map((permission) => permission.id),
        },
      },
    });

    for (const permissionName of BRAND_ROOT_PERMISSION_NAMES) {
      const permissionId = `cap-brand-root-${slugifyPermission(permissionName)}`;
      await tx.authzPermission.upsert({
        where: { name_appId: { name: permissionName, appId: APP_ID } },
        update: {
          name: permissionName,
          appId: APP_ID,
        },
        create: {
          id: permissionId,
          name: permissionName,
          appId: APP_ID,
        },
      });
    }

    const legacyBrandAccessRows = await tx.access.findMany({
      where: {
        roleId: LEGACY_ROLE_ID,
        parentAccount: { accountType: 'brand' },
        role: { appId: APP_ID },
      },
      select: { id: true },
    });

    if (legacyBrandAccessRows.length > 0) {
      await tx.access.updateMany({
        where: {
          id: { in: legacyBrandAccessRows.map((row) => row.id) },
        },
        data: {
          roleId: BRAND_OWNER_ROLE_ID,
        },
      });
    }
  }, {
    maxWait: 10_000,
    timeout: 20_000,
  });

  console.log(
    `Brand owner role ensured (${BRAND_OWNER_ROLE_ID}); brand grants migrated from ${LEGACY_ROLE_ID} to ${BRAND_OWNER_ROLE_ID}.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('seed-brand-owner-role failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
