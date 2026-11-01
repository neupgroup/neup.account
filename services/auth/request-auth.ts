import type { NextRequest } from 'next/server';
import { getActiveSession, type Session } from '@/services/account/verify';

type AuthRequest = Request | NextRequest;

/** Returns whether the request path is under the bridge API namespace. */
function isBridgeRequest(request: AuthRequest): boolean {
  return new URL(request.url).pathname.split('/').includes('bridge');
}

/** Reads a cookie value from a standard Request header. */
function readCookie(request: AuthRequest, name: string): string | null {
  const nextRequest = request as NextRequest;
  const nextCookie = nextRequest.cookies?.get(name)?.value;
  if (nextCookie) return nextCookie.trim() || null;

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    } catch {
      return part.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

/** Resolves the canonical auth token for a request. */
export function getRequestAuthToken(request: AuthRequest): string | null {
  const headerToken = isBridgeRequest(request) ? request.headers.get('x-auth')?.trim() : null;
  return headerToken || readCookie(request, 'auth');
}

/** Returns the validated database-backed session for a request. */
export async function getRequestSession(request?: AuthRequest): Promise<Session | null> {
  return request
    ? getActiveSession({ authToken: getRequestAuthToken(request) })
    : getActiveSession();
}

/** Checks whether a request has a valid, active account session. */
export async function isAuthenticated(request?: AuthRequest): Promise<boolean> {
  return Boolean(await getRequestSession(request));
}

/** Checks whether an authenticated request has every requested permission. */
export async function isAuthorized(
  requiredPermissions: readonly string[],
  request?: AuthRequest,
): Promise<boolean> {
  const session = await getRequestSession(request);
  if (!session) return false;
  const { checkPermissions } = await import('@/services/user');
  return checkPermissions(requiredPermissions, session.accountId);
}
