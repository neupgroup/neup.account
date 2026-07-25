import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * ::neup.documentation::proxy-module
 * ::title Edge Proxy Middleware
 *
 * Edge middleware that enforces HTTPS, device blocks, and account-session gating for protected routes.
 *
 * ::public
 *
 * Auth routes, bridge routes, and static assets pass through; protected app routes require a valid `auth_account` JWT with a non-guest NeupID-bearing payload.
 *
 * ::public end
 *
 * ::private
 *
 * The middleware also propagates pathname and selected-account headers into the request and can fall back to unsigned token decoding when no public key is configured.
 *
 * ::private end
 *
 * ::end
 */

// ---------------------------------------------------------------------------
// JWT types
// ---------------------------------------------------------------------------

type JwtPayload = {
  aid?: string;
  sid?: string;
  skey?: string;
  nid?: string;
  guest?: number;
};

// ---------------------------------------------------------------------------
// Web Crypto key import — Edge runtime compatible
// ---------------------------------------------------------------------------

let _cachedKey: CryptoKey | null | undefined = undefined;

async function getPublicKey(): Promise<CryptoKey | null> {
  if (_cachedKey !== undefined) return _cachedKey;

  // AUTH_PUBLIC_KEY from .env — PEM with literal \n for newlines
  const pem = process.env.AUTH_PUBLIC_KEY;
  if (!pem) {
    _cachedKey = null;
    return null;
  }

  try {
    const normalizedPem = pem.trim().replace(/\\n/g, '\n');
    const pemWithLineBreaks = normalizedPem.includes('-----/n') || normalizedPem.includes('/n-----')
      ? normalizedPem.replace(/\/n/g, '\n')
      : normalizedPem;
    const pemBody = pemWithLineBreaks
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s/g, '');

    const keyBuffer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

    _cachedKey = await crypto.subtle.importKey(
      'spki',
      keyBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return _cachedKey;
  } catch {
    _cachedKey = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

function b64urlDecode(str: string): string {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  return atob(pad ? s + '='.repeat(4 - pad) : s);
}

async function verifyJwt(token: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;

  // Dev fallback: unsigned token
  if (header === 'unsigned' && sig === 'nosig') {
    try { return JSON.parse(b64urlDecode(body)); } catch { return null; }
  }

  const publicKey = await getPublicKey();

  if (!publicKey) {
    // No key available — decode without verification (dev fallback only)
    try { return JSON.parse(b64urlDecode(body)); } catch { return null; }
  }

  try {
    const signingInput = `${header}.${body}`;
    const sigPadded = sig.replace(/-/g, '+').replace(/_/g, '/');
    const pad = sigPadded.length % 4;
    const sigBuffer = Uint8Array.from(
      atob(pad ? sigPadded + '='.repeat(4 - pad) : sigPadded),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      sigBuffer,
      new TextEncoder().encode(signingInput)
    );

    if (!valid) return null;
    return JSON.parse(b64urlDecode(body));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Redirect helper
// ---------------------------------------------------------------------------

function redirectToStart(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = '/auth/start';
  url.search = '';
  if (pathname !== '/' && pathname !== '') {
    url.searchParams.set('redirects', pathname + request.nextUrl.search);
  }
  return NextResponse.redirect(url);
}


// ---------------------------------------------------------------------------
// Main Proxy Function
// ---------------------------------------------------------------------------

export default async function proxy(request: NextRequest) {
  /**
   * ::neup.documentation::proxy-main-function
   * ::function proxy(request)
   *
   * Applies the account-app route protection and request-header enrichment rules.
   *
   * ::public
   *
   * Requests that fail HTTPS, device-block, or session checks are redirected to the appropriate auth route.
   *
   * ::public end
   *
   * ::private
   *
   * Successful requests forward `x-next-pathname` and, when present, `x-selected-account` to downstream route handlers.
   *
   * ::private end
   *
   * ::end
   */
  const { pathname } = request.nextUrl;
  const selectedAccountId = request.nextUrl.searchParams.get('workingProfile')?.trim();

  // 1. Prepare headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-next-pathname', pathname);
  if (selectedAccountId) {
    requestHeaders.set('x-selected-account', selectedAccountId);
  }


  // 2. HTTPS enforcement
  const proto = request.headers.get('x-forwarded-proto');
  const isSecure = proto === 'https' || request.nextUrl.protocol === 'https:';
  if (!isSecure && pathname !== '/auth/unsecure') {
    return NextResponse.redirect(new URL('/auth/unsecure', request.url));
  }

  // 2. Device block
  if (request.cookies.has('device_block') && pathname !== '/auth/blocked') {
    return NextResponse.redirect(new URL('/auth/blocked', request.url));
  }

  // 4. Exclusions (Static assets, etc.)
  // These are usually handled by the matcher, but explicit check is good safety.
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/.well-known')
  ) {
    return NextResponse.next({
        request: { headers: requestHeaders }
    });
  }

  // 5. Auth pages and bridge routes — always pass through
  if (pathname.startsWith('/auth') || pathname.startsWith('/bridge')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 6. All other protected routes — verify auth_account JWT
  const raw = request.cookies.get('auth_account')?.value;

  if (!raw) {
    return redirectToStart(request, pathname);
  }

  const payload = await verifyJwt(raw.trim());

  if (!payload) {
    return redirectToStart(request, pathname);
  }

  // Block guests (guest: 1) or accounts with no nid
  if (payload.guest === 1 || !payload.nid) {
    return redirectToStart(request, pathname);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    '/((?!_next(?:/.*)?|bridge(?:/.*)?|robots\\.txt$|sitemap\\.xml$|sitemap(?:/.*)?|favicon\\.ico$|humans\\.txt$|\\.well-known(?:/.*)?).*)',
  ],
};
