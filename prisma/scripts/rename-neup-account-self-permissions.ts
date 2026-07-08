import 'dotenv/config';
import { Prisma } from '../../prisma/generated/client/client';
import prisma from '@/core/helpers/prisma';

const APP_ID = 'neup.account';

const RENAMES: Array<[string, string]> = [
  ['profile.display.view.self', 'profile.display.name'],
  ['profile.display.update.self', 'profile.display.update'],
  ['self.profile.legal.view', 'profile.legal.view'],
  ['self.profile.legal.update', 'profile.legal.update'],
  ['self.profile.demographics.view', 'profile.demographics.view'],
  ['self.profile.demographics.update', 'profile.demographics.update'],
  ['self.profile.neupid.view', 'profile.neupid.view'],
  ['self.profile.neupid.request', 'profile.neupid.request'],
  ['self.profile.neupid.remove', 'profile.neupid.remove'],
  ['self.profile.contact.view', 'profile.contact.view'],
  ['self.profile.contact.update', 'profile.contact.update'],
  ['self.profile.kyc.view', 'profile.kyc.view'],
  ['self.profile.kyc.update', 'profile.kyc.update'],
  ['self.notification.read', 'notification.read'],
  ['self.notification.delete', 'notification.delete'],
  ['security.pass.modify.self', 'security.pass.modify'],
  ['security.totp.add.self', 'security.totp.add'],
  ['security.totp.remove.self', 'security.totp.remove'],
  ['security.backup_codes.view.self', 'security.backup_codes.view'],
  ['security.backup_codes.create.self', 'security.backup_codes.create'],
  ['security.recovery_accounts.view.self', 'security.recovery_accounts.view'],
  ['security.recovery_accounts.add.self', 'security.recovery_accounts.add'],
  ['security.recovery_accounts.remove.self', 'security.recovery_accounts.remove'],
  ['security.recovery_phone.view.self', 'security.recovery_phone.view'],
  ['security.recovery_phone.add.self', 'security.recovery_phone.add'],
  ['security.recovery_phone.remove.self', 'security.recovery_phone.remove'],
  ['security.recovery_email.view.self', 'security.recovery_email.view'],
  ['security.recovery_email.add.self', 'security.recovery_email.add'],
  ['security.recovery_email.remove.self', 'security.recovery_email.remove'],
  ['security.login_devices.view.self', 'security.login_devices.view'],
  ['linked_accounts.brand.create.self', 'linked_accounts.brand.create'],
  ['linked_accounts.brand.view.self', 'linked_accounts.brand.view'],
  ['linked_accounts.brand.manage.self', 'linked_accounts.brand.manage'],
  ['linked_accounts.brand.manager.self', 'linked_accounts.brand.manager'],
  ['linked_accounts.dependent.create.self', 'linked_accounts.dependent.create'],
  ['linked_accounts.dependent.view.self', 'linked_accounts.dependent.view'],
  ['data.agreed_terms.view.self', 'data.agreed_terms.view'],
  ['data.delete_account.start.self', 'data.delete_account.start'],
  ['data.deactivate_account.start.self', 'data.deactivate_account.start'],
  ['data.materialization.view.self', 'data.materialization.view'],
  ['data.materialization.modify.self', 'data.materialization.modify'],
  ['security.recent_activities.view.self', 'security.recent_activities.view'],
  ['security.third_party.view.self', 'access.view'],
  ['access.view.scopePublic', 'access.view'],
  ['access.view.scopeManaged', 'access.view'],
  ['access.view.scopeRoot', 'access.view'],
  ['application.view.scopePublic', 'application.view'],
  ['application.view.scopeManaged', 'application.view'],
  ['application.view.scopeRoot', 'application.view'],
  ['application.edit.scopePublic', 'application.edit'],
  ['application.edit.scopeManaged', 'application.edit'],
  ['application.edit.scopeRoot', 'application.edit'],
  ['application.delete.scopePublic', 'application.delete'],
  ['application.delete.scopeManaged', 'application.delete'],
  ['application.delete.scopeRoot', 'application.delete'],
  ['application.logs.view.scopePublic', 'application.logs.view'],
  ['application.logs.view.scopeManaged', 'application.logs.view'],
  ['application.logs.view.scopeRoot', 'application.logs.view'],
  ['application.devlogs.view.scopePublic', 'application.devlogs.view'],
  ['application.devlogs.view.scopeManaged', 'application.devlogs.view'],
  ['application.devlogs.view.scopeRoot', 'application.devlogs.view'],
  ['application.roles.view.scopePublic', 'application.roles.view'],
  ['application.roles.view.scopeManaged', 'application.roles.view'],
  ['application.roles.view.scopeRoot', 'application.roles.view'],
  ['application.roles.manage.scopePublic', 'application.roles.manage'],
  ['application.roles.manage.scopeManaged', 'application.roles.manage'],
  ['application.roles.manage.scopeRoot', 'application.roles.manage'],
  ['account.brand.members.manage.scopeManaged', 'account.brand.members.manage'],
  ['account.brand.members.manage.scopeRoot', 'account.brand.members.manage'],
  ['account.brand.kyc.view.scopeManaged', 'account.brand.kyc.view'],
  ['account.brand.kyc.view.scopeRoot', 'account.brand.kyc.view'],
  ['account.brand.kyc.submit.scopeManaged', 'account.brand.kyc.submit'],
  ['account.brand.kyc.submit.scopeRoot', 'account.brand.kyc.submit'],
  ['account.brand.delete.scopeManaged', 'account.brand.delete'],
  ['account.brand.delete.scopeRoot', 'account.brand.delete'],
  ['security.third_party.add.self', 'security.third_party.add'],
  ['security.third_party.remove.self', 'security.third_party.remove'],
];

