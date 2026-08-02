/**
 * ::neup.documentation::account-auth-token-service
 * ::title Account Auth Token Service
 *
 * Signing and verification helpers for the account auth cookie token.
 *
 * ::public
 *
 * This service signs and verifies the `auth_account` token payload used to carry account, session, and guest identity data across requests.
 *
 * ::public end
 *
 * ::private
 *
 * Production requires RSA keys from `AUTH_PRIVATE_KEY` and `AUTH_PUBLIC_KEY`. Development may fall back to unsigned payload encoding when keys are absent.
 *
 * ::private end
 *
 * ::end
 */

export type AccountTokenPayload = {
  aid: string;
  sid: string;
  skey: string;
  nid?: string;
  guest?: 1;
};

function normalizePem(pem: string): string {
  const normalized = pem.trim().replace(/\\n/g, '\n');
  return normalized.includes('-----/n') || normalized.includes('/n-----')
    ? normalized.replace(/\/n/g, '\n')
    : normalized;
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
  return process.env.NODE_ENV === 'production';
}

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

export async function signAccountToken(payload: AccountTokenPayload): Promise<string> {
  const privateKey = loadPrivateKey();

  if (!privateKey) {
    if (requireKeys()) {
      throw new Error('AUTH_PRIVATE_KEY is required in production to sign auth cookies.');
    }

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

export async function verifyAccountToken(token: string): Promise<AccountTokenPayload | null> {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;

  if (header === 'unsigned' && signature === 'nosig') {
    if (requireKeys()) {
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
      return null;
    }

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

export function serializeAccountToken(token: string): string {
  return token;
}

export function deserializeAccountToken(raw: string): string {
  return raw.trim();
}

export function serializeAccountTokens(tokens: string[]): string {
  return tokens[0] ?? '';
}

export function deserializeAccountTokens(raw: string): string[] {
  const token = raw.trim();
  return token ? [token] : [];
}
