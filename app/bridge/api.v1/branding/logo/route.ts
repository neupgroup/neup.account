import { NextResponse } from 'next/server';
import { getConfiguredSiteLogoUrl } from '@/services/manage/site/logo';

/**
 * ::neup.documentation::bridge-branding-logo-route-module
 * ::title Branding Logo Route Module
 *
 * Exposes the configured site logo URL for bridge clients.
 *
 * ::public
 *
 * This route returns the saved logo URL if one is configured, otherwise `null`.
 *
 * ::public end
 *
 * ::private
 *
 * Default fallback handling stays in the service layer; this route exposes only the stored configured value.
 *
 * ::private end
 *
 * ::end
 */
export async function GET() {
  /**
   * ::neup.documentation::bridge-branding-logo-endpoint
   * ::api GET /bridge/api.v1/branding/logo
   *
   * Returns the configured site logo URL.
   *
   * ::public
   *
   * Use this endpoint when a client needs the branding-specific configured logo instead of the service's default fallback URL.
   *
   * ::public end
   *
   * ::private
   *
   * Success responses return `200` with `logoUrl` set to either a resolved URL or `null`.
   *
   * ::private end
   *
   * ::end
   */
  const logoUrl = await getConfiguredSiteLogoUrl();
  return NextResponse.json({ logoUrl: logoUrl || null });
}
