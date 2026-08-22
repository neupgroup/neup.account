import { NextResponse, type NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { getActiveSession } from '@/services/account/verify';
import { stringUuid } from '@/core/data/uuid';

export const dynamic = 'force-dynamic';

const DEFAULT_GITHUB_SCOPE = 'repo';

type StatePayload = {
  nonce: string;
  ownerId: string;
  connectedBy: string;
  issuedAt: number;
};

const STATE_COOKIE_NAME = 'github_link_state';

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signState(payload: StatePayload, secret: string): string {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${toBase64Url(body)}.${signature}`;
}

export async function GET(request: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Authentication required.' },
      { status: 401 },
    );
  }

  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const redirectUri = process.env.GITHUB_REDIRECT_URI?.trim();
  const scope = DEFAULT_GITHUB_SCOPE;
  const stateSecret = process.env.GITHUB_SESSION_SECRET?.trim();

  if (!clientId || !redirectUri || !stateSecret) {
    return NextResponse.json(
      {
        success: false,
        error: 'GitHub OAuth configuration is incomplete.',
      },
      { status: 500 },
    );
  }

  const selectedProfile = request.nextUrl.searchParams.get('selectedProfile')?.trim();
  const ownerId = selectedProfile || session.accountId;

  const state = signState(
    {
      nonce: stringUuid(),
      ownerId,
      connectedBy: session.accountId,
      issuedAt: Date.now(),
    },
    stateSecret,
  );

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.append('client_id', clientId);
  githubAuthUrl.searchParams.append('redirect_uri', redirectUri);
  githubAuthUrl.searchParams.append('state', state);
  githubAuthUrl.searchParams.append('scope', scope);

  const response = NextResponse.redirect(githubAuthUrl);
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
  return response;
}
