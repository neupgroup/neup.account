import 'dotenv/config';
import prisma from '@/.neup/core/database/prisma';
import { ensureAccessGrant } from '../../services/access-model';

const APP_ID = 'neup.account';
const DEFAULT_ROLE_NAME = 'individual.default';
const ROOT_ROLE_NAME = 'individual.root';
const EXCLUDED_NEUP_ID = 'neupkishor';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }

  const [defaultRole, rootRole, excludedNeupId] = await Promise.all([
    prisma.authzRole.findFirst({
      where: { name: DEFAULT_ROLE_NAME, appId: APP_ID },
      select: { id: true },
    }),
    prisma.authzRole.findFirst({
      where: { name: ROOT_ROLE_NAME, appId: APP_ID },
      select: { id: true },
    }),
    prisma.neupId.findUnique({
      where: { id: EXCLUDED_NEUP_ID },
      select: { accountId: true },
    }),
  ]);

  if (!defaultRole) {
    throw new Error(`Role "${DEFAULT_ROLE_NAME}" was not found for app "${APP_ID}".`);
  }
  if (!rootRole) {
    throw new Error(`Role "${ROOT_ROLE_NAME}" was not found for app "${APP_ID}".`);
  }

  const excludedAccountId = excludedNeupId?.accountId ?? null;
  const accounts = await prisma.account.findMany({
    where: excludedAccountId
      ? {
          accountType: 'individual',
          NOT: { id: excludedAccountId },
        }
      : {
          accountType: 'individual',
        },
    select: { id: true },
  });

  console.log(`Found ${accounts.length} individual accounts to backfill.`);

  let defaultAssigned = 0;
  let rootRemoved = 0;

  for (const account of accounts) {
    await ensureAccessGrant(prisma, {
      memberAccountId: account.id,
      parentAccountId: account.id,
      childAccountId: account.id,
      accessApplicationId: APP_ID,
      roleId: defaultRole.id,
    });
    defaultAssigned++;

    const deleted = await prisma.access.deleteMany({
      where: {
        memberAccountId: account.id,
        parentAccountId: account.id,
        roleId: rootRole.id,
      },
    });
    rootRemoved += deleted.count;
  }

  console.log(`Default role ensured for ${defaultAssigned} accounts.`);
  console.log(`Root grants removed from ${rootRemoved} access rows.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('Backfill failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
