'use server';

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { assignOwnApplicationRole } from '@/services/applications/access';

/*
::neup.documentation::bridge-roles-enroll-service
::title Bridge Roles Enroll Service

Enrolls an account into a publicly-enrollable application role through the bridge API.

::public

This service validates the application secret, resolves the target account from either `accountId` or `connectionId`, and then delegates role enrollment to the shared application-access service.

::public end

::private

When an app secret matches multiple applications, the service rejects account-only requests instead of guessing. Supplying `connectionId` disambiguates the target application.

::private end

::end
*/

type BridgeRoleEnrollInput = {
  appSecret?: string | null;
  accountId?: string | null;
  connectionId?: string | null;
  roleId?: string | null;
};

type BridgeRoleEnrollResponse = {
  status: number;
  body: Record<string, unknown>;
};

function normalizeValue(input?: string | null): string | null {
  const value = input?.trim();
  return value ? value : null;
}

async function resolveApplicationFromSecret(
  appSecret: string,
): Promise<
  | { ok: true; appId: string; status: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const applications = await prisma.application.findMany({
    where: { appSecret },
    select: { id: true, status: true },
    take: 2,
  });

  if (applications.length === 0) {
    return {
      ok: false,
      status: 401,
      body: { success: false, error: 'invalid_app_secret' },
    };
  }

  if (applications.length > 1) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: 'ambiguous_app_secret',
        error_description: 'This appSecret matches multiple applications. Supply connectionId to disambiguate.',
      },
    };
  }

  return {
    ok: true,
    appId: applications[0].id,
    status: applications[0].status,
  };
}

function mapAssignmentErrorToStatus(error: string): number {
  const normalized = error.toLowerCase();
  if (normalized.includes('not found')) return 404;
  if (normalized.includes('cannot be requested')) return 403;
  if (normalized.includes('failed')) return 500;
  return 400;
}

export async function bridgeEnrollPublicRole(input: BridgeRoleEnrollInput): Promise<BridgeRoleEnrollResponse> {
  const appSecret = normalizeValue(input.appSecret);
  const accountIdInput = normalizeValue(input.accountId);
  const connectionId = normalizeValue(input.connectionId);
  const roleId = normalizeValue(input.roleId);

  if (!appSecret || !roleId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: 'appSecret and roleId are required.',
      },
    };
  }

  if (!accountIdInput && !connectionId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: 'Either accountId or connectionId is required.',
      },
    };
  }

  try {
    let appId: string;
    let applicationStatus: string;
    let accountId: string;

    if (connectionId) {
      const connection = await prisma.connection.findUnique({
        where: { id: connectionId },
        select: {
          id: true,
          accountId: true,
          appId: true,
          application: {
            select: { appSecret: true, status: true },
          },
        },
      });

      if (!connection) {
        return {
          status: 404,
          body: { success: false, error: 'connection_not_found' },
        };
      }

      if (!connection.application.appSecret || connection.application.appSecret !== appSecret) {
        return {
          status: 401,
          body: { success: false, error: 'invalid_app_secret' },
        };
      }

      if (accountIdInput && accountIdInput !== connection.accountId) {
        return {
          status: 409,
          body: {
            success: false,
            error: 'account_connection_mismatch',
            error_description: 'accountId does not match the supplied connectionId.',
          },
        };
      }

      appId = connection.appId;
      applicationStatus = connection.application.status;
      accountId = connection.accountId;
    } else {
      const resolvedApplication = await resolveApplicationFromSecret(appSecret);
      if (!resolvedApplication.ok) {
        return {
          status: resolvedApplication.status,
          body: resolvedApplication.body,
        };
      }

      appId = resolvedApplication.appId;
      applicationStatus = resolvedApplication.status;
      accountId = accountIdInput!;
    }

    if (applicationStatus === 'blocked' || applicationStatus === 'rejected') {
      return {
        status: 403,
        body: { success: false, error: 'application_not_active' },
      };
    }

    const result = await assignOwnApplicationRole({
      accountId,
      appId,
      roleReference: roleId,
      requestSource: 'bridge.api.v1.roles.enroll',
    });

    if (!result.success) {
      return {
        status: mapAssignmentErrorToStatus(result.error),
        body: { success: false, error: result.error },
      };
    }

    const connection = await prisma.connection.findUnique({
      where: { accountId_appId: { accountId, appId } },
      select: { id: true },
    });

    if (result.mode === 'assigned') {
      return {
        status: 200,
        body: {
          success: true,
          mode: result.mode,
          appId,
          accountId,
          connectionId: connection?.id ?? connectionId,
          roleId: result.roleId,
          roleName: result.roleName,
          roleScope: result.scope,
        },
      };
    }

    return {
      status: 202,
      body: {
        success: true,
        mode: result.mode,
        appId,
        accountId,
        connectionId: connection?.id ?? connectionId,
        roleId: result.roleId,
        roleName: result.roleName,
        roleScope: result.scope,
        requestId: result.requestId,
      },
    };
  } catch (error) {
    await logError(
      'auth',
      error,
      `bridgeEnrollPublicRole:${accountIdInput ?? 'unknown-account'}:${connectionId ?? 'no-connection'}:${roleId}`,
    );
    return {
      status: 500,
      body: { success: false, error: 'internal_server_error' },
    };
  }
}
