// Client-side navigation helpers.
// Use redirectInApp for in-app navigation via the Next.js router.
// Use redirectInDomain for same-origin hard navigation.
// Use redirectHttps / redirectHttp for external URLs.

import { getFlowParams, appendFlowParamsObject } from '@/neup.core/auth/callback';
import { appendApplicationRootMode } from '@/app/(manage)/application/_lib/application-mode';

type RouterNavigationOptions = {
  scroll?: boolean;
};

type AppRouterLike = {
  push: (href: string, options?: RouterNavigationOptions) => void;
  replace: (href: string, options?: RouterNavigationOptions) => void;
};

type AppRedirectOptions = RouterNavigationOptions & {
  replace?: boolean;
  preserveFlowParams?: boolean; // Whether to preserve backsTo and steps params (default: true)
};

type BrowserRedirectOptions = {
  replace?: boolean;
  preserveFlowParams?: boolean; // Whether to preserve backsTo and steps params (default: true)
};

const STICKY_QUERY_KEYS = ['workingProfile'] as const;

export function appendStickyQueryParams(targetHref: string, currentParams: URLSearchParams) {
  const [basePath, existingQuery = ''] = targetHref.split('?');
  const nextParams = new URLSearchParams(existingQuery);

  for (const key of STICKY_QUERY_KEYS) {
    const value = currentParams.get(key);
    if (value && !nextParams.has(key)) {
      nextParams.set(key, value);
    }
  }

  const query = nextParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

// Performs a hard browser navigation using window.location.
function navigateInBrowser(targetUrl: string, options: BrowserRedirectOptions = {}) {
  if (typeof window === 'undefined') return;

  let finalUrl = targetUrl;
  const currentParams = new URLSearchParams(window.location.search);

  // Preserve backsTo and steps params if requested (default: true)
  const shouldPreserve = options.preserveFlowParams !== false;
  if (shouldPreserve) {
    const flowParams = getFlowParams(currentParams);
    finalUrl = appendFlowParamsObject(targetUrl, flowParams);
  }

  finalUrl = appendStickyQueryParams(finalUrl, currentParams);

  if (options.replace) {
    window.location.replace(finalUrl);
    return;
  }

  window.location.assign(finalUrl);
}

// Normalizes a value into an absolute URL string using the given protocol as fallback.
// Handles protocol-relative URLs (//example.com) and bare hostnames.
function normalizeAbsoluteUrl(value: string, defaultProtocol: 'http:' | 'https:') {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    return new URL(value).toString();
  }

  if (value.startsWith('//')) {
    return new URL(`${defaultProtocol}${value}`).toString();
  }

  return new URL(`${defaultProtocol}//${value}`).toString();
}

// Navigates within the app using the Next.js router.
// Supports push (default) or replace, and optional scroll control.
// By default, preserves backsTo and steps params from the current URL.
export function redirectInApp(router: AppRouterLike, href: string, options: AppRedirectOptions = {}) {
  const { replace = false, scroll, preserveFlowParams = true } = options;
  const navigationOptions = scroll === undefined ? undefined : { scroll };

  let finalHref = href;
  const currentParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

  // Preserve backsTo and steps params if requested (default: true)
  if (preserveFlowParams && currentParams) {
    const flowParams = getFlowParams(currentParams);
    finalHref = appendApplicationRootMode(
      appendFlowParamsObject(href, flowParams),
      currentParams.get('mode'),
    );
  }

  if (currentParams) {
    finalHref = appendStickyQueryParams(finalHref, currentParams);
  }

  if (replace) {
    router.replace(finalHref, navigationOptions);
    return;
  }

  router.push(finalHref, navigationOptions);
}

// Performs a hard navigation to a same-origin path or URL.
// Throws if the target resolves to a different origin.
export function redirectInDomain(pathOrUrl: string, options: BrowserRedirectOptions = {}) {
  if (typeof window === 'undefined') return;

  const targetUrl = new URL(pathOrUrl, window.location.origin);

  if (targetUrl.origin !== window.location.origin) {
    throw new Error(`redirectInDomain only supports same-domain URLs. Received: ${pathOrUrl}`);
  }

  navigateInBrowser(targetUrl.toString(), options);
}

// Navigates to an external HTTPS URL.
export function redirectHttps(value: string, options: BrowserRedirectOptions = {}) {
  navigateInBrowser(normalizeAbsoluteUrl(value, 'https:'), options);
}

// Navigates to an external HTTP URL.
export function redirectHttp(value: string, options: BrowserRedirectOptions = {}) {
  navigateInBrowser(normalizeAbsoluteUrl(value, 'http:'), options);
}

// Builds a URL that preserves backsTo and steps flow params.
// Use this for generating href attributes on anchor tags or links that might be opened in new tabs.
export function buildHrefWithFlowParams(href: string): string {
  if (typeof window === 'undefined') return href;

  const currentParams = new URLSearchParams(window.location.search);
  const flowParams = getFlowParams(currentParams);

  return appendFlowParamsObject(href, flowParams);
}
