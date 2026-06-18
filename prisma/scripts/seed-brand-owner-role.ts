import 'dotenv/config';
import prisma from '../../core/helpers/prisma';
import {
  BRAND_OWNER_PERMISSION_NAMES,
  BRAND_ROOT_PERMISSION_NAMES,
  BRAND_OWNER_ROLE_ID,
  BRAND_OWNER_ROLE_NAME,
} from '../../core/auth/brand-roles';

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
    await tx.authzRole.upsert({
      where: { id: BRAND_OWNER_ROLE_ID },
      update: {
        name: BRAND_OWNER_ROLE_NAME,
        description: 'Brand ownership role for brand accounts.',
        appId: APP_ID,
        scope: 'brand',
        permissions: BRAND_OWNER_PERMISSION_NAMES,
      },
      create: {
        id: BRAND_OWNER_ROLE_ID,
        name: BRAND_OWNER_ROLE_NAME,
        description: 'Brand ownership role for brand accounts.',
        appId: APP_ID,
        scope: 'brand',
        permissions: BRAND_OWNER_PERMISSION_NAMES,
      },
    });

    for (const permissionName of BRAND_OWNER_PERMISSION_NAMES) {
      const permissionId = `cap-brand-owner-${slugifyPermission(permissionName)}`;
      const permissionScope = permissionName.includes('.scopeManaged') ? 'brand.managable' : 'brand';
      const permissionTag = permissionScope;

      const permission = await tx.authzPermission.upsert({
        where: { name_appId: { name: permissionName, appId: APP_ID } },
        update: {
          name: permissionName,
          appId: APP_ID,
          scope: permissionScope,
          tag: permissionTag,
        },
        create: {
          id: permissionId,
          name: permissionName,
          appId: APP_ID,
          scope: permissionScope,
          tag: permissionTag,
        },
        select: { id: true },
      });

      await tx.authzRolePermissionMap.upsert({
        where: {
          roleId_permissionId: {
            roleId: BRAND_OWNER_ROLE_ID,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: BRAND_OWNER_ROLE_ID,
          permissionId: permission.id,
        },
      });
    }

    for (const permissionName of BRAND_ROOT_PERMISSION_NAMES) {
      const permissionId = `cap-brand-root-${slugifyPermission(permissionName)}`;
      await tx.authzPermission.upsert({
        where: { name_appId: { name: permissionName, appId: APP_ID } },
        update: {
          name: permissionName,
          appId: APP_ID,
          scope: 'individual.root',
          tag: 'individual.root',
        },
        create: {
          id: permissionId,
          name: permissionName,
          appId: APP_ID,
          scope: 'individual.root',
          tag: 'individual.root',
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
