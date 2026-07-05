import prisma from '@/neup.core/helpers/prisma';
import { dispatchRoleUpdateWebhook, getRolePayload } from '@/services/applications/role-update-events';

async function main() {
  const requestedAppId = process.argv[2]?.trim();

  const applications = await prisma.application.findMany({
    where: {
      ...(requestedAppId ? { id: requestedAppId } : {}),
      bridge: {
        some: {
          type: 'roleUpdateWebhook',
        },
      },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  if (applications.length === 0) {
    console.log(requestedAppId ? `No webhook-enabled application found for ${requestedAppId}.` : 'No webhook-enabled applications found.');
    return;
  }

  for (const application of applications) {
    const roles = await prisma.authzRole.findMany({
      where: { appId: application.id },
      select: { id: true },
      orderBy: { name: 'asc' },
    });

    console.log(`Replaying ${roles.length} role.updated event(s) for ${application.id}`);

    for (const role of roles) {
      const payload = await getRolePayload(application.id, role.id);
      if (!payload) {
        console.warn(`Skipping missing role payload for ${application.id}:${role.id}`);
        continue;
      }

      await dispatchRoleUpdateWebhook({
        appId: application.id,
        eventType: 'role.updated',
        role: payload,
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
