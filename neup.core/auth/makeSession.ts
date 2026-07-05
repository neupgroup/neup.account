'use server';

import { headers } from 'next/headers';
import { makeSession } from '@/services/auth/session';

export async function makeSessionFromRequest(input: {
  accountId: string;
  loginType: string;
  geolocation?: string;
}) {
  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for') || 'Unknown IP';
  const userAgent = headersList.get('user-agent') || 'Unknown User-Agent';

  return makeSession({
    ...input,
    ipAddress,
    userAgent,
  });
}
