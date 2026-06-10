import 'dotenv/config';
import prisma from '../../core/helpers/prisma';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

function extractPermissionNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const names = value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return [];

      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof (parsed as any).name === 'string') {
          return [(parsed as any).name.trim()];
        }
      } catch {
        // Not JSON, treat as a raw permission name.
      }

      return [trimmed];
    }

    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const name = (entry as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) {
        return [name.trim()];
      }
    }

    return [];
  });

  return Array.from(new Set(names)).sort();
}

async function main() {
  const roles = await prisma.authzRole.findMany({
    select: { id: true, name: true, appId: true, permissions: true },
    orderBy: { name: 'asc' },
  });

  const updates: Array<{ id: string; name: string; mapCount: number; snapshotCount: number }> = [];

  for (const role of roles) {
    const [mapRows, legacyRows] = await Promise.all([
      prisma.authzRolePermissionMap.findMany({
        where: { roleId: role.id },
        select: {
          permission: {
            select: { name: true },
          },
        },
      }),
      prisma.role.findMany({
        where: { roleId: role.id },
        select: { id: true, permissions: true },
      }),
    ]);

    const permissionNames = Array.from(
      new Set([
        ...extractPermissionNames(role.permissions),
        ...legacyRows.flatMap((row) => extractPermissionNames(row.permissions)),
        ...mapRows
          .map((row) => row.permission?.name)
          .filter((name): name is string => typeof name === 'string' && name.trim().length > 0),
      ]),
    ).sort();

    const appId = typeof role.appId === 'string' && role.appId.trim().length > 0 ? role.appId.trim() : null;
    const resolvedPermissions = appId
      ? await prisma.authzPermission.findMany({
          where: {
            appId,
            name: { in: permissionNames },
          },
          select: { id: true, name: true },
        })
      : [];

    const permissionIds = resolvedPermissions.map((permission) => permission.id);

    await prisma.$transaction(async (tx) => {
      if (appId) {
        await tx.authzRolePermissionMap.deleteMany({ where: { roleId: role.id } });
        if (permissionIds.length > 0) {
          await tx.authzRolePermissionMap.createMany({
            data: permissionIds.map((permissionId) => ({
              roleId: role.id,
              permissionId,
            })),
            skipDuplicates: true,
          });
        }
      }

      await tx.authzRole.update({
        where: { id: role.id },
        data: { permissions: permissionNames },
      });

      await tx.role.updateMany({
        where: { roleId: role.id },
        data: { permissions: permissionNames },
      });
    });

    updates.push({
      id: role.id,
      name: role.name,
      mapCount: permissionIds.length,
      snapshotCount: permissionNames.length,
    });
  }

  console.log(`Normalized ${updates.length} authz roles and legacy role rows.`);
  if (updates.length > 0) {
    console.table(updates);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('normalize-authz-role-permissions failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