function renameJsonPermissions(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  const renamed = value.map((entry) => {
    if (typeof entry !== 'string') return entry;
    const match = RENAMES.find(([from]) => from === entry);
    return match ? match[1] : entry;
  });

  const seen = new Set<string>();
  const deduped: unknown[] = [];
  for (const entry of renamed) {
    if (typeof entry !== 'string') {
      deduped.push(entry);
      continue;
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    deduped.push(entry);
  }

  return deduped;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }

  const renameMap = new Map(RENAMES);

  await prisma.$transaction(async (tx) => {
    for (const [from, to] of RENAMES) {
      const sourceCount = await tx.authzPermission.count({ where: { appId: APP_ID, name: from } });
      const targetCount = await tx.authzPermission.count({ where: { appId: APP_ID, name: to } });

      if (sourceCount === 0) continue;

      if (targetCount > 0) {
        await tx.authzPermission.deleteMany({
          where: { appId: APP_ID, name: from },
        });
        continue;
      }

      await tx.authzPermission.updateMany({
        where: { appId: APP_ID, name: from },
        data: { name: to },
      });
    }

    const roles = await tx.authzRole.findMany({
      where: { appId: APP_ID },
      select: { id: true, permissions: true },
    });

    for (const role of roles) {
      const nextPermissions = renameJsonPermissions(role.permissions);
      if (nextPermissions === role.permissions) continue;

      await tx.authzRole.update({
        where: { id: role.id },
        data: { permissions: nextPermissions as Prisma.InputJsonValue },
      });
    }

    const legacyRoles = await tx.role.findMany({
      where: { authzRole: { appId: APP_ID } },
      select: { id: true, permissions: true },
    });

    for (const role of legacyRoles) {
      const nextPermissions = renameJsonPermissions(role.permissions);
      if (nextPermissions === role.permissions) continue;

      await tx.role.update({
        where: { id: role.id },
        data: { permissions: nextPermissions as Prisma.InputJsonValue },
      });
    }
  }, { timeout: 60000 });

  console.log(`Renamed ${renameMap.size} permission names for ${APP_ID}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('rename-neup-account-self-permissions failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
