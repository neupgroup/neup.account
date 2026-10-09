import { NextResponse } from 'next/server';
import { getSiteLogoUrl } from '@/services/manage/site/logo';

/**
 * ::neup.documentation::bridge-branding-logo-route-module
 * ::title Branding Logo Route Module
 *
 * Exposes the app's main logo from `@base/assets.json` for bridge clients.
 *
 * ::public
 *
 * This route returns the configured `logo.main` asset path.
 *
 * ::public end
 *
 * ::private
 *
 * The asset manifest is the source of truth for the logo.
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
   * Returns the app's main logo asset path.
   *
   * ::public
   *
   * Use this endpoint when a client needs the app's main logo path.
   *
   * ::public end
   *
   * ::private
   *
   * Success responses return `200` with `logoUrl` set to the path in `@base/assets.json`.
   *
   * ::private end
   *
   * ::end
   */
  const logoUrl = await getSiteLogoUrl();
  return NextResponse.json({ logoUrl });
}
