import { getSessionCookies } from '@/core/auth/cookies';
import { getValidatedStoredAccounts } from '@/core/auth/session';
import { getAppDisplayName, buildAuthQuery, getServerAuthContext, buildAuthPath, buildAuthCallbackWithStatus, getServerFlowParams } from '@/core/auth/callback';
import prisma from '@/core/helpers/prisma';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { getUserProfile } from '@/services/user';
import { validateExternalRequest } from '@/services/auth/validate';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';
import { applicationPartyValues, type ApplicationParty } from '@/services/applications/types';
import { verifyAccountToken } from '@/core/auth/accountToken';
import { validateAuthSession } from '@/services/auth/session';

const EXTERNAL_LOGIN_PREFIX = 'external_app:';
function externalLoginType(appId: string) {
	return `${EXTERNAL_LOGIN_PREFIX}${appId}`;
}

/**
 * Type AuthSignStep.
 */
export type AuthSignStep = 'profile' | 'access' | 'terms';

export const authSignStepOrder: AuthSignStep[] = ['profile', 'access', 'terms'];

const accessLabelMap: Record<string, string> = {
	neupid: 'NeupID',
	firstName: 'First name',
	lastName: 'Last name',
	middleName: 'Middle name',
	displayName: 'Display name',
	dateBirth: 'Date of birth',
	age: 'Age',
	isMinor: 'Minor status',
	gender: 'Gender',
	name: 'Name',
	email: 'Email',
	phone: 'Phone',
};


/**
 * Type AuthSignContext.
 */
export type AuthSignContext = ReturnType<typeof getServerAuthContext>;


/**
 * Type AuthSignPageData.
 */
export type AuthSignPageData = {
	redirectTo?: string;
	context: AuthSignContext;
	step: AuthSignStep;
	displayAppName: string;
	appIcon: string | null;
	userDisplayName: string;
	hasActiveSession: boolean;
	startPageUrl: string;
	denyUrl: string;
	cancelUrl: string;
	continueUrl: string;
	stepTitleMap: Record<AuthSignStep, string>;
	accessItems: string[];
	policies: Array<{ name: string; policy: string }>;
	termsText: string;
	profileNextUrl: string;
	accessNextUrl: string;
	accessBackUrl: string;
	termsBackUrl: string;
	hasBuilderData: boolean;
	application: {
		id: string;
		name: string;
		description: string | null;
		website: string | null;
		access: unknown;
		policies: unknown;
	} | null;
};


/**
 * Function getFirst.
 */
function getFirst(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0] ?? undefined;
	}

	return value;
}


/**
 * Function getStep.
 */
function getStep(value: string | string[] | undefined): AuthSignStep {
	const first = getFirst(value);
	if (first === 'access' || first === 'terms' || first === 'profile') {
		return first;
	}

	return 'profile';
}


/**
 * Function buildSignUrl.
 */
function buildSignUrl(
	context: AuthSignContext,
	step: AuthSignStep,
	extra: Record<string, string> = {}
): string {
	const params = new URLSearchParams(buildAuthQuery(context));
	params.set('step', step);

	for (const [key, value] of Object.entries(extra)) {
		params.set(key, value);
	}

	const query = params.toString();
	return query ? `/auth/sign?${query}` : '/auth/sign';
}


/**
 * Function normalizeAccess.
 */
function normalizeAccess(access: unknown): string[] {
	if (!Array.isArray(access)) {
		return ['Name', 'Email', 'NeupID', 'Phone'];
	}

	const values = access
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => accessLabelMap[entry] || entry)
		.filter((entry) => entry.trim().length > 0);

	return values.length > 0 ? values : ['Name', 'Email', 'NeupID', 'Phone'];
}


/**
 * Function normalizePolicies.
 */
function normalizePolicies(policies: unknown): Array<{ name: string; policy: string }> {
	if (!Array.isArray(policies)) {
		return [];
	}

	return policies
		.map((policy) => {
			if (!policy || typeof policy !== 'object') {
				return null;
			}

			const record = policy as Record<string, unknown>;
			const name = typeof record.policyType === 'string' ? record.policyType : typeof record.name === 'string' ? record.name : '';
			const value = record.policyValue ?? record.policy;
			const policyText = typeof value === 'string' ? value : JSON.stringify(value);

			if (!name || !policyText || !policyText.trim()) {
				return null;
			}

			return { name, policy: policyText.trim() };
		})
		.filter((entry): entry is { name: string; policy: string } => entry !== null);
}


