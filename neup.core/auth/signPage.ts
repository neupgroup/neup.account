import { getSessionCookies } from '@/neup.core/auth/cookies';
import { getValidatedStoredAccounts } from '@/neup.core/auth/session';
import { getAppDisplayName, buildAuthQuery, getServerAuthContext, buildAuthPath, buildAuthCallbackWithStatus, getServerFlowParams } from '@/neup.core/auth/callback';
import prisma from '@/neup.core/helpers/prisma';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { getUserProfile } from '@/services/user';
import { validateExternalRequest } from '@/services/auth/validate';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';
import { applicationPartyValues, type ApplicationParty } from '@/services/applications/types';
import { verifyAccountToken } from '@/neup.core/auth/accountToken';
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
