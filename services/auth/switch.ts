'use server';

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { checkPermissions } from '@/services/user';
import { getPersonalAccountId } from '@/core/auth/verify';
import { setManagingCookie, clearManagingCookie } from '@/core/helpers/cookies';
import { revalidatePath } from 'next/cache';

/**
 * Switch into any account the current user has been granted access to.
 * Sets auth_account_switch = memberId.
 */
export async function switchToAccount(memberId: string): Promise<{ success: boolean; error?: string }> {
  const personalAccountId = await getPersonalAccountId();
  if (!personalAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    // Verify a grant exists giving this user access to the target account
    const grant = await prisma.member.findFirst({
      where: {
        memberType: 'account',
        memberAccountId: personalAccountId,
        parentType: 'account',
        parentAccountId: memberId,
      },
      select: { id: true },
    });
    if (!grant) return { success: false, error: 'No access found for this account.' };

    await setManagingCookie(memberId);
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    await logError('auth', error, `switchToAccount:${memberId}`);
    return { success: false, error: 'Failed to switch account.' };
  }
}

/**
 * Switch into a brand account owned by the current user.
 * Sets auth_account_switch = brandId.
 */
export async function switchToBrand(brandId: string): Promise<{ success: boolean; error?: string }> {
  const canSwitch = await checkPermissions(['linked_accounts.brand.view']);
  if (!canSwitch) return { success: false, error: 'Permission denied.' };

  const personalAccountId = await getPersonalAccountId();
  if (!personalAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    const ownership = await prisma.member.findFirst({
      where: {
        memberType: 'account',
        memberAccountId: personalAccountId,
        parentType: 'account',
        parentAccountId: brandId,
        roles: {
          some: {
            roleId: 'brand-owner-neup-account',
            authzRole: { appId: 'neup.account' },
          },
        },
      },
      select: { id: true },
    });
    if (!ownership) return { success: false, error: 'Brand account not found or not owned by you.' };

    await setManagingCookie(brandId);
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    await logError('auth', error, `switchToBrand:${brandId}`);
    return { success: false, error: 'Failed to switch to brand account.' };
  }
}

/**
 * Switch into a dependent account owned by the current user.
 * Sets auth_account_switch = dependentId.
 */
export async function switchToDependent(dependentId: string): Promise<{ success: boolean; error?: string }> {
  const canSwitch = await checkPermissions(['linked_accounts.dependent.view']);
  if (!canSwitch) return { success: false, error: 'Permission denied.' };

  const personalAccountId = await getPersonalAccountId();
  if (!personalAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    const ownership = await prisma.member.findFirst({
      where: {
        memberType: 'account',
        memberAccountId: personalAccountId,
        parentType: 'account',
        parentAccountId: dependentId,
        roles: {
          some: {
            roleId: 'account.guardian',
            authzRole: { appId: 'neup.account' },
          },
        },
      },
      select: { id: true },
    });
    if (!ownership) return { success: false, error: 'Dependent account not found or not owned by you.' };

    await setManagingCookie(dependentId);
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    await logError('auth', error, `switchToDependent:${dependentId}`);
    return { success: false, error: 'Failed to switch to dependent account.' };
  }
}

/**
 * Switch back to the personal account by clearing auth_account_switch.
 */
export async function switchToPersonal(): Promise<void> {
  await clearManagingCookie();
  revalidatePath('/');
}
