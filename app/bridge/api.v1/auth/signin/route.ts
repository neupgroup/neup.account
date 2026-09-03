import { NextRequest, NextResponse } from 'next/server';
import { issueBridgeSigninRequest, resolveBridgeSignin } from '@/services/auth/bridge-signin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await issueBridgeSigninRequest());
  } catch (error) {
    console.error('bridge signin request', error);
    return NextResponse.json({ success: false, error: 'Unable to create auth request.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = request.headers.get('x-auth-request') || (authorization?.match(/^Bearer\s+(.+)$/i)?.[1]);
  if (!token) return NextResponse.json({ success: false, error: 'Auth request JWT is required.' }, { status: 401 });

  const body = await request.text();
  let neupId = body.trim();
  let parsedPassword: string | undefined;
  let parsedTerms: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed !== 'string') {
      neupId = parsed.neupid ?? parsed.neupId ?? '';
      parsedPassword = typeof parsed.password === 'string' ? parsed.password : undefined;
      parsedTerms = parsed.terms && typeof parsed.terms === 'object' ? parsed.terms : undefined;
    } else {
      neupId = parsed;
    }
  } catch { /* Plain-text NeupID is also supported. */ }

  if (parsedPassword !== undefined && !neupId) neupId = '';

  const result = await resolveBridgeSignin(neupId, token, parsedPassword, parsedTerms);
  return NextResponse.json(result.body, { status: result.status });
}
