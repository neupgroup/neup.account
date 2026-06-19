import { NextRequest, NextResponse } from 'next/server';
import { bridgeAssignRoleToCurrentAccount } from '@/services/bridge/roles-assign-me';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  const result = await bridgeAssignRoleToCurrentAccount(request);
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
