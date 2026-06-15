import { notFound } from 'next/navigation';
import { getActiveAccountId } from '@/core/auth/verify';
import { getAccountType } from '@/services/user';

export async function requireIndividualAccount404(accountId?: string): Promise<void> {
  const resolvedAccountId = accountId ?? await getActiveAccountId();
  if (!resolvedAccountId) {
    notFound();
  }

  const accountType = await getAccountType(resolvedAccountId);
  if (accountType !== 'individual') {
    notFound();
  }
}

