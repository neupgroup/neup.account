import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../core/helpers/prisma';
import { ensureAccessGrant } from '../services/access-model';

// Root permissions are now managed via authz_role_capability in the database.
// This legacy seed writes to the Permit table for backward compatibility.
const ROOT_PERMISSIONS: string[] = [];
const APP_ID = 'neup.account';
const ROLE_DEFAULT_ID = 'individual-default-neup-account';
const ROLE_ROOT_ID = 'root-full-neup-account';

const DEFAULT_CAPABILITIES = [
  'profile.display.name',
  'profile.display.update',
  'profile.display.view',
  'profile.display.view.root',
  'profile.display.update.root',
  'profile.legal.view',
  'profile.legal.update',
  'profile.demographics.view',
  'profile.demographics.update',
  'profile.neupid.update',
  'profile.neupid.request',
  'profile.neupid.remove',
  'profile.contact.view',
  'profile.contact.update',
  'profile.kyc.view',
  'profile.kyc.update',
  'notification.read',
  'notification.delete',
  'security.pass.modify',
  'security.totp.add',
  'security.totp.remove',
  'security.backup_codes.view',
  'security.backup_codes.create',
  'security.recovery_accounts.view',
  'security.recovery_accounts.add',
  'security.recovery_accounts.remove',
  'security.recovery_phone.view',
  'security.recovery_phone.add',
  'security.recovery_phone.remove',
  'security.recovery_email.view',
  'security.recovery_email.add',
  'security.recovery_email.remove',
  'security.login_devices.view',
  'linked_accounts.brand.create',
  'linked_accounts.brand.view',
  'linked_accounts.dependent.create',
  'linked_accounts.dependent.view',
  'data.agreed_terms.view',
  'data.delete_account.start',
  'data.deactivate_account.start',
  'data.materialization.view',
  'data.materialization.modify',
  'security.third_party.view',
  'security.recent_activities.view',
  'security.third_party.add',
  'security.third_party.remove',
  'people.family.view',
  'people.family.add',
  'people.family.remove',
  'people.family.partner.add',
  'people.family.partner.remove',
  'people.block_list.view',
  'people.restrict_list.view',
  'payment.method.show',
  'payment.transactions.show',
  'payment.subscriptions.show',
  'payment.purchase_neup_pro.view',
  'linked_accounts.brand.manage',
  'linked_accounts.brand.manager',
] as const;

const ROOT_CAPABILITIES = [
  'root.account.view',
  'root.account.modify',
  'root.account.delete',
  'root.account.search',
  'root.account.create_individual',
  'root.account.access.view',
  'root.account.access.edit',
  'root.account.send_warning',
  'root.account.give_block_account',
  'root.account.remove_block_account',
  'root.account.impersonate',
  'root.account.edit_pro_status',
  'root.account.edit_neupid',
  'root.application.view',
  'root.application.create',
  'root.application.edit',
  'root.application.delete',
  'root.application.logs.view',
  'root.application.devlogs.view',
  'root.application.roles.view',
  'root.application.roles.manage',
  'root.permission.view',
  'root.permission.edit',
  'root.requests.view',
  'root.requests.approve',
  'root.requests.deny',
  'root.dashboard.view',
  'root.payment_config.view',
  'root.errors.view',
  'root.site.social_accounts.read',
  'root.site.social_accounts.add',
  'root.site.social_accounts.edit',
  'root.site.social_accounts.delete',
  'root.display_images.view',
  'root.display_images.add',
  'root.display_images.update',
  'root.display_images.delete',
] as const;

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
    const rootDenormalized = Array.from(
      new Set([...DEFAULT_CAPABILITIES, ...ROOT_CAPABILITIES]),
    );
    const defaultDenormalized = Array.from(new Set(DEFAULT_CAPABILITIES));

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
        scope: 'default',
        appId: APP_ID,
        permissions: defaultDenormalized,
      },
      create: {
        id: ROLE_DEFAULT_ID,
        name: 'individual.default',
        description: 'Default permission set for individual accounts.',
        scope: 'default',
        appId: APP_ID,
        permissions: defaultDenormalized,
      },
    });

    await prisma.authzRole.upsert({
      where: { id: ROLE_ROOT_ID },
      update: {
        name: 'individual.root',
        description: 'Root permission set for individual accounts.',
        scope: 'root',
        appId: APP_ID,
        permissions: rootDenormalized,
      },
      create: {
        id: ROLE_ROOT_ID,
        name: 'individual.root',
        description: 'Root permission set for individual accounts.',
        scope: 'root',
        appId: APP_ID,
        permissions: rootDenormalized,
      },
    });

    for (const permissionName of DEFAULT_CAPABILITIES) {
      const permissionId = `cap-def-${slugifyPermission(permissionName)}`;
      const permission = await prisma.authzPermission.upsert({
        where: { name_appId: { name: permissionName, appId: APP_ID } },
        update: { name: permissionName, appId: APP_ID, tag: 'default' },
        create: { id: permissionId, name: permissionName, appId: APP_ID, tag: 'default' },
        select: { id: true },
      });

      await prisma.authzRolePermissionMap.upsert({
        where: {
          roleId_permissionId: {
            roleId: ROLE_DEFAULT_ID,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: ROLE_DEFAULT_ID,
          permissionId: permission.id,
        },
      });
    }

    for (const permissionName of ROOT_CAPABILITIES) {
      const permissionId = `cap-root-${slugifyPermission(permissionName)}`;
      const permission = await prisma.authzPermission.upsert({
        where: { name_appId: { name: permissionName, appId: APP_ID } },
        update: { name: permissionName, appId: APP_ID, tag: 'root' },
        create: { id: permissionId, name: permissionName, appId: APP_ID, tag: 'root' },
        select: { id: true },
      });

      await prisma.authzRolePermissionMap.upsert({
        where: {
          roleId_permissionId: {
            roleId: ROLE_ROOT_ID,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: ROLE_ROOT_ID,
          permissionId: permission.id,
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
