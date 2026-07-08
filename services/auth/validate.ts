'use server';

import prisma from '@/core/helpers/prisma';
import { z } from 'zod';
import { getUserProfile, getUserNeupIds } from '@/services/user';

const ValidateInputSchema = z.object({
  appId: z.string().min(1),
  appType: z.enum(['internal', 'external', 'fast']).optional(),
  // External Auth Params
  appSecret: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  // Internal/Fast Auth Params
  auth_aid: z.string().min(1).optional(),
  auth_sid: z.string().min(1).optional(),
  auth_skey: z.string().min(1).optional(),
  signup: z.boolean().optional(),
});

/**
 * Type ValidateInput.
 */
export type ValidateInput = z.infer<typeof ValidateInputSchema>;


/**
 * Type ValidateResult.
 */
export type ValidateResult =
  | {
      success: true;
      user: {
        accountId: string;
        displayName: string;
        neupId: string | null;
      };
      signup?: boolean;
    }
  | {
      success: false;
      error: string;
      status?: number;
    };


/**
 * Function validateExternalRequest.
 */
export async function validateExternalRequest(input: ValidateInput): Promise<ValidateResult> {
  const parsed = ValidateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Missing required parameters.', status: 400 };
  }
  const { 
    appId, 
    appType, 
    appSecret, 
    key, 
    accountId, 
    auth_aid,
    auth_sid,
    auth_skey,
    signup
  } = parsed.data;

  const internalAid = auth_aid;
  const internalSid = auth_sid;
  const internalSkey = auth_skey;

  // 1. App Validation
  const app = await prisma.application.findUnique({
    where: { id: appId }
  });

  if (!app) {
    return { success: false, error: 'Invalid application ID.', status: 404 };
  }

  // 2. Handle Internal or Fast Application Validation
  if (appType === 'internal' || appType === 'fast') {
    if (!internalAid || !internalSid || !internalSkey) {
      return { success: false, error: 'Missing authentication parameters.', status: 400 };
    }

    const session = await prisma.authnSession.findUnique({
      where: { id: internalSid },
    });

    if (
      !session ||
      session.accountId !== internalAid ||
      session.key !== internalSkey ||
      !session.validTill ||
      session.validTill < new Date()
    ) {
      return { success: false, error: 'Invalid or expired session.', status: 401 };
    }

    // Fast check: return only success if appType is 'fast'
    if (appType === 'fast') {
      return {
        success: true,
        user: {
          accountId: internalAid,
          displayName: '', // Not needed for fast check
          neupId: null,    // Not needed for fast check
        },
        signup,
      };
    }

    const [userProfile, userNeupIds] = await Promise.all([
      getUserProfile(internalAid), 
      getUserNeupIds(internalAid)
    ]);

    if (!userProfile) {
      return { success: false, error: 'Could not retrieve user profile.', status: 500 };
    }

    return {
      success: true,
      user: {
        accountId: internalAid,
        displayName: userProfile?.nameDisplay || `${userProfile?.nameFirst || ''} ${userProfile?.nameLast || ''} `.trim(),
        neupId: userNeupIds[0] || null,
      },
      signup,
    };
  }

  // 3. Handle External Application Validation (Default)
  if (!appSecret || !key || !accountId) {
    return { success: false, error: 'Missing external authentication parameters.', status: 400 };
  }

  if (app.appSecret !== appSecret) {
    return { success: false, error: 'Invalid application secret.', status: 401 };
  }

  const request = await prisma.authnRequest.findUnique({
    where: { id: key },
    select: { id: true, type: true, status: true, data: true, accountId: true, expiresAt: true },
  });
  const requestData = (request?.data as Record<string, any> | null) || {};
  const requestAppId = typeof requestData.appId === 'string' ? requestData.appId : null;

  if (
    !request ||
    request.type !== 'bridge_grant' ||
    request.status !== 'pending' ||
    request.expiresAt <= new Date() ||
    request.accountId !== accountId ||
    requestAppId !== appId
  ) {
    return { success: false, error: 'Invalid or expired key.', status: 403 };
  }

  await prisma.authnRequest.update({
    where: { id: key },
    data: { status: 'used' },
  });

  const [userProfile, userNeupIds] = await Promise.all([getUserProfile(accountId), getUserNeupIds(accountId)]);
  if (!userProfile) {
    return { success: false, error: 'Could not retrieve user profile.', status: 500 };
  }

  return {
    success: true,
    user: {
      accountId,
      displayName: userProfile?.nameDisplay || `${userProfile?.nameFirst || ''} ${userProfile?.nameLast || ''}`.trim(),
      neupId: userNeupIds[0] || null,
    },
    signup,
  };
}
