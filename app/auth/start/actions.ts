'use server';

import { resolveGuestAccount } from '@/logica/account/guestAccount';

/**
 * Server Action — creates a guest account if none exists.
 * Called from the GuestAccountInitializer client component on mount.
 * Server Actions are a valid context for cookies().set().
 */
export async function initGuestAccount(): Promise<void> {
  await resolveGuestAccount(null);
}