/**
 * Function getTermsText.
 */
function getTermsText(policies: unknown): string {
	if (!Array.isArray(policies)) {
		return 'By continuing, you agree to this application\'s terms and data usage rules.';
	}

	const termsEntry = policies.find((policy) => {
		if (!policy || typeof policy !== 'object') {
			return false;
		}

		const record = policy as Record<string, unknown>;
		const name = typeof record.name === 'string' ? record.name.toLowerCase() : '';
		return name.includes('terms');
	});

	if (!termsEntry || typeof termsEntry !== 'object') {
		return 'By continuing, you agree to this application\'s terms and data usage rules.';
	}

	const record = termsEntry as Record<string, unknown>;
	const policyText = typeof record.policy === 'string' ? record.policy.trim() : '';
	return policyText.length > 0
		? policyText
		: 'By continuing, you agree to this application\'s terms and data usage rules.';
}


/**
 * Function getAuthSignPageData.
 */
export async function getAuthSignPageData(
	searchParams: Record<string, string | string[] | undefined>
): Promise<AuthSignPageData> {
	const context = getServerAuthContext(searchParams);
	const step = getStep(searchParams.step);

	const application = context.appId
		? await prisma.application.findUnique({
				where: { id: context.appId },
				select: {
					id: true,
					name: true,
					description: true,
					website: true,
					icon: true,
					responseFields: true,
					policies: true,
				},
		  })
		: null;

	const applicationData = application
		? {
			id: application.id,
			name: application.name,
			description: application.description,
			website: application.website,
			access: normalizeAccess(application.responseFields),
			policies: normalizePolicies(application.policies),
		}
		: null;

	const displayAppName = getAppDisplayName(applicationData?.name);
	const appIcon = application?.icon ?? null;

	const storedAccounts = await getValidatedStoredAccounts();
	const { accountId, sessionId, sessionKey } = await getSessionCookies();
	const hasActiveSession = Boolean(accountId && sessionId && sessionKey);

	// Resolve the signed-in user's display name
	let userDisplayName = 'there';
	if (hasActiveSession && accountId) {
		const profile = await getUserProfile(accountId);
		userDisplayName = profile?.nameDisplay
			|| (profile?.nameFirst ? profile.nameFirst : null)
			|| 'there';
	}

	// If user is not signed in and authenticatesTo exists, redirect to signin with backsTo parameter
	if (!hasActiveSession && context.authenticatesTo && context.appId) {
		// Extract steps parameter if it exists
		const stepsParam = getFirst(searchParams.steps);

		// Build the current sign URL with all parameters
		const signUrlParams = new URLSearchParams();
		signUrlParams.set('authenticatesTo', context.authenticatesTo);
		signUrlParams.set('appId', context.appId);
		if (stepsParam) {
			signUrlParams.set('steps', stepsParam);
		}
		const backsToUrl = `/auth/sign?${signUrlParams.toString()}`;

		// Build signin URL with backsTo parameter
		const signinUrl = new URLSearchParams();
		signinUrl.set('backsTo', backsToUrl);
		signinUrl.set('authenticatesTo', context.authenticatesTo);
		signinUrl.set('appId', context.appId);
		if (stepsParam) {
			signinUrl.set('steps', stepsParam);
		}

		return {
			redirectTo: `/auth/signin?${signinUrl.toString()}`,
			context,
			step,
			displayAppName,
			appIcon,
			userDisplayName,
			hasActiveSession,
			startPageUrl: '/auth/start',
			denyUrl: '/auth/start',
			cancelUrl: '/auth/start',
			continueUrl: '/auth/start',
			stepTitleMap: { profile: 'Profile', access: 'Access', terms: 'Terms' },
			accessItems: ['Name', 'Email', 'NeupID', 'Phone'],
			policies: [],
			termsText: 'By continuing, you agree to this application\'s terms and data usage rules.',
			profileNextUrl: '/auth/start',
			accessNextUrl: '/auth/start',
			accessBackUrl: '/auth/start',
			termsBackUrl: '/auth/start',
			hasBuilderData: false,
			application: applicationData,
		};
	}

	const skipAccountCheck = getFirst(searchParams.skipAccountCheck) === '1';
	if (storedAccounts.length >= 2 && !skipAccountCheck) {
		const query = buildAuthQuery(context);
		const returnTo = buildSignUrl(context, step, { skipAccountCheck: '1' });
		const startParams = new URLSearchParams(query);
		startParams.set('redirects', returnTo);
		return {
			redirectTo: `/auth/start?${startParams.toString()}`,
			context,
			step,
			displayAppName,
			appIcon,
			userDisplayName,
			hasActiveSession,
			startPageUrl: '/auth/start',
			denyUrl: '/auth/start',
			cancelUrl: '/auth/start',
			continueUrl: '/auth/start',
			stepTitleMap: { profile: 'Profile', access: 'Access', terms: 'Terms' },
			accessItems: ['Name', 'Email', 'NeupID', 'Phone'],
			policies: [],
			termsText: 'By continuing, you agree to this application\'s terms and data usage rules.',
			profileNextUrl: '/auth/start',
			accessNextUrl: '/auth/start',
			accessBackUrl: '/auth/start',
			termsBackUrl: '/auth/start',
			hasBuilderData: false,
			application: applicationData,
		};
	}

	if (!context.appId || !context.authenticatesTo) {
		return {
			redirectTo: '/auth/start',
			context,
			step,
			displayAppName,
			appIcon,
			userDisplayName,
			hasActiveSession,
			startPageUrl: '/auth/start',
			denyUrl: '/auth/start',
			cancelUrl: '/auth/start',
			continueUrl: '/auth/start',
			stepTitleMap: { profile: 'Profile', access: 'Access', terms: 'Terms' },
			accessItems: ['Name', 'Email', 'NeupID', 'Phone'],
			policies: [],
			termsText: 'By continuing, you agree to this application\'s terms and data usage rules.',
			profileNextUrl: '/auth/start',
			accessNextUrl: '/auth/start',
			accessBackUrl: '/auth/start',
			termsBackUrl: '/auth/start',
			hasBuilderData: false,
			application: applicationData,
		};
	}

	const callbackQuery = buildAuthQuery(context);
	const startPageUrl = callbackQuery ? `/auth/start?${callbackQuery}` : '/auth/start';
	const denyUrl = buildAuthCallbackWithStatus(context, 'denied');
	const cancelUrl = buildAuthCallbackWithStatus(context, 'cancelled');
	const continueUrl = buildAuthCallbackWithStatus(context, 'allowed');

	const stepTitleMap: Record<AuthSignStep, string> = {
		profile: 'Profile',
		access: 'Access',
		terms: 'Terms',
	};

	const accessItems = normalizeAccess(applicationData?.access);
	const policies = normalizePolicies(applicationData?.policies) as Array<{ name: string; policy: string }>;
	const termsText = getTermsText(applicationData?.policies);

	const profileNextUrl = buildSignUrl(context, 'access');
	const accessNextUrl = buildSignUrl(context, 'terms');
	const accessBackUrl = buildSignUrl(context, 'profile');
	const termsBackUrl = buildSignUrl(context, 'access');

	const hasBuilderData = Boolean(
			applicationData?.description?.trim() ||
				applicationData?.website?.trim() ||
				Array.isArray(applicationData?.access) ||
				Array.isArray(applicationData?.policies)
	);

	return {
		context,
		step,
		displayAppName,
		appIcon,
		userDisplayName,
		hasActiveSession,
		startPageUrl,
		denyUrl,
		cancelUrl,
		continueUrl,
		stepTitleMap,
		accessItems,
		policies,
		termsText,
		profileNextUrl,
		accessNextUrl,
		accessBackUrl,
		termsBackUrl,
		hasBuilderData,
		application: applicationData,
	};
}


/**
 * Function bridgeSignIntoApplication.
 */
export async function bridgeSignIntoApplication(input: { appId?: string; appType?: string; [key: string]: any }): Promise<{ status: number; body: Record<string, any> }> {
	try {
		const appId = input?.appId;
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

			const defaultRoleId = await getApplicationDefaultRoleId(appId);
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

export async function bridgeConnectionSignAndGet(input: {
  appId?: string;
  appSecret?: string;
  authAccountToken?: string;
  [key: string]: any;
}): Promise<{ status: number; body: Record<string, any> }> {
  try {
    const appId = input?.appId;
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

    const defaultRoleId = await getApplicationDefaultRoleId(appId);
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

    const profile = await getUserProfile(accountId);
    if (!profile) {
      return { status: 404, body: { success: false, error: 'User profile not found.' } };
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
