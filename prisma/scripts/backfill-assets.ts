/**
 * Backfill script: create Asset entries for all existing accounts
 * (individual, brand, subbrand, dependent) and applications that don't
 * already have one in the assets table.
 *
 * Run with:
 *   npx tsx prisma/scripts/backfill-assets.ts
 *
 * Safe to run multiple times — skips rows that already exist.
 */

import { PrismaClient } from '../generated/client/client';
import { BRAND_OWNER_ROLE_ID } from '../../core/auth/brand-roles';

const prisma = new PrismaClient();

// Current schema uses enum AssetType: acc_in_port | acc_in_acc | app_in_port | app_in_acc | port_in_acc | conn_in_acc | conn_in_port.
const ACCOUNT_ASSET_TYPE = 'acc_in_port' as const;
const APPLICATION_ASSET_TYPE = 'app_in_port' as const;

/**
 * Finds a personal portfolio for the given account.
 * A "personal" portfolio is one whose only member is the account itself.
 */
async function findPersonalPortfolio(accountId: string): Promise<string | null> {
  // Look for a portfolio where this account is the sole member
  const existing = await prisma.portfolio.findFirst({
    where: {
      members: {
        every: { memberType: 'account', memberAccountId: accountId },
        some: { memberType: 'account', memberAccountId: accountId },
      },
    },
    select: { id: true },
  });

  return existing?.id ?? null;
}

async function backfillAccounts() {
  const accountTypes = ['individual', 'brand', 'subbrand', 'dependent'];

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
    // - For brand/subbrand/dependent: look up grants from access rows
    let portfolioOwnerId = account.id;

    if (account.accountType === 'brand') {
      const ownerGrant = await prisma.access.findFirst({
        where: {
          parentAccountId: account.id,
          roleId: BRAND_OWNER_ROLE_ID,
          role: { appId: 'neup.account' },
          status: 'active',
        },
        select: { memberAccountId: true },
      });
      if (ownerGrant?.memberAccountId) portfolioOwnerId = ownerGrant.memberAccountId;
    }

    if (account.accountType === 'subbrand') {
      const ownerGrant = await prisma.access.findFirst({
        where: {
          parentAccountId: account.id,
          roleId: 'brand-owner-neup-account',
          role: { appId: 'neup.account' },
          status: 'active',
        },
        select: { memberAccountId: true },
      });
      if (ownerGrant?.memberAccountId) portfolioOwnerId = ownerGrant.memberAccountId;
    }

    if (account.accountType === 'dependent') {
      const guardianGrant = await prisma.access.findFirst({
        where: {
          parentAccountId: account.id,
          roleId: 'account.guardian',
          role: { appId: 'neup.account' },
          status: 'active',
        },
        select: { memberAccountId: true },
      });
      if (guardianGrant?.memberAccountId) portfolioOwnerId = guardianGrant.memberAccountId;
    }

    // Check if an asset entry already exists for this account
    const existingAsset = await prisma.asset.findFirst({
      where: { member_account_id: account.id, access_type: ACCOUNT_ASSET_TYPE },
    });

    if (existingAsset) { skipped++; continue; }

    const parentPortfolioId = await findPersonalPortfolio(portfolioOwnerId);
    if (!parentPortfolioId) {
      skipped++;
      continue;
    }

    await prisma.asset.create({
      data: {
        parent_portfolio_id: parentPortfolioId,
        member_account_id: account.id,
        access_type: ACCOUNT_ASSET_TYPE,
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
      where: { access_application_id: app.id, access_type: APPLICATION_ASSET_TYPE },
    });

    if (existingAsset) { skipped++; continue; }

    // Find the owner of this application via access grants.
    const ownerGrant = await prisma.access.findFirst({
      where: {
        roleId: 'application.owner',
        accessApplicationId: app.id,
        status: 'active',
      },
      select: { parentAccountId: true, memberAccountId: true },
    });

    // If no owner found, skip — can't determine which portfolio to use
    const ownerAccountId = ownerGrant?.parentAccountId ?? ownerGrant?.memberAccountId ?? null;
    if (!ownerAccountId) {
      console.warn(`  Skipping app ${app.id}: no owner grant found.`);
      skipped++;
      continue;
    }

    const parentPortfolioId = await findPersonalPortfolio(ownerAccountId);
    if (!parentPortfolioId) {
      skipped++;
      continue;
    }

    await prisma.asset.create({
      data: {
        parent_portfolio_id: parentPortfolioId,
        access_application_id: app.id,
        access_type: APPLICATION_ASSET_TYPE,
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
