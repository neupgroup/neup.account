import { NextResponse, type NextRequest } from 'next/server';
import { getApplicationTeamMembers } from '@/services/bridge/application-team';

export const dynamic = 'force-dynamic';

function getAuthToken(request: NextRequest): string | null {
  const headerToken = request.headers.get('auth')?.trim();
  if (headerToken) {
    return headerToken;
  }

  const cookieToken = request.cookies.get('auth_account')?.value?.trim();
  return cookieToken || null;
}

async function handle(
  request: NextRequest,
  body?: { app?: string; profile?: string },
) {
  const searchParams = request.nextUrl.searchParams;

  if (searchParams.has('appId')) {
    return NextResponse.json(
      {
        success: false,
        error: 'invalid_request',
        error_description: 'Use `app` (not `appId`).',
      },
      { status: 400 },
    );
  }

  const appId = body?.app?.trim() || searchParams.get('app');
  const profileAccountId = body?.profile?.trim() || searchParams.get('profile');
  const authToken = getAuthToken(request);

  const result = await getApplicationTeamMembers({
    appId,
    authToken,
    profileAccountId,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      {
        success: false,
        error: 'invalid_request',
        error_description: 'Request body must be a JSON object.',
      },
      { status: 400 },
    );
  }

  return handle(request, body as { app?: string; profile?: string });
}
