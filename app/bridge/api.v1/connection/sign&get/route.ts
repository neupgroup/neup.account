import { NextResponse, type NextRequest } from 'next/server';
import { bridgeConnectionSignAndGet } from '@/services/auth/sign';

export async function POST(request: NextRequest) {
  let body: { appId?: string; appSecret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const authAccountToken = request.cookies.get('auth_account')?.value;
  const result = await bridgeConnectionSignAndGet({
    appId: body?.appId,
    appSecret: body?.appSecret,
    authAccountToken,
  });
  return NextResponse.json(result.body, { status: result.status });
}

function methodNotAllowed() {
  return NextResponse.json(
    { success: false, error: 'method_not_allowed', error_description: 'Use POST for this endpoint.' },
    { status: 405 },
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
