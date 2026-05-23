// Utilities for preserving application root mode across /application routes.

function isApplicationPath(pathname: string): boolean {
  return pathname === '/application' || pathname.startsWith('/application/');
}

/**
 * Preserves `mode=root` for application pages when navigating within /application routes.
 * If the target already has a mode value, it is not overridden.
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

