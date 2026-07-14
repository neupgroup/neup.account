
import { NextRequest, NextResponse } from 'next/server';
import { bridgeGetProfile } from '@/services/account/profileBridge';

export const dynamic = 'force-dynamic';

/**
 * GET /api.v1/profile
 * Retrieves user profile information based on authentication.
 * Supports header-based session authentication and tempToken-based authentication.
 */
export async function GET(request: NextRequest) {
  let parsedBody: any = undefined;
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      parsedBody = await request.json();
    }
  } catch {
    parsedBody = undefined;
  }

  const result = await bridgeGetProfile({
    tempToken: request.nextUrl.searchParams.get('tempToken'),
    appId: request.nextUrl.searchParams.get('appId'),
    requestedAid: parsedBody?.aid || request.nextUrl.searchParams.get('aid'),
    requestedNeupId: parsedBody?.neupid || request.nextUrl.searchParams.get('neupid'),
    headerAid: request.headers.get('aid'),
    headerSid: request.headers.get('sid'),
    headerSkey: request.headers.get('skey'),
  });

  return NextResponse.json(result.body, { status: result.status });
}
