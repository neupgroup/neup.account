import { NextResponse, type NextRequest } from 'next/server';
import { bridgeBuildGrantRedirect } from '@/logica/account/handshake';
import { resolveGuestAccount } from '@/logica/account/guestAccount';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Ensure a guest account exists for this browser before the auth flow begins.
  // This is the primary entry point where new visitors first touch the server.
  await resolveGuestAccount(null);

  const result = await bridgeBuildGrantRedirect({
    requestUrl: request.url,
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
  });

  return NextResponse.redirect(new URL(result.redirectTo));
}
