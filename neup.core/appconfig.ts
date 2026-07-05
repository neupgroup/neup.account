/**
 * App-level configuration.
 * Single source of truth for domain and base path — used by link helpers
 * so that hard redirects (window.location.href) always resolve correctly.
 */

export const APP_BASE_PATH = '/account';

export const APP_DOMAIN =
    process.env.NEXT_PUBLIC_APP_DOMAIN ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://neupgroup.com');

/**
 * Returns the base path for the app (e.g. '/account').
 */
export function getBasePath(): string {
    return APP_BASE_PATH;
}

/**
 * Returns the full origin + base path (e.g. 'https://neupgroup.com/account').
 */
export function getAppRoot(): string {
    return `${APP_DOMAIN}${APP_BASE_PATH}`;
}
