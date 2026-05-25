import 'dotenv/config';
import prisma from '../core/helpers/prisma';

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

  // Upsert the account.root role and grant it to the account.
  // This replaces the legacy permit-based root grant.
  await prisma.authzRole.upsert({
    where: { id: 'account.root' },
    update: { name: 'account.root', scope: 'root', appId: 'neup.account' },
    create: { id: 'account.root', name: 'account.root', scope: 'root', appId: 'neup.account' },
  });

  const existingGrant = await prisma.member.findFirst({
    where: { accessTo: accountId, memberId: accountId, roleId: 'account.root', appId: 'neup.account' },
  });
  if (!existingGrant) {
    await prisma.member.create({
      data: { accessTo: accountId, memberId: accountId, roleId: 'account.root', appId: 'neup.account' },
    });
    console.log(`Root grant created for account "${account.displayName}" (${accountId}).`);
  } else {
    console.log(`Root grant already exists for account "${account.displayName}" (${accountId}).`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('grant-root failed:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
