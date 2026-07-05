import { APP_BASE_PATH } from '@/neup.core/appconfig';
import { getFlowParams, appendFlowParamsObject } from '@/neup.core/auth/callback';
import { appendApplicationRootMode } from '@/app/(manage)/application/_lib/application-mode';

type RouterLike = {
    push: (href: string, options?: { scroll?: boolean }) => void;
    replace: (href: string, options?: { scroll?: boolean }) => void;
};

type RedirectOptions = {
    replace?: boolean;
    hard?: boolean;
    scroll?: boolean;
    preserveFlowParams?: boolean; // Whether to preserve backsTo and steps params (default: true)
};

const STICKY_QUERY_KEYS = ['workingProfile'] as const;

function appendStickyQueryParams(path: string, currentParams: URLSearchParams): string {
    const [basePath, existingQuery = ''] = path.split('?');
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

/**
 * Resolves a path to include the base path for hard (window.location) navigation.
 * Paths that are already absolute URLs are returned as-is.
 */
function resolveHref(path: string): string {
    if (/^https?:\/\//i.test(path) || path.startsWith('//')) {
        return path;
    }
    // Avoid double base path
    if (path.startsWith(APP_BASE_PATH)) {
        return path;
    }
    return `${APP_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Redirects within the app.
 *
 * - When `router` is provided: uses Next.js router (base path handled automatically by Next.js).
 * - When `hard: true` or no router: uses window.location.href with base path prepended.
 * - By default, preserves backsTo and steps params from the current URL.
 *
 * @param path  App-relative path, e.g. '/auth/start'
 * @param router  Next.js router instance (optional — omit for hard navigation)
 * @param options  { replace, hard, scroll, preserveFlowParams }
 */
export function redirectInApp(
    path: string,
    router?: RouterLike | null,
    options: RedirectOptions = {}
): void {
    const { replace = false, hard = false, scroll, preserveFlowParams = true } = options;

    let finalPath = path;

    // Preserve backsTo and steps params if requested (default: true)
    if (preserveFlowParams && typeof window !== 'undefined') {
        const currentParams = new URLSearchParams(window.location.search);
        const flowParams = getFlowParams(currentParams);
        finalPath = appendApplicationRootMode(
            appendFlowParamsObject(path, flowParams),
            currentParams.get('mode'),
        );
        finalPath = appendStickyQueryParams(finalPath, currentParams);
    } else if (typeof window !== 'undefined') {
        finalPath = appendStickyQueryParams(finalPath, new URLSearchParams(window.location.search));
    }

    if (router && !hard) {
        const navOptions = scroll !== undefined ? { scroll } : undefined;
        if (replace) {
            router.replace(finalPath, navOptions);
        } else {
            router.push(finalPath, navOptions);
        }
        return;
    }

    // Hard navigation — must include base path manually
    const resolved = resolveHref(finalPath);
    if (replace) {
        window.location.replace(resolved);
    } else {
        window.location.href = resolved;
    }
}
