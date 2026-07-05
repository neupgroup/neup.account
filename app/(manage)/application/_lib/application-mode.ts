/*
::neup.documentation::application-root-mode-helper
::title Application Root Mode Helper

Preserves `mode=root` while navigating within application-management routes.

::public

Use this helper for links and redirects that should keep root application mode active across `/application` pages.

::public end

::end
*/

function isApplicationPath(pathname: string): boolean {
  return pathname === '/application' || pathname.startsWith('/application/');
}

/**
 * ::neup.documentation::application-root-mode-helper-append
 * ::function appendApplicationRootMode(path, mode)
 *
 * Preserves `mode=root` for application pages when navigating within /application routes.
 * If the target already has a mode value, it is not overridden.
 *
 * ::public
 *
 * Non-application paths are returned unchanged, and only the `root` mode is propagated.
 *
 * ::public end
 *
 * ::end
 */
export function appendApplicationRootMode(path: string, mode: string | null): string {
  if (mode !== 'root') return path;

  const base = 'http://localhost';
  const target = new URL(path, base);

  if (!isApplicationPath(target.pathname)) {
    return path;
  }

  if (!target.searchParams.has('mode')) {
    target.searchParams.set('mode', 'root');
  }

  const query = target.searchParams.toString();
  return `${target.pathname}${query ? `?${query}` : ''}${target.hash}`;
}
