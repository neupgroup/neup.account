import 'dotenv/config';
import prisma from '../core/helpers/prisma';
import { ensureAccessGrant } from '../services/access-model';

// Root permissions are now managed via authz_role_capability in the database.
// This script grants a legacy root Permit record for backward compatibility.
const ROOT_PERMISSIONS: string[] = [];

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

// Usage:
//   tsx prisma/grant-root.ts <accountId>
//   tsx prisma/grant-root.ts --neupid <neupId>

async function main() {
  const args = process.argv.slice(2);

  let accountId: string | null = null;

  const neupidFlag = args.indexOf('--neupid');
  if (neupidFlag !== -1) {
    const neupId = args[neupidFlag + 1];
    if (!neupId) throw new Error('--neupid requires a value.');
    const record = await prisma.neupId.findUnique({ where: { id: neupId.toLowerCase() } });
    if (!record) throw new Error(`NeupID "${neupId}" not found.`);
    accountId = record.accountId;
  } else if (args[0]) {
    accountId = args[0];
  } else {
    throw new Error('Usage: tsx prisma/grant-root.ts <accountId>  OR  tsx prisma/grant-root.ts --neupid <neupId>');
  }

  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, displayName: true } });
  if (!account) throw new Error(`Account "${accountId}" not found.`);

  // Upsert the root role and grant it through the canonical access table.
  await prisma.authzRole.upsert({
    where: { id: 'root-full-neup-account' },
    update: { name: 'individual.root', scope: 'root', appId: 'neup.account' },
    create: { id: 'root-full-neup-account', name: 'individual.root', scope: 'root', appId: 'neup.account' },
  });

  const grant = await ensureAccessGrant(prisma, {
    memberAccountId: accountId,
    parentAccountId: accountId,
    childAccountId: accountId,
    accessApplicationId: 'neup.account',
    roleId: 'root-full-neup-account',
  });
  console.log(`Root grant ensured for account "${account.displayName}" (${accountId}), access=${grant.id}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('grant-root failed:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
