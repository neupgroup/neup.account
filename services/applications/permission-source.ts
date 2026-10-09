import prisma from '@neup/core/database/prisma';

/** Resolve definitions only; roles and grants continue to belong to the consuming app. */
export async function resolvePermissionSourceId(
  appId: string,
  db: Pick<typeof prisma, 'application'> = prisma,
): Promise<string> {
  const visited = new Set<string>();
  let current = appId;
  while (true) {
    if (visited.has(current)) throw new Error('Application permission sources contain a cycle.');
    visited.add(current);
    const app = await db.application.findUnique({
      where: { id: current },
      select: { usePermissionFrom: true },
    });
    if (!app) throw new Error('Permission source application not found.');
    if (!app.usePermissionFrom) return current;
    current = app.usePermissionFrom;
  }
}

/** Definition management is unavailable on applications using shared permissions. */
export async function getLocalAuthzManagementError(
  appId: string,
  db: Pick<typeof prisma, 'application'> = prisma,
): Promise<string | null> {
  const app = await db.application.findUnique({ where: { id: appId }, select: { usePermissionFrom: true } });
  if (!app) return 'Application not found.';
  return app.usePermissionFrom
    ? `This application's permissions are managed from application ${app.usePermissionFrom}. Manage roles and permissions there.`
    : null;
}
