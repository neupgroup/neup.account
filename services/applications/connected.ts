'use server';

// Handles applications the user has connected to or signed into.

import prisma from '@/core/helpers/prisma';
import { getPersonalAccountId } from '@/services/account/verify';
import { logError } from '@/logica/logger/files';
import type { Application } from '@/services/applications/types';

type ConnectedApplications = {
    firstParty: Application[];
    thirdParty: Application[];
};

type SignedApplication = {
  id: string;
  name: string;
  slug?: string;
  icon?: string;
  description: string;
  website?: string;
  signedAt: Date;
};

type SignedApplicationsResult = {
  internal: SignedApplication[];
  external: SignedApplication[];
};

function isInternalApp(appId: string): boolean {
  return appId.startsWith('neup.');
}

// Returns applications the user is connected to, split by first/third party.
export async function getConnectedApplications(): Promise<ConnectedApplications> {
    const accountId = await getPersonalAccountId();
    if (!accountId) return { firstParty: [], thirdParty: [] };

    try {
        const connections = await prisma.connection.findMany({
            where: { accountId },
            select: {
              connectedAt: true,
              application: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  icon: true,
                  website: true,
                  isInternal: true,
                },
              },
            },
        });

        const allApps: Application[] = connections.map((conn: any) => ({
          id: conn.application.id,
          name: conn.application.name,
          party: conn.application.isInternal ? 'first' : 'third',
          description: conn.application.description || '',
          icon: conn.application.icon as any || undefined,
          website: conn.application.website || undefined,
        }));

        return {
            firstParty: allApps.filter(app => app.party === 'first'),
            thirdParty: allApps.filter(app => app.party === 'third'),
        };
    } catch (error) {
        await logError('database', error, 'getConnectedApplications');
        return { firstParty: [], thirdParty: [] };
    }
}

// Returns details for a single application by ID.
export async function getApplicationDetails(appId: string): Promise<Application | null> {
    try {
        const app = await prisma.application.findUnique({ where: { id: appId } });
        if (app) {
          return {
            id: app.id,
            name: app.name,
            party: app.isInternal ? 'first' : 'third',
            description: app.description || '',
            icon: app.icon as any || undefined,
            website: (app as any).website || undefined,
          } as Application;
        }
        return null;
    } catch (error) {
        await logError('database', error, `getApplicationDetails: ${appId}`);
        return null;
    }
}

// Returns all applications the user has signed into, split by internal/external.
export async function getSignedApplications(): Promise<SignedApplicationsResult> {
  const accountId = await getPersonalAccountId();
  if (!accountId) return { internal: [], external: [] };

  try {
    const connections = await prisma.connection.findMany({
      where: { accountId },
      select: {
        connectedAt: true,
        application: {
          select: {
            id: true,
            name: true,
            description: true,
            icon: true,
            website: true,
          },
        },
      },
      orderBy: { connectedAt: 'desc' },
    });

    const resolved = connections
      .map((conn) => ({
        id: conn.application.id,
        name: conn.application.name,
        icon: conn.application.icon || undefined,
        description: conn.application.description || '',
        website: conn.application.website || undefined,
        signedAt: conn.connectedAt,
      }))
      .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime());

    return {
      internal: resolved.filter((app) => isInternalApp(app.id)),
      external: resolved.filter((app) => !isInternalApp(app.id)),
    };
  } catch (error) {
    await logError('database', error, 'getSignedApplications');
    return { internal: [], external: [] };
  }
}
