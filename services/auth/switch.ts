'use server';

import { permission } from '@/.neup/logica/permission';
import prisma from '@/.neup/core/database/prisma';
import { logError } from '@/.neup/logica/logger/files';
import { checkPermissions } from '@/services/user';
import { getPersonalAccountId } from '@/services/account/verify';
import { revalidatePath } from 'next/cache';
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { cleanupExpiredAccessModel } from '@/services/access-model';
import { BRAND_OWNER_ROLE_ID } from '@/inapp/permissions/brand-roles';
import { ACCESS_ACCOUNTS_SWITCH_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';

const servicePermissions = [
  permission('access.accounts.switch.self', 'for_individual', 'service'),
];

/**
 * Validates access to any account the current user has been granted access to.
 * Selected-account state is URL-driven on the client.
 */
export async function switchToAccount(memberId: string): Promise<{ success: boolean; error?: string }> {
  await requireAnyPermission404([...ACCESS_ACCOUNTS_SWITCH_PERMISSIONS]);
  const canSwitch = await checkPermissions([...ACCESS_ACCOUNTS_SWITCH_PERMISSIONS]);
  if (!canSwitch) return { success: false, error: 'Permission denied.' };

  const personalAccountId = await getPersonalAccountId();
  if (!personalAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    await cleanupExpiredAccessModel();

    // Verify a grant exists giving this user access to the target account
    const grant = await prisma.access.findFirst({
      where: {
        memberAccountId: personalAccountId,
        parentAccountId: memberId,
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!grant) return { success: false, error: 'No access found for this account.' };

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    await logError('auth', error, `switchToAccount:${memberId}`);
    return { success: false, error: 'Failed to switch account.' };
  }
}

/**
 * Validates access to a brand account owned by the current user.
 * Selected-account state is URL-driven on the client.
 */
export async function switchToBrand(brandId: string): Promise<{ success: boolean; error?: string }> {
  await requireAnyPermission404([...ACCESS_ACCOUNTS_SWITCH_PERMISSIONS]);
  const canSwitch = await checkPermissions([...ACCESS_ACCOUNTS_SWITCH_PERMISSIONS]);
  if (!canSwitch) return { success: false, error: 'Permission denied.' };

  const personalAccountId = await getPersonalAccountId();
  if (!personalAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    await cleanupExpiredAccessModel();

    const ownership = await prisma.access.findFirst({
      where: {
        memberAccountId: personalAccountId,
        parentAccountId: brandId,
        roleId: BRAND_OWNER_ROLE_ID,
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: { appId: 'neup.account' },
      },
      select: { id: true },
    });
    if (!ownership) return { success: false, error: 'Brand account not found or not owned by you.' };

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    await logError('auth', error, `switchToBrand:${brandId}`);
    return { success: false, error: 'Failed to switch to brand account.' };
  }
}

/**
 * Validates access to a dependent account owned by the current user.
 * Selected-account state is URL-driven on the client.
 */
export async function switchToDependent(dependentId: string): Promise<{ success: boolean; error?: string }> {
  await requireAnyPermission404([...ACCESS_ACCOUNTS_SWITCH_PERMISSIONS]);
  const canSwitch = await checkPermissions([...ACCESS_ACCOUNTS_SWITCH_PERMISSIONS]);
  if (!canSwitch) return { success: false, error: 'Permission denied.' };

  const personalAccountId = await getPersonalAccountId();
  if (!personalAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    await cleanupExpiredAccessModel();

    const ownership = await prisma.access.findFirst({
      where: {
        memberAccountId: personalAccountId,
        parentAccountId: dependentId,
        roleId: 'account.guardian',
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: { appId: 'neup.account' },
      },
      select: { id: true },
    });
    if (!ownership) return { success: false, error: 'Dependent account not found or not owned by you.' };

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    await logError('auth', error, `switchToDependent:${dependentId}`);
    return { success: false, error: 'Failed to switch to dependent account.' };
  }
}

/**
 * Selected-account state is URL-driven on the client.
 */
export async function switchToPersonal(): Promise<void> {
  revalidatePath('/');
}
