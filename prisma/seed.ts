/*
::neup.documentation::prisma-seed-script

Seeds the base Neup Account app, default roles, and canonical permission rows.

::public

Use this script to initialize a development database with the core Neup Account authz records.

::public end

::private

The seed keeps legacy root/default role names alive while populating the canonical authz permission catalog and connection grants.

::private end

::end
*/

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '@/core/database/prisma';
import { ensureAccessGrant } from '../services/access-model';
import {
  NEUP_ACCOUNT_APP_ID,
  NEUP_ACCOUNT_DEFAULT_ROLE_PERMISSION_NAMES,
  NEUP_ACCOUNT_PERMISSION_DEFINITIONS,
  NEUP_ACCOUNT_ROOT_ROLE_PERMISSION_NAMES,
} from '../inapp/permissions/permission-catalog';

// Root permissions are now managed via authz_role_capability in the database.
// This legacy seed writes to the Permit table for backward compatibility.
const ROOT_PERMISSIONS: string[] = [];
const APP_ID = NEUP_ACCOUNT_APP_ID;
const ROLE_DEFAULT_ID = 'individual-default-neup-account';
const ROLE_ROOT_ID = 'root-full-neup-account';

function slugifyPermission(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Please configure your database connection.');
}

async function main() {
  const NEUP_ID = 'neupkishor';
  const firstName = 'Kishor';
  const lastName = 'Neupane';
  const nationality = 'Nepal';
  const dob = new Date('2004-01-25T00:00:00.000Z');
  const passwordPlain = 'admin112';

  const existingNeupId = await prisma.neupId.findUnique({ where: { id: NEUP_ID } });
  let accountId: string | null = existingNeupId?.accountId ?? null;

  const nameDisplay = `${firstName} ${lastName}`.trim();
  const hashed = await bcrypt.hash(passwordPlain, 10);

  if (!accountId) {
    const created = await prisma.account.create({
      data: {
        accountType: 'individual',
        status: 'active',
        isVerified: false,
        displayName: nameDisplay,
        individualProfile: {
          create: {
            firstName,
            lastName,
            dateOfBirth: dob,
            countryOfResidence: nationality,
          },
        },
        authMethods: {
          create: {
            type: 'password',
            value: hashed,
            order: 'primary',
            status: 'active',
          },
        },
        neupIds: {
          create: {
            id: NEUP_ID,
            neupId: NEUP_ID,
            isPrimary: true,
          },
        },
      },
    });

    accountId = created.id;
  } else {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        accountType: 'individual',
        status: 'active',
        displayName: nameDisplay,
        isVerified: false,
        individualProfile: {
          upsert: {
            update: {
              firstName,
              lastName,
              dateOfBirth: dob,
              countryOfResidence: nationality,
            },
            create: {
              firstName,
              lastName,
              dateOfBirth: dob,
              countryOfResidence: nationality,
            },
          },
        },
      },
    });

    const neupRecord = await prisma.neupId.findUnique({ where: { id: NEUP_ID } });
    if (!neupRecord) {
      await prisma.neupId.create({
        data: { id: NEUP_ID, neupId: NEUP_ID, accountId, isPrimary: true },
      });
    } else if (neupRecord.accountId === accountId && !neupRecord.isPrimary) {
      await prisma.neupId.update({
        where: { id: NEUP_ID },
        data: { isPrimary: true },
      });
    }

    await prisma.authnMethod.upsert({
      where: {
        accountId_type_order: {
          accountId,
          type: 'password',
          order: 'primary',
        },
      },
      update: {
        status: 'active',
        value: hashed,
      },
      create: {
        accountId,
        type: 'password',
        value: hashed,
        order: 'primary',
        status: 'active',
      },
    });
  }

  if (accountId) {
    const rootDenormalized = Array.from(new Set(NEUP_ACCOUNT_ROOT_ROLE_PERMISSION_NAMES));
    const defaultDenormalized = Array.from(new Set(NEUP_ACCOUNT_DEFAULT_ROLE_PERMISSION_NAMES));

    await prisma.application.upsert({
      where: { id: APP_ID },
      update: { name: 'Neup Account' },
      create: { id: APP_ID, name: 'Neup Account' },
    });


    await prisma.authzRole.upsert({
      where: { id: ROLE_DEFAULT_ID },
      update: {
        name: 'individual.default',
        description: 'Default permission set for individual accounts.',
        scope: 'public.individual',
        appId: APP_ID,
        permissions: defaultDenormalized,
      },
      create: {
        id: ROLE_DEFAULT_ID,
        name: 'individual.default',
        description: 'Default permission set for individual accounts.',
        scope: 'public.individual',
        appId: APP_ID,
        permissions: defaultDenormalized,
      },
    });

    await prisma.authzRole.upsert({
      where: { id: ROLE_ROOT_ID },
      update: {
        name: 'individual.root',
        description: 'Root permission set for individual accounts.',
        scope: 'root.individual',
        appId: APP_ID,
        permissions: rootDenormalized,
      },
      create: {
        id: ROLE_ROOT_ID,
        name: 'individual.root',
        description: 'Root permission set for individual accounts.',
        scope: 'root.individual',
        appId: APP_ID,
        permissions: rootDenormalized,
      },
    });

    for (const permissionDefinition of NEUP_ACCOUNT_PERMISSION_DEFINITIONS.filter((permission) => permission.selfAssigned)) {
      const permissionName = permissionDefinition.name;
      const permissionId = `cap-def-${slugifyPermission(permissionName)}`;
      const permission = await prisma.authzPermission.upsert({
        where: { id: permissionId },
        update: {
          name: permissionName,
          description: permissionDefinition.description,
          appId: APP_ID,
          scopeFor: ['for_individual'],
          approvalPolicy: permissionDefinition.approvalPolicy,
        },
        create: {
          id: permissionId,
          name: permissionName,
          description: permissionDefinition.description,
          appId: APP_ID,
          scopeFor: ['for_individual'],
          approvalPolicy: permissionDefinition.approvalPolicy,
        },
        select: { id: true },
      });

      await prisma.authzRolePermissionMap.upsert({
        where: {
          roleId_permissionId_scopeFor_scopeLevel: {
            roleId: ROLE_DEFAULT_ID,
            permissionId: permission.id,
            scopeFor: 'for_individual',
            scopeLevel: 'assignable.publicly',
          },
        } as any,
        update: {},
        create: {
          roleId: ROLE_DEFAULT_ID,
          permissionId: permission.id,
          scope: 'public.individual',
          scopeFor: 'for_individual',
          scopeLevel: 'assignable.publicly',
        },
      });
    }

    for (const permissionDefinition of NEUP_ACCOUNT_PERMISSION_DEFINITIONS.filter((permission) => permission.rootManaged)) {
      const permissionName = permissionDefinition.name;
      const permissionId = `cap-root-${slugifyPermission(permissionName)}`;
      const permission = await prisma.authzPermission.upsert({
        where: { id: permissionId },
        update: {
          name: permissionName,
          description: permissionDefinition.description,
          appId: APP_ID,
          scopeFor: ['for_individual'],
          approvalPolicy: permissionDefinition.approvalPolicy,
        },
        create: {
          id: permissionId,
          name: permissionName,
          description: permissionDefinition.description,
          appId: APP_ID,
          scopeFor: ['for_individual'],
          approvalPolicy: permissionDefinition.approvalPolicy,
        },
        select: { id: true },
      });

      await prisma.authzRolePermissionMap.upsert({
        where: {
          roleId_permissionId_scopeFor_scopeLevel: {
            roleId: ROLE_ROOT_ID,
            permissionId: permission.id,
            scopeFor: 'for_individual',
            scopeLevel: 'assignable.byRoot',
          },
        } as any,
        update: {},
        create: {
          roleId: ROLE_ROOT_ID,
          permissionId: permission.id,
          scope: 'root.individual',
          scopeFor: 'for_individual',
          scopeLevel: 'assignable.byRoot',
        },
      });
    }

    await ensureAccessGrant(prisma, {
      memberAccountId: accountId,
      parentAccountId: accountId,
      childAccountId: accountId,
      accessApplicationId: APP_ID,
      roleId: ROLE_DEFAULT_ID,
    });

    await ensureAccessGrant(prisma, {
      memberAccountId: accountId,
      parentAccountId: accountId,
      childAccountId: accountId,
      accessApplicationId: APP_ID,
      roleId: ROLE_ROOT_ID,
    });

    // Compatibility path for legacy permission checks.
    // Some environments no longer have the `permit` table.
    try {
      const existingPermit = await prisma.permit.findFirst({
        where: { accountId, memberId: accountId },
      });
      if (!existingPermit) {
        await prisma.permit.create({
          data: {
            accountId,
            memberId: accountId,
            forSelf: true,
            isRoot: true,
            permissions: ROOT_PERMISSIONS,
            restrictions: [],
          },
        });
      } else {
        await prisma.permit.update({
          where: { id: existingPermit.id },
          data: {
            forSelf: true,
            isRoot: true,
            permissions: ROOT_PERMISSIONS,
            restrictions: [],
          },
        });
      }
    } catch (error) {
      const e = error as { code?: string };
      if (e?.code !== 'P2021') throw error;
    }

    // eslint-disable-next-line no-console
    console.log(
      `Seeded accountId=${accountId} roles=${ROLE_DEFAULT_ID},${ROLE_ROOT_ID} accountType=individual root=true permissions=${rootDenormalized.length}`,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    // eslint-disable-next-line no-console
    console.log('Seed completed for NeupID "neupkishor".');
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    if ((e as any)?.code === 'ECONNREFUSED') {
      console.error('Seed failed: cannot connect to the database (ECONNREFUSED).');
      console.error('Check that your Postgres server is running and DATABASE_URL is correct.');
      console.error(`Current DATABASE_URL: ${process.env.DATABASE_URL || '(not set)'}`);
    } else {
      console.error('Seed failed:', e);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
