/**
 * Account token signing and verification.
 *
 * Each account entry in auth_acc is a signed JWT (RS256).
 *
 * Private key — signs tokens on write (server-side only).
 * Public key  — verifies tokens on read (Node.js + Edge).
 *
 * Keys are loaded from env vars:
 *   AUTH_PRIVATE_KEY — PEM with literal \n for newlines
 *   AUTH_PUBLIC_KEY  — PEM with literal \n for newlines
 *
 * Falls back to unsigned base64url JSON if keys are not set (dev only).
 */

export type AccountTokenPayload = {
  aid: string;
  sid: string;
  skey: string;
  nid?: string;   // omitted entirely for guest accounts
  neupId?: string;
  guest?: 1;      // only present on guest accounts
};

// ---------------------------------------------------------------------------
// Key loading — from env vars AUTH_PRIVATE_KEY / AUTH_PUBLIC_KEY
// ---------------------------------------------------------------------------

function normalizePem(pem: string): string {
  // Handle literal \n from .env files
  return pem.replace(/\\n/g, '\n');
}

function loadPrivateKey(): string | null {
  const key = process.env.AUTH_PRIVATE_KEY;
  return key ? normalizePem(key) : null;
}

function loadPublicKey(): string | null {
  const key = process.env.AUTH_PUBLIC_KEY;
  return key ? normalizePem(key) : null;
}

function requireKeys(): boolean {
  // Only allow insecure fallbacks during local development.
  // In production, missing keys must disable auth rather than silently weakening security.
  return process.env.NODE_ENV === 'production';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64urlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const padded2 = pad ? padded + '='.repeat(4 - pad) : padded;
  return Buffer.from(padded2, 'base64').toString('utf8');
}

// ---------------------------------------------------------------------------
// Sign — uses app.private.key
// ---------------------------------------------------------------------------

/**
 * Signs an account payload as a JWT using RS256 with app.private.key.
 * Falls back to unsigned base64url JSON if the key file is not available.
 */
export async function signAccountToken(payload: AccountTokenPayload): Promise<string> {
  const privateKey = loadPrivateKey();

  if (!privateKey) {
    if (requireKeys()) {
      throw new Error('AUTH_PRIVATE_KEY is required in production to sign auth cookies.');
    }

    // Dev fallback: plain base64url JSON
    return `unsigned.${base64urlEncode(JSON.stringify(payload))}.nosig`;
  }

  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${signingInput}.${signature}`;
}

// ---------------------------------------------------------------------------
// Verify — uses app.public.key
// ---------------------------------------------------------------------------

/**
 * Verifies and decodes an account JWT using app.public.key.
 * Returns the payload if valid, null if invalid or tampered.
 */
export async function verifyAccountToken(token: string): Promise<AccountTokenPayload | null> {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;

  // Fallback unsigned token
  if (header === 'unsigned' && signature === 'nosig') {
    if (requireKeys()) {
      // Never accept unsigned tokens in production.
      return null;
    }
    try {
      return JSON.parse(base64urlDecode(body)) as AccountTokenPayload;
    } catch {
      return null;
    }
  }

  const publicKey = loadPublicKey();

  if (!publicKey) {
    if (requireKeys()) {
      // Without a public key we cannot safely verify signed cookies.
      return null;
    }

    // Dev fallback: decode without verification
    try {
      return JSON.parse(base64urlDecode(body)) as AccountTokenPayload;
    } catch {
      return null;
    }
  }

  try {
    const { createVerify } = await import('crypto');
    const signingInput = `${header}.${body}`;
    const verify = createVerify('RSA-SHA256');
    verify.update(signingInput);
    verify.end();
    const sigBuffer = Buffer.from(
      signature.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    );
    const valid = verify.verify(publicKey, sigBuffer);
    if (!valid) return null;

    return JSON.parse(base64urlDecode(body)) as AccountTokenPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie serialization — single token
// ---------------------------------------------------------------------------

/**
 * The auth_account cookie stores a single JWT string directly.
 * No array wrapping needed.
 */
export function serializeAccountToken(token: string): string {
  return token;
}

export function deserializeAccountToken(raw: string): string {
  return raw.trim();
}

// Keep array variants for backward compat during migration
export function serializeAccountTokens(tokens: string[]): string {
  return tokens[0] ?? '';
}

export function deserializeAccountTokens(raw: string): string[] {
  const t = raw.trim();
  return t ? [t] : [];
}
