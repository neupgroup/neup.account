'use server';

import prisma from '@/core/database/prisma';
import { logError } from '@/logica/logger/files';
import { roleMatchesAssignmentModesPolicy } from '@/services/applications/authz-scope-policy';

type GetApplicationDefaultRoleIdOptions = {
  accountType?: string | null;
};

export async function getApplicationDefaultRoleId(
  appId: string,
  options: GetApplicationDefaultRoleIdOptions = {},
): Promise<string | null> {
  try {
    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: {
        defaultRoleId: true,
        defaultRole: {
          select: {
            scopeFor: true,
            scopeLevel: true,
          },
        },
      },
    });

    if (!app?.defaultRoleId) return null;

    if (options.accountType === undefined) {
      return app.defaultRoleId;
    }

    if (!app.defaultRole) return null;

    return roleMatchesAssignmentModesPolicy({
      accountType: options.accountType,
      scopeFor: app.defaultRole.scopeFor,
      scopeLevel: app.defaultRole.scopeLevel,
      modes: ['manageable', 'public', 'toApprove'],
    })
      ? app.defaultRoleId
      : null;
  } catch (error) {
    await logError('database', error, `getApplicationDefaultRoleId:${appId}`);
    return null;
  }
}
