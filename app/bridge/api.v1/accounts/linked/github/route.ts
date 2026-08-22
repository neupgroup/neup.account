import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { constants, publicEncrypt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession } from '@/services/account/verify';
import { getLatestLinkedAccountOauthToken } from '@/services/bridge/linked-accounts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
::neup.documentation::bridge-linked-github-token-route
::api POST /bridge/api.v1/accounts/linked/github
::title Bridge Linked GitHub Token Route

Returns the latest stored GitHub OAuth token for the authenticated account.

::public

Send the account auth token in the JSON body as `token` or in the `Authorization: Bearer ...` header. When the session is valid and a GitHub linked-account token exists, the route returns that OAuth token encrypted with the checked-in GitHub communication public key.

::public end

::private

The route validates the first-party `auth_account` session, reads the latest `linked_accounts` GitHub payload for that account, extracts the OAuth access token, and encrypts it with `keys/communication/github/public.pem`.

::private end

::end
*/

type BodyObject = Record<string, unknown>;

let githubPublicKeyPromise: Promise<string> | undefined;

function normalizeKey(input: string): string {
  return input.replace(/[_-]/g, '').toLowerCase();
}

function readString(input: BodyObject, canonical: string): string | null {
  const target = normalizeKey(canonical);
  for (const [key, value] of Object.entries(input)) {
    if (normalizeKey(key) !== target || typeof value !== 'string') continue;
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

async function readJsonBody(request: NextRequest): Promise<BodyObject | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as BodyObject
      : null;
  } catch {
    return null;
  }
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authorization.slice('bearer '.length).trim();
  return token || null;
}

async function readGithubPublicKey(): Promise<string> {
  if (!githubPublicKeyPromise) {
    githubPublicKeyPromise = (async () => {
      const keyPath = path.join(process.cwd(), 'keys/communication/github/public.pem');
      const pem = (await readFile(keyPath, 'utf8')).trim();
      if (!pem) {
        throw new Error('github_public_key_missing');
      }
      return pem;
    })();
  }

  return githubPublicKeyPromise;
}

function encryptGithubToken(token: string, ownerId: string): Promise<string> {
  return readGithubPublicKey().then((publicKey) => {
    const payload = JSON.stringify({
      token,
      ownerId,
      platform: 'github',
    });

    return publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      Buffer.from(payload, 'utf8'),
    ).toString('base64url');
  });
}

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const authToken = readString(body, 'token') ?? readString(body, 'authToken') ?? readBearerToken(request);
  if (!authToken) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'token is required.' },
      { status: 400 },
    );
  }

  const session = await getActiveSession({ authAccountToken: authToken });
  if (!session?.accountId) {
    return NextResponse.json(
      { success: false, error: 'invalid_token', error_description: 'Invalid or expired auth token.' },
      { status: 401 },
    );
  }

  const githubOauthToken = await getLatestLinkedAccountOauthToken(session.accountId, 'github');
  if (!githubOauthToken) {
    return NextResponse.json(
      { success: false, error: 'not_found', error_description: 'No stored GitHub OAuth token was found for this account.' },
      { status: 404 },
    );
  }

  try {
    const encryptedToken = await encryptGithubToken(githubOauthToken, session.accountId);
    return NextResponse.json(
      {
        success: true,
        platform: 'github',
        token: encryptedToken,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'server_error', error_description: 'Failed to encrypt GitHub OAuth token.' },
      { status: 500 },
    );
  }
}
