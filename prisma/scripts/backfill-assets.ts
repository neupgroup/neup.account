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

import prisma from '@/.neup/core/database/prisma';

const ACCOUNT_ASSET_TYPE = 'acc_in_acc' as const;
const APPLICATION_ASSET_TYPE = 'app_in_acc' as const;

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
    const existingAsset = await prisma.asset.findFirst({
      where: {
        member_account_id: account.id,
        parent_account_id: account.id,
        access_type: ACCOUNT_ASSET_TYPE,
      },
    });

    if (existingAsset) { skipped++; continue; }

    await prisma.asset.create({
      data: {
        parent_account_id: account.id,
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

    const ownerAccountId = ownerGrant?.parentAccountId ?? ownerGrant?.memberAccountId ?? null;
    if (!ownerAccountId) {
      console.warn(`  Skipping app ${app.id}: no owner grant found.`);
      skipped++;
      continue;
    }

    await prisma.asset.create({
      data: {
        parent_account_id: ownerAccountId,
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
