import { NextRequest, NextResponse } from 'next/server';
import { beginProofGrant } from '@/services/auth/proof-grant';
import { bridgeIssueGrant } from '@/services/auth/grant';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' };

export async function GET(request: NextRequest) {
  try {
    const result = await beginProofGrant(request.url, request.nextUrl.searchParams);
    return new NextResponse(null, { status: 303, headers: { ...headers, Location: result.redirectTo } });
  } catch {
    return NextResponse.json({ success: false, error: 'internal_server_error' }, { status: 500, headers });
  }
}

export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: 'invalid_request' }, { status: 400, headers });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.tempcode || body.tempToken) {
    return NextResponse.json({ success: false, error: 'invalid_request' }, { status: 400, headers });
  }
  const result = await bridgeIssueGrant(body);
  return NextResponse.json(result.body, { status: result.status, headers });
}
