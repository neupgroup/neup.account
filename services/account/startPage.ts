import prisma from '@/core/database/prisma';
import { getActiveSession } from '@/services/account/verify';
import { getValidatedStoredAccounts } from '@/services/account/session';
import { extractGenderFromDetails, resolveDisplayImage } from '@/logica/display-image';

/**
 * Function getFirstValue.
 */
function getFirstValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? undefined;
  }

  return value;
}


/**
 * Function getAuthStartPageData.
 */
export async function getAuthStartPageData(searchParams: Record<string, string | string[] | undefined>) {
  // Filter out guest accounts — they cannot sign in and should not appear in the UI
  let accounts = (await getValidatedStoredAccounts()).filter(a => !a.guest);
  const activeSession = await getActiveSession();
  const appId = getFirstValue(searchParams.appId) || getFirstValue(searchParams.appid);

  try {
    const uniqueIds = Array.from(new Set(accounts.map((account) => account.aid).filter(Boolean)));
    if (uniqueIds.length > 0) {
      const existing = await prisma.account.findMany({
        where: { id: { in: uniqueIds } },
        select: {
          id: true,
          displayName: true,
          displayImage: true,
          details: true,
          accountType: true,
          individualProfile: {
            select: {
              details: true,
            },
          },
        },
      });
      const existingMap = new Map(existing.map((entry) => [entry.id, entry]));
      accounts = accounts
        .filter((account) => existingMap.has(account.aid))
        .map((account) => {
          const row = existingMap.get(account.aid);
          return {
            ...account,
            displayName: row?.displayName || account.displayName,
            displayPhoto: row
              ? resolveDisplayImage({
                  displayImage: row.displayImage,
                  accountType: row.accountType,
                  gender: extractGenderFromDetails({
                    accountDetails: row.details,
                    individualDetails: row.individualProfile?.details,
                  }),
                })
              : account.displayPhoto,
          };
        });
    }
  } catch {
    // If the database is unavailable, fall back to showing the stored accounts.
  }

  const application = appId
    ? await prisma.application.findUnique({
        where: { id: appId },
        select: { name: true },
      })
    : null;

  return {
    accounts,
    hasActiveSession: Boolean(activeSession),
    appName: application?.name,
  };
}
