import { NextResponse, type NextRequest } from 'next/server';
import { bridgeConnectionSignAndGet } from '@/services/auth/sign';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeConnectionSignAndGet(body);
  return NextResponse.json(result.body, { status: result.status });
}
