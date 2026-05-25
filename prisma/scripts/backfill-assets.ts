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

// Current schema uses enum AssetType: account | application | connection.
const ACCOUNT_ASSET_TYPE = 'account' as const;

/**
 * Finds a personal portfolio for the given account.
 * A "personal" portfolio is one whose only member is the account itself.
 */
async function findPersonalPortfolio(accountId: string): Promise<string | null> {
  // Look for a portfolio where this account is the sole member
  const existing = await prisma.portfolio.findFirst({
    where: {
      members: {
        every: { memberId: accountId },
        some: { memberId: accountId },
      },
    },
    select: { id: true },
  });

  return existing?.id ?? null;
}

async function backfillAccounts() {
  const accountTypes = ['individual', 'brand', 'branch', 'dependent'];

  const accounts = await prisma.account.findMany({
    where: { accountType: { in: accountTypes } },
    select: { id: true, accountType: true },
  });

  console.log(`Found ${accounts.length} non-guest accounts to process.`);

  let created = 0;
  let skipped = 0;

  for (const account of accounts) {
    // Determine the "owner" of the personal portfolio:
    // - For individual/dependent: the account itself
    // - For brand/branch/dependent: look up grants from member rows
    let portfolioOwnerId = account.id;

    if (account.accountType === 'brand' || account.accountType === 'branch') {
      const ownerGrant = await prisma.member.findFirst({
        where: {
          accessTo: account.id,
          roleId: 'brand-owner-neup-account',
          parentApplicationId: 'neup.account',
        },
        select: { memberId: true },
      });
      if (ownerGrant) portfolioOwnerId = ownerGrant.memberId;
    }

    if (account.accountType === 'dependent') {
      const guardianGrant = await prisma.member.findFirst({
        where: {
          accessTo: account.id,
          roleId: 'account.guardian',
          parentApplicationId: 'neup.account',
        },
        select: { memberId: true },
      });
      if (guardianGrant) portfolioOwnerId = guardianGrant.memberId;
    }

    // Check if an asset entry already exists for this account
    const existingAsset = await prisma.asset.findFirst({
      where: { childAccountId: account.id, assetType: ACCOUNT_ASSET_TYPE },
    });

    if (existingAsset) { skipped++; continue; }

    const parentPortfolioId = await findPersonalPortfolio(portfolioOwnerId);
    if (!parentPortfolioId) {
      skipped++;
      continue;
    }

    await prisma.asset.create({
      data: {
        parentPortfolioId,
        childAccountId: account.id,
        assetType: ACCOUNT_ASSET_TYPE,
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
    // Check if an asset entry already exists for this app
    const existingAsset = await prisma.asset.findFirst({
      where: { childApplicationId: app.id, assetType: 'application' },
    });

    if (existingAsset) { skipped++; continue; }

    // Find the owner of this application via member grants.
    const ownerGrant = await prisma.member.findFirst({
      where: {
        parentApplicationId: app.id,
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

    const parentPortfolioId = await findPersonalPortfolio(ownerGrant.accessTo);
    if (!parentPortfolioId) {
      skipped++;
      continue;
    }

    await prisma.asset.create({
      data: {
        parentPortfolioId,
        childApplicationId: app.id,
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
