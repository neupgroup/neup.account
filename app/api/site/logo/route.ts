import { NextResponse } from 'next/server';
import { getConfiguredSiteLogoUrl } from '@/services/manage/site/logo';

export async function GET() {
  const logoUrl = await getConfiguredSiteLogoUrl();
  return NextResponse.json({ logoUrl: logoUrl || null });
}
