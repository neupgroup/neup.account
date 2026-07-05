import { getActiveSession } from '@/neup.core/auth/verify';
import { logError } from '@/neup.core/helpers/logger';
import prisma from '@/neup.core/helpers/prisma';
import crypto from 'crypto';

/**
 * Function bridgeBuildGrantRedirect.
 */
export async function bridgeBuildGrantRedirect(input: {
  requestUrl: string;
  pathname: string;
  searchParams: URLSearchParams;
}): Promise<{ redirectTo: string }> {
  const { requestUrl, pathname, searchParams } = input;
  const authenticatesTo = searchParams.get('authenticatesTo');
  const appId = searchParams.get('app');

  if (!authenticatesTo) {
    const errorUrl = new URL('/auth/start', requestUrl);
    errorUrl.searchParams.set('error', 'invalid_request');
    return { redirectTo: errorUrl.toString() };
  }

  // Do not accept legacy appId query param — use `app`.
  if (searchParams.has('appId')) {
    const errorUrl = new URL('/auth/start', requestUrl);
    errorUrl.searchParams.set('error', 'invalid_request');
    errorUrl.searchParams.set('error_description', 'Use ?app=... instead of ?appId=...');
    return { redirectTo: errorUrl.toString() };
  }

  if (!appId) {
    const errorUrl = new URL('/auth/start', requestUrl);
    errorUrl.searchParams.set('error', 'missing_app');
    return { redirectTo: errorUrl.toString() };
  }

  // Validate authenticatesTo is a valid URL
  let authenticatesToUrl: URL;
  try {
    authenticatesToUrl = new URL(authenticatesTo);
  } catch {
    const errorUrl = new URL('/auth/start', requestUrl);
    errorUrl.searchParams.set('error', 'invalid_redirect');
    return { redirectTo: errorUrl.toString() };
  }

  const finalRedirectUrl = new URL(authenticatesTo);
  searchParams.forEach((value, key) => {
    if (key !== 'authenticatesTo' && key !== 'app') {
      finalRedirectUrl.searchParams.set(key, value);
    }
  });

  try {
    const application = await prisma.application.findUnique({ where: { id: appId } });

    if (!application || !application.appSecret) {
      finalRedirectUrl.searchParams.set('error', 'invalid_app');
      return { redirectTo: finalRedirectUrl.toString() };
    }

    // Check if authenticatesTo exists in the database
    const authenticatesToRecord = await prisma.applicationBridge.findFirst({
      where: {
        appId,
        type: 'authenticatesTo',
        value: authenticatesTo,
      },
    });

    if (!authenticatesToRecord) {
      finalRedirectUrl.searchParams.set('error', 'invalid_redirect');
      return { redirectTo: finalRedirectUrl.toString() };
    }

    const session = await getActiveSession();

    if (!session) {
      // When user is not signed in, redirect to /auth/sign with authenticatesTo and appId
      // /auth/sign will then redirect to signin/signup with backsTo parameter
      const signPageUrl = new URL('/auth/sign', requestUrl);
      signPageUrl.searchParams.set('authenticatesTo', authenticatesTo);
      signPageUrl.searchParams.set('app', appId);
      return { redirectTo: signPageUrl.toString() };
    }

    const tempToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    await prisma.authnRequest.create({
      data: {
        id: tempToken,
        type: 'bridge_grant',
        status: 'pending',
        data: { appId },
        accountId: session.accountId,
        expiresAt,
      },
    });

    const existingConnection = await prisma.connection.findUnique({
      where: {
        accountId_appId: {
          accountId: session.accountId,
          appId,
        },
      },
      select: { id: true },
    });

    const authType = existingConnection ? 'signin' : 'signup';

    finalRedirectUrl.searchParams.set('tempToken', tempToken);
    finalRedirectUrl.searchParams.set('authType', authType);

    return { redirectTo: finalRedirectUrl.toString() };
  } catch (error) {
    await logError('database', error, 'bridge_build_grant_redirect');
    finalRedirectUrl.searchParams.set('error', 'internal_server_error');
    return { redirectTo: finalRedirectUrl.toString() };
  }
}
