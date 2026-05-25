/**
 * Example usage of authz_app_access_grant table
 * 
 * Use case: Real estate application where account owner (xxx) wants to grant
 * another user permission to post properties on their behalf.
 */

import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

async function grantAppAccess() {
  // Example: Grant "property_poster" role to targetUser in real-estate app
  const grant = await prisma.member.create({
    data: {
      appId: 'real-estate-app-id',           // The application ID
      accountId: 'owner-account-xxx',        // The account granting access
      targetAccountId: 'target-user-yyy',    // The user receiving the role
      roleId: 'property-poster-role-id',     // The role being granted
      portfolioId: 'portfolio-zzz',          // Optional: scope to specific portfolio
    },
  });

  console.log('Access granted:', grant);
  return grant;
}

async function checkAppAccess(appId: string, targetAccountId: string) {
  // Query all grants for a user in a specific app
  const grants = await prisma.member.findMany({
    where: {
      appId,
      targetAccountId,
    },
    include: {
      role: {
        include: {
          roleMaps: {
            include: {
              permission: true,
            },
          },
        },
      },
      application: true,
      account: true,
      portfolio: true,
    },
  });

  console.log('User has the following grants:', grants);
  return grants;
}

async function revokeAppAccess(grantId: string) {
  // Revoke a specific grant
  await prisma.member.delete({
    where: { id: grantId },
  });

  console.log('Access revoked');
}

async function listAllGrantsForApp(appId: string) {
  // List all authorization grants for an application
  const grants = await prisma.member.findMany({
    where: { appId },
    include: {
      account: {
        select: {
          id: true,
          displayName: true,
        },
      },
      targetAccount: {
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

  return grants;
}

// Export for use in your API routes
export {
  grantAppAccess,
  checkAppAccess,
  revokeAppAccess,
  listAllGrantsForApp,
};
