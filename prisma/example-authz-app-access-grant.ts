/**
 * Example usage of the canonical access model.
 *
 * Flow:
 * 1. The Member row links the receiving account to the owner account/portfolio.
 * 2. The Asset row identifies what is being shared.
 * 3. The Access row links member + asset + role.
 */

import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

async function grantAppAccess() {
  const appId = 'real-estate-app-id';
  const ownerAccountId = 'owner-account-xxx';
  const targetAccountId = 'target-user-yyy';
  const roleId = 'property-poster-role-id';

  const member = await prisma.member.upsert({
    where: { id: `${ownerAccountId}:${targetAccountId}` },
    update: { status: 'active', isTemporary: null },
    create: {
      id: `${ownerAccountId}:${targetAccountId}`,
      memberType: 'acc_in_acc',
      memberAccountId: targetAccountId,
      parentAccountId: ownerAccountId,
      status: 'active',
    },
  });

  const asset = await prisma.asset.create({
    data: {
      access_type: 'app_in_acc',
      parent_account_id: ownerAccountId,
      access_application_id: appId,
      status: 'active',
    },
  });

  const grant = await prisma.access.create({
    data: {
      accessType: 'app_in_acc',
      memberId: member.id,
      memberAccountId: targetAccountId,
      parentAccountId: ownerAccountId,
      assetId: asset.id,
      assetApplicationId: appId,
      accessApplicationId: appId,
      roleId,
      status: 'active',
    },
  });

  console.log('Access granted:', grant);
  return grant;
}

async function checkAppAccess(appId: string, targetAccountId: string) {
  const grants = await prisma.access.findMany({
    where: {
      accessApplicationId: appId,
      memberAccountId: targetAccountId,
      status: 'active',
      OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
    },
    include: {
      role: true,
      asset: true,
      member: true,
    },
  });

  console.log('User has the following grants:', grants);
  return grants;
}

async function revokeAppAccess(grantId: string) {
  await prisma.access.delete({
    where: { id: grantId },
  });

  console.log('Access revoked');
}

async function listAllGrantsForApp(appId: string) {
  return prisma.access.findMany({
    where: { accessApplicationId: appId },
    include: {
      memberAccount: {
        select: {
          id: true,
          displayName: true,
        },
      },
      parentAccount: {
        select: {
          id: true,
          displayName: true,
        },
      },
      role: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  });
}

export {
  grantAppAccess,
  checkAppAccess,
  revokeAppAccess,
  listAllGrantsForApp,
};
