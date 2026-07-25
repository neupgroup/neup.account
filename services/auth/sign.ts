import prisma from '@/core/database/prisma';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { getUserProfile } from '@/services/user';
import { validateExternalRequest } from '@/services/auth/validate';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';
import { applicationPartyValues, type ApplicationParty } from '@/services/applications/types';
import { verifyAccountToken } from '@/services/auth/account-token';
import { validateAuthSession } from '@/services/auth/session';
import { normalizeApplicationId } from '@/services/applications/identifiers';

/*
::neup.documentation::sign-service
::title Application Sign Service

Application sign-in helpers used by bridge auth routes.

::public

This file owns application-specific sign-in responses and the `sign&get` flow used by trusted applications.

::public end

::private

Route files own the HTTP contract. This file owns app validation, connection creation, response shaping, and token issuance for these flows.

::private end

::end
*/

const EXTERNAL_LOGIN_PREFIX = 'external_app:';
function externalLoginType(appId: string) {
	return `${EXTERNAL_LOGIN_PREFIX}${appId}`;
}

/*
::neup.documentation::bridge-sign-into-application
::function bridgeSignIntoApplication(input)

Signs a validated account into an application context.

::public

Returns application-facing identity data and, for external apps, creates an app-scoped session value.

::public end

::private

The function validates the upstream request, ensures the application connection exists, and conditionally creates an external app session for `appType === external`.

::private end

::end
*/
export async function bridgeSignIntoApplication(input: { appId?: string; appType?: string; [key: string]: any }): Promise<{ status: number; body: Record<string, any> }> {
	try {
		const appId = normalizeApplicationId(input?.appId);
		const appType = input?.appType;

		if (!appId) {
			return { status: 400, body: { success: false, error: 'appId is required.' } };
		}

		const validation = await validateExternalRequest(input as any);
		if (!validation.success) {
			return { status: validation.status ?? 401, body: { success: false, error: validation.error } };
		}

		const { accountId } = validation.user;

		const existingExternal = await prisma.connection.findUnique({
			where: {
				accountId_appId: {
					accountId,
					appId,
				},
			},
			select: { id: true },
		});

		const isNewSignup = !existingExternal;

		const profile = await getUserProfile(accountId);
		if (!profile) {
			return { status: 404, body: { success: false, error: 'User profile not found.' } };
		}

		const responseData: Record<string, any> = {
			success: true,
			accountId,
			displayName: profile.nameDisplay || `${profile.nameFirst || ''} ${profile.nameLast || ''}`.trim(),
			displayImage: profile.accountPhoto || '',
			isNewSignup,
		};

		if (appType === 'external') {
			const authSid = input?.auth_sid || input?.auth_session_id;
			if (!authSid) {
				return { status: 400, body: { success: false, error: 'auth_sid is required for external apps.' } };
			}

			const sessionValue = randomBytes(32).toString('hex');
			const activeTill = new Date();
			activeTill.setDate(activeTill.getDate() + 30);

			const defaultRoleId = await getApplicationDefaultRoleId(appId, { accountType: profile.accountType });
			await prisma.connection.upsert({
				where: {
					accountId_appId: {
						accountId,
						appId,
					},
				},
				update: {},
				create: { accountId, appId, roleId: defaultRoleId },
			});

						await prisma.authnSession.create({
				data: {
					accountId,
					ipAddress: 'Unknown IP',
					userAgent: 'External Application',
					lastLoggedIn: new Date(),
					loginType: externalLoginType(appId),
					validTill: activeTill,
					key: sessionValue,
				},
			});

			responseData.sessionValue = sessionValue;
			responseData.activeTill = activeTill.toISOString();
		}

		return { status: 200, body: responseData };
	} catch {
		return { status: 500, body: { success: false, error: 'Internal server error.' } };
	}
}

