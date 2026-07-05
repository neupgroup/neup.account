'use server';

import prisma from '@/neup.core/helpers/prisma';
import { getSessionCookies } from '@/neup.core/auth/cookies';
import { getUrlParam } from '@/neup.core/helper/urlHelper';

export type AccountSelectorContext = {
  personalAccountId: string | null;
  activeAccountId: string | null;
  requestedSelectedAccountId: string | null;
  isSelf: boolean;
  isManagingOtherAccount: boolean;
};

async function resolveRequestedSelectedAccountId(
  selectedAccountId?: string | null,
): Promise<string | null> {
  return getUrlParam('workingProfile', selectedAccountId);
}

async function canManageSelectedAccount(
  personalAccountId: string,
  requestedAccountId: string,
): Promise<boolean> {
  if (requestedAccountId === personalAccountId) {
    return true;
  }

  const grant = await prisma.access.findFirst({
    where: {
      memberAccountId: personalAccountId,
      parentAccountId: requestedAccountId,
      status: 'active',
      OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
      role: {
        appId: 'neup.account',
      },
    },
    select: { id: true },
  });

  return Boolean(grant);
}

export async function getAccountSelectorContext(
  selectedAccountId?: string | null,
): Promise<AccountSelectorContext> {
  const [{ accountId: personalAccountId }, requestedSelectedAccountId] = await Promise.all([
    getSessionCookies(),
    resolveRequestedSelectedAccountId(selectedAccountId),
  ]);

  if (!personalAccountId) {
    return {
      personalAccountId: null,
      activeAccountId: null,
      requestedSelectedAccountId,
      isSelf: false,
      isManagingOtherAccount: false,
    };
  }

  let activeAccountId = personalAccountId;

  if (
    requestedSelectedAccountId &&
    (await canManageSelectedAccount(personalAccountId, requestedSelectedAccountId))
  ) {
    activeAccountId = requestedSelectedAccountId;
  }

  const isSelf = activeAccountId === personalAccountId;

  return {
    personalAccountId,
    activeAccountId,
    requestedSelectedAccountId,
    isSelf,
    isManagingOtherAccount: !isSelf,
  };
}
