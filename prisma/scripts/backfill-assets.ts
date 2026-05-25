/**
 * Backfill script: create Asset entries for all existing accounts
 * (individual, brand, branch, dependent) and applications that don't
 * already have one in the assets table.
 *
 * Run with:
 *   npx tsx prisma/scripts/backfill-assets.ts
 *
 * Safe to run multiple times — skips rows that already exist.
 */

import { PrismaClient } from '../generated/client/client';

const prisma = new PrismaClient();

// Maps accountType → assetType string used in the assets table
const ACCOUNT_TYPE_TO_ASSET_TYPE: Record<string, string> = {
  individual: 'account.individual',
  brand:      'account.brand',
  branch:     'account.branch',
  dependent:  'account.dependent',
};

/**
 * Finds or creates a personal portfolio for the given accountId.
 * A "personal" portfolio is one whose only member is the account itself.
 */
async function findOrCreatePersonalPortfolio(accountId: string): Promise<string> {
  // Look for a portfolio where this account is the sole member
  const existing = await prisma.portfolio.findFirst({
    where: {
      members: {
        every: { accountId },
        some:  { accountId },
      },
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.portfolio.create({
    data: {
      name: 'My Assets',
      description: 'Personal asset portfolio.',
      members: {
        create: {
          accountId,
          isPermanent: true,
          hasFullAccess: true,
          details: { isPermanent: true, hasFullAccess: true },
        },
      },
    },
    select: { id: true },
  });

  return created.id;
}

async function backfillAccounts() {
  const accountTypes = Object.keys(ACCOUNT_TYPE_TO_ASSET_TYPE);

  const accounts = await prisma.account.findMany({
    where: { accountType: { in: accountTypes } },
    select: { id: true, accountType: true },
  });

  console.log(`Found ${accounts.length} non-guest accounts to process.`);

  let created = 0;
  let skipped = 0;

  for (const account of accounts) {
    const assetType = ACCOUNT_TYPE_TO_ASSET_TYPE[account.accountType];
    if (!assetType) { skipped++; continue; }

    // Determine the "owner" of the personal portfolio:
    // - For individual/dependent: the account itself
    // - For brand/branch: look for the guardian/owner via authzAccountAccessGrant
    let portfolioOwnerId = account.id;

    if (account.accountType === 'brand' || account.accountType === 'branch') {
      const ownerGrant = await prisma.authzAccountAccessGrant.findFirst({
        where: {
          accessTo: account.id,
          roleId: 'brand-owner-neup-account',
          appId: 'neup.account',
        },
        select: { memberId: true },
      });
      if (ownerGrant) portfolioOwnerId = ownerGrant.memberId;
    }

    if (account.accountType === 'dependent') {
      const guardianGrant = await prisma.authzAccountAccessGrant.findFirst({
        where: {
          accessTo: account.id,
          roleId: 'account.guardian',
          appId: 'neup.account',
        },
        select: { memberId: true },
      });
      if (guardianGrant) portfolioOwnerId = guardianGrant.memberId;
    }

    // Check if an asset entry already exists for this account
    const existingAsset = await prisma.asset.findFirst({
      where: { assetId: account.id, assetType },
    });

    if (existingAsset) { skipped++; continue; }

    const parentPortfolioId = await findOrCreatePersonalPortfolio(portfolioOwnerId);

    await prisma.asset.create({
      data: {
        parentPortfolioId,
        assetId: account.id,
        assetType,
      },
    });

    created++;
    if (created % 50 === 0) {
      console.log(`  ... ${created} account assets created so far`);
    }
  }

  console.log(`Accounts: ${created} created, ${skipped} skipped.`);
}

async function backfillApplications() {
  const applications = await prisma.application.findMany({
    select: { id: true },
  });

  console.log(`Found ${applications.length} applications to process.`);

  let created = 0;
  let skipped = 0;

  for (const app of applications) {
    // Check if an asset entry already exists
    const existingAsset = await prisma.asset.findFirst({
      where: { assetId: app.id, assetType: 'application' },
    });

    if (existingAsset) { skipped++; continue; }

    // Find the owner of this application via authzAccountAccessGrant
    const ownerGrant = await prisma.authzAccountAccessGrant.findFirst({
      where: {
        appId: app.id,
        roleId: 'application.owner',
      },
      select: { accessTo: true },
    });

    // If no owner found, skip — can't determine which portfolio to use
    if (!ownerGrant) {
      console.warn(`  Skipping app ${app.id}: no owner grant found.`);
      skipped++;
      continue;
    }

    const parentPortfolioId = await findOrCreatePersonalPortfolio(ownerGrant.accessTo);

    await prisma.asset.create({
      data: {
        parentPortfolioId,
        assetId: app.id,
        assetType: 'application',
      },
    });

    created++;
  }

  console.log(`Applications: ${created} created, ${skipped} skipped.`);
}

async function main() {
  console.log('Starting asset backfill...\n');

  await backfillAccounts();
  await backfillApplications();

  console.log('\nBackfill complete.');
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