/*
::neup.documentation::bridge-connection-sign-and-get
::function bridgeConnectionSignAndGet(input)

Returns a trusted-app sign-and-get response for an authenticated account.

::public

This flow validates the `auth_account` cookie session, ensures the target application connection exists, and returns only the configured response fields plus an app token.

::public end

::private

The response shape is driven by `Application.responseFields`, and token signing uses the target application's secret.

::private end

::end
*/
export async function bridgeConnectionSignAndGet(input: {
  appId?: string;
  appSecret?: string;
  authAccountToken?: string;
  [key: string]: any;
}): Promise<{ status: number; body: Record<string, any> }> {
  try {
    const appId = normalizeApplicationId(input?.appId);
    const appSecret = input?.appSecret?.trim();
    const authAccountToken = input?.authAccountToken?.trim();
    if (!appId) {
      return { status: 400, body: { success: false, error: 'appId is required.' } };
    }
    if (!appSecret) {
      return { status: 400, body: { success: false, error: 'appSecret is required.' } };
    }
    if (!authAccountToken) {
      return { status: 401, body: { success: false, error: 'auth_account cookie is required.' } };
    }

    const cookiePayload = await verifyAccountToken(authAccountToken);
    if (!cookiePayload?.aid || !cookiePayload?.sid || !cookiePayload?.skey) {
      return { status: 401, body: { success: false, error: 'Invalid auth_account cookie.' } };
    }
    const sessionValidation = await validateAuthSession({
      aid: cookiePayload.aid,
      sid: cookiePayload.sid,
      skey: cookiePayload.skey,
    });
    if (sessionValidation.status !== 'valid') {
      return { status: 401, body: { success: false, error: 'Invalid or expired signin session.' } };
    }
    const accountId = cookiePayload.aid;

    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { id: true, name: true, party: true, status: true, appSecret: true, responseFields: true },
    });
    if (!application) {
      return { status: 404, body: { success: false, error: 'Invalid application ID.' } };
    }

    if (application.status === 'blocked' || application.status === 'rejected') {
      return { status: 403, body: { success: false, error: 'Application is not active.' } };
    }
    if (!application.appSecret || application.appSecret !== appSecret) {
      return { status: 401, body: { success: false, error: 'Invalid app secret.' } };
    }

    const party = applicationPartyValues.includes(application.party as ApplicationParty)
      ? (application.party as ApplicationParty)
      : 1;
    if (!(party === 0 || party === 1)) {
      return { status: 403, body: { success: false, error: 'You do not have permission to access this endpoint.' } };
    }

    const profile = await getUserProfile(accountId);
    if (!profile) {
      return { status: 404, body: { success: false, error: 'User profile not found.' } };
    }

    const defaultRoleId = await getApplicationDefaultRoleId(appId, { accountType: profile.accountType });
    const connection = await prisma.connection.upsert({
      where: { accountId_appId: { accountId, appId } },
      update: {},
      create: { accountId, appId, status: 'active', roleId: defaultRoleId },
      select: {
        id: true,
        status: true,
        connectedAt: true,
        roleId: true,
        role: { select: { id: true, name: true } },
      },
    });

    if (connection.status !== 'active') {
      return {
        status: 403,
        body: { success: false, error: `connection_${connection.status}` },
      };
    }

    const selectedFields = new Set(
      (Array.isArray(application.responseFields) ? application.responseFields : [])
        .filter((f): f is string => typeof f === 'string')
    );

    const neupId = profile.neupIdPrimary || null;
    const birthDate = profile.dateBirth ? new Date(profile.dateBirth) : null;
    const now = new Date();
    const isMinor = birthDate
      ? (() => {
          let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
          const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
          if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) age -= 1;
          return age < 18;
        })()
      : undefined;

    const lastSession = await prisma.authnSession.findFirst({
      where: { accountId },
      orderBy: { lastLoggedIn: 'desc' },
      select: { lastLoggedIn: true },
    });

    const accountPayload: Record<string, unknown> = {
      connectionId: connection.id,
    };
    if (selectedFields.has('accountId')) {
      accountPayload.id = accountId;
    }
    if (selectedFields.has('neupid') && neupId) {
      accountPayload.neupid = neupId;
    }
    if (selectedFields.has('isMinor') && typeof isMinor === 'boolean') {
      accountPayload.isMinor = isMinor;
    }

    const profilePayload: Record<string, unknown> = {};
    const displayName = profile.nameDisplay || `${profile.nameFirst || ''} ${profile.nameLast || ''}`.trim();
    if (selectedFields.has('displayName') && displayName) profilePayload.displayName = displayName;
    if (selectedFields.has('displayImage') && profile.accountPhoto) profilePayload.displayImage = profile.accountPhoto;
    if (selectedFields.has('gender') && profile.gender) profilePayload.gender = profile.gender;
    if (selectedFields.has('dateBirth') && profile.dateBirth) profilePayload.birthDate = profile.dateBirth;
    if (selectedFields.has('lastActive') && lastSession?.lastLoggedIn) profilePayload.lastActive = lastSession.lastLoggedIn.toISOString();

    const rolePayload =
      selectedFields.has('role') && (connection.role?.id || connection.roleId)
        ? {
            id: connection.role?.id || connection.roleId,
            name: connection.role?.name || connection.roleId || '',
          }
        : null;

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + (60 * 60 * 24 * 7);
    const tokenPayload: Record<string, unknown> = {
      connectionId: connection.id,
      iat,
      exp,
    };
    if (selectedFields.has('accountId')) {
      tokenPayload.accountId = accountId;
    }
    if (selectedFields.has('neupid') && neupId) {
      tokenPayload.neupid = neupId;
    }
    if (selectedFields.has('isMinor') && typeof isMinor === 'boolean') {
      tokenPayload.isMinor = isMinor;
    }
    if (selectedFields.has('role')) {
      if (connection.role?.id || connection.roleId) {
        tokenPayload.roleId = connection.role?.id || connection.roleId;
      }
      if (connection.role?.name || connection.roleId) {
        tokenPayload.roleName = connection.role?.name || connection.roleId;
      }
    }
    const token = jwt.sign(tokenPayload, application.appSecret, { algorithm: 'HS256' });

    const responseBody: Record<string, unknown> = {
      success: true,
      appId,
      occurredAt: new Date().toISOString(),
      account: accountPayload,
      token,
    };
    if (Object.keys(profilePayload).length > 0) {
      responseBody.profile = profilePayload;
    }
    if (rolePayload) {
      responseBody.role = rolePayload;
    }

    return { status: 200, body: responseBody };
  } catch {
    return { status: 500, body: { success: false, error: 'Internal server error.' } };
  }
}

// Looks up the display name of an application by its ID.
export async function getApplicationName(appId: string | null): Promise<string | null> {
  if (!appId) return null;
  const app = await prisma.application.findUnique({ where: { id: appId }, select: { name: true } });
  return app?.name ?? null;
}
