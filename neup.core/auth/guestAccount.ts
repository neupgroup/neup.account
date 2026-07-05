'use server';

import { headers } from 'next/headers';
import { addAccount, getAccount } from '@/neup.core/auth/accounts';
import {
  resolveGuestAccount as resolveGuestAccountService,
  rotateGuestAccountOnLogout as rotateGuestAccountOnLogoutService,
} from '@/services/auth/guestAccount';

export async function resolveGuestAccount(linkedAccountId: string | null = null): Promise<void> {
  const headersList = await headers();
  const activeAccount = await getAccount();
  const result = await resolveGuestAccountService({
    linkedAccountId,
    activeAccount,
    ipAddress: headersList.get('x-forwarded-for') ?? 'Unknown IP',
    userAgent: headersList.get('user-agent') ?? 'Unknown',
  });

  if (result) {
    await addAccount(result.accountId, result.sessionId, result.sessionKey, '');
  }
}

export async function rotateGuestAccountOnLogout(): Promise<void> {
  const headersList = await headers();
  const activeAccount = await getAccount();
  const result = await rotateGuestAccountOnLogoutService({
    activeAccount,
    ipAddress: headersList.get('x-forwarded-for') ?? 'Unknown IP',
    userAgent: headersList.get('user-agent') ?? 'Unknown',
  });

  await addAccount(result.accountId, result.sessionId, result.sessionKey, '');
}
