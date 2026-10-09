import assets from '@base/assets.json';

/** Returns the app's main logo configured in `@base/assets.json`. */
export async function getSiteLogoUrl(): Promise<string> {
  return assets.logo.main;
}
