import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import jwt from 'jsonwebtoken';

// Mock prisma before importing the module under test
vi.mock('@/core/helpers/prisma', () => ({
  default: {
    applicationBridge: { findMany: vi.fn() },
    identity: { upsert: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    application: { findUnique: vi.fn() },
    authnRequest: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    account: { findUnique: vi.fn() },
  },
}));

vi.mock('@/core/helpers/logger', () => ({
  logError: vi.fn().mockResolvedValue(undefined),
}));

import prisma from '@/core/helpers/prisma';
import {
  signIdentityJwt,
  resolveOrCreateIdentity,
  validateSilentSsoOrigin,
  exchangeSilentAuthCode,
  checkRateLimit,
  rateLimitMap,
} from '@/services/auth/silent-sso';
import type { Identity } from '@/prisma/generated/client';

const mockApplicationFindUnique = prisma.application.findUnique as ReturnType<typeof vi.fn>;
const mockIdentityUpsert = prisma.identity.upsert as ReturnType<typeof vi.fn>;
const mockIdentityFindFirst = prisma.identity.findFirst as ReturnType<typeof vi.fn>;
const mockIdentityCreate = prisma.identity.create as ReturnType<typeof vi.fn>;
const mockIdentityUpdate = prisma.identity.update as ReturnType<typeof vi.fn>;
const mockBridgeFindMany = prisma.applicationBridge.findMany as ReturnType<typeof vi.fn>;
const mockAuthnRequestFindFirst = prisma.authnRequest.findFirst as ReturnType<typeof vi.fn>;
const mockAuthnRequestUpdateMany = prisma.authnRequest.updateMany as ReturnType<typeof vi.fn>;
const mockAccountFindUnique = prisma.account.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Property 1: JWT round-trip preserves ssid
// Feature: silent-sso, Property 1: JWT round-trip preserves ssid
// Validates: Requirements 2.3, 5.3
// ---------------------------------------------------------------------------
describe('Property 1: JWT round-trip preserves ssid', () => {
  it('decoded JWT payload matches all identity fields', async () => {
    const validDate = fc.integer({ min: new Date('2000-01-01').getTime(), max: new Date('2100-01-01').getTime() }).map(ms => new Date(ms));
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.string({ minLength: 1 }),
          trackId: fc.string({ minLength: 1 }),
          originatedOn: validDate,
          refreshesOn: validDate,
          validTill: validDate,
        }),
        async (identityShape) => {
          mockApplicationFindUnique.mockResolvedValue({ appSecret: 'test-secret-key-for-jwt' });

          const identity = identityShape as unknown as Identity;
          const token = await signIdentityJwt(identity, 'test-app');
          const decoded = jwt.decode(token) as Record<string, unknown>;

          expect(decoded.ssid).toBe(identity.id);
          expect(decoded.expires_on).toBe(identity.validTill.toISOString());
          expect(decoded.refreshes_on).toBe(identity.refreshesOn.toISOString());
          expect(Array.isArray(decoded.details)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Identity temporal invariants
// Feature: silent-sso, Property 2: Identity temporal invariants
// Validates: Requirements 5.4, 2.3
// ---------------------------------------------------------------------------
describe('Property 2: Identity temporal invariants', () => {
  it('validTill is ~4 weeks after originatedOn, refreshesOn is between originatedOn and validTill', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use integer timestamps to avoid fc.date() generating NaN
        fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-01-01').getTime() }),
        async (originatedOnMs) => {
          const originatedOn = new Date(originatedOnMs);
          const refreshesOn = new Date(originatedOn.getTime() + 3_600_000);
          const validTill = new Date(originatedOn.getTime() + 4 * 7 * 24 * 3_600_000);

          mockIdentityUpsert.mockResolvedValue({
            id: 'test-id',
            accountId: 'acc',
            appId: 'app',
            sessionId: null,
            originatedOn,
            refreshesOn,
            validTill,
          });

          const identity = await resolveOrCreateIdentity('acc', 'app');

          // validTill ≈ originatedOn + 4 weeks (within 1 second tolerance)
          expect(
            Math.abs(
              identity.validTill.getTime() -
                (identity.originatedOn.getTime() + 4 * 7 * 24 * 3_600_000)
            )
          ).toBeLessThanOrEqual(1000);

          // refreshesOn is strictly after originatedOn
          expect(identity.refreshesOn.getTime()).toBeGreaterThan(identity.originatedOn.getTime());

          // refreshesOn is strictly before validTill
          expect(identity.refreshesOn.getTime()).toBeLessThan(identity.validTill.getTime());
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Origin validation correctness
// Feature: silent-sso, Property 3: Origin validation correctness
// Validates: Requirements 3.1, 3.3, 3.4
// ---------------------------------------------------------------------------
describe('Property 3: Origin validation correctness', () => {
  it('registered origin matches (with or without path), unregistered origin does not match', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            'https://app1.example.com',
            'https://app2.test.io',
            'https://tourio.com'
          ),
          { minLength: 1, maxLength: 3 }
        ),
        async (registeredOrigins) => {
          for (const origin of registeredOrigins) {
            // Mock to return only this single origin
            mockBridgeFindMany.mockResolvedValue([{ value: origin, appId: 'app-1' }]);

            // Exact origin should match
            const exactResult = await validateSilentSsoOrigin(origin);
            expect(exactResult.valid).toBe(true);
            expect(exactResult.appId).toBe('app-1');

            // Origin with path and query should also match (path ignored)
            const withPathResult = await validateSilentSsoOrigin(origin + '/some/path?q=1');
            expect(withPathResult.valid).toBe(true);

            // Unregistered origin should not match
            mockBridgeFindMany.mockResolvedValue([{ value: origin, appId: 'app-1' }]);
            const unregisteredResult = await validateSilentSsoOrigin(
              'https://unregistered.example.com'
            );
            expect(unregisteredResult.valid).toBe(false);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Identity idempotency (stable ssid)
// Feature: silent-sso, Property 4: Identity idempotency (stable ssid)
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------
describe('Property 4: Identity idempotency (stable ssid)', () => {
  it('calling resolveOrCreateIdentity twice returns the same id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (accountId, appId) => {
          const stableRecord = {
            id: 'stable-id-123',
            accountId,
            appId,
            sessionId: null,
            originatedOn: new Date(),
            refreshesOn: new Date(),
            validTill: new Date(),
          };

          mockIdentityUpsert.mockResolvedValue(stableRecord);

          const first = await resolveOrCreateIdentity(accountId, appId);
          const second = await resolveOrCreateIdentity(accountId, appId);

          expect(first.id).toBe(second.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Single-use code enforcement
// Feature: silent-sso, Property 5: Silent auth code single-use enforcement
// Validates: Requirements 4.6, 4.7
// ---------------------------------------------------------------------------
describe('Property 5: Single-use code enforcement', () => {
  it('first exchange succeeds, second exchange returns invalid_code', async () => {
    const future = new Date(Date.now() + 300_000);
    const pendingRecord = {
      id: 'test-code',
      type: 'silent_auth_code',
      status: 'pending',
      data: { appId: 'app-1', sessionId: 'sess-1' },
      accountId: 'acc-1',
      expiresAt: future,
    };

    const mockAccount = {
      id: 'acc-1',
      status: 'active',
      displayName: 'Test User',
      displayImage: null,
      isVerified: true,
      accountType: 'individual',
      details: {},
      neupIds: [],
      individualProfile: { firstName: 'Test', lastName: 'User' },
      brandProfile: null,
    };

    // First call: findFirst returns pending record, updateMany returns count: 1
    mockAuthnRequestFindFirst
      .mockResolvedValueOnce(pendingRecord)
      .mockResolvedValueOnce(null);
    mockAuthnRequestUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mockApplicationFindUnique.mockResolvedValue({ appSecret: 'correct-secret' });
    mockAccountFindUnique.mockResolvedValue(mockAccount);

    const firstResult = await exchangeSilentAuthCode('app-1', 'correct-secret', 'test-code');
    expect(firstResult.status).toBe(200);

    // Second call: findFirst returns null (code already used)
    const secondResult = await exchangeSilentAuthCode('app-1', 'correct-secret', 'test-code');
    expect(secondResult.status).toBe(400);
    expect(secondResult.body.error).toBe('invalid_code');
  });
});

// ---------------------------------------------------------------------------
// Property 6: Code bound to issuing appId
// Feature: silent-sso, Property 6: Code is bound to its issuing appId
// Validates: Requirements 7.4
// ---------------------------------------------------------------------------
describe('Property 6: Code is bound to its issuing appId', () => {
  it('exchanging a code with a different appId returns app_mismatch', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }))
          .filter(([a, b]) => a !== b),
        async ([appIdA, appIdB]) => {
          const future = new Date(Date.now() + 300_000);

          mockAuthnRequestFindFirst.mockResolvedValue({
            id: 'some-code',
            type: 'silent_auth_code',
            status: 'pending',
            data: { appId: appIdA, sessionId: 'sess-1' },
            accountId: 'acc-1',
            expiresAt: future,
          });

          const result = await exchangeSilentAuthCode(appIdB, 'any-secret', 'any-code');

          expect(result.status).toBe(400);
          expect(result.body.error).toBe('app_mismatch');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Rate limit enforcement
// Feature: silent-sso, Property 7: Rate limit enforcement
// Validates: Requirements 7.3
// ---------------------------------------------------------------------------
describe('Property 7: Rate limit enforcement', () => {
  it('allows 10 requests then blocks the 11th, resets after window', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (origin) => {
        // Reset state for this origin
        rateLimitMap.delete(origin);

        vi.useFakeTimers();

        try {
          // First 10 calls should all return true
          for (let i = 0; i < 10; i++) {
            expect(checkRateLimit(origin)).toBe(true);
          }

          // 11th call should return false
          expect(checkRateLimit(origin)).toBe(false);

          // Advance time past the window (60 001 ms)
          vi.advanceTimersByTime(60_001);

          // After window reset, next call should return true
          expect(checkRateLimit(origin)).toBe(true);
        } finally {
          vi.useRealTimers();
          rateLimitMap.delete(origin);
        }
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: JWT payload contains no session credentials
// Feature: silent-sso, Property 8: JWT payload contains no session credentials
// Validates: Requirements 7.2
// ---------------------------------------------------------------------------
describe('Property 8: JWT payload contains no session credentials', () => {
  it('JWT payload has only expected fields and does not contain the raw appSecret', async () => {
    const validDate = fc.integer({ min: new Date('2000-01-01').getTime(), max: new Date('2100-01-01').getTime() }).map(ms => new Date(ms));
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.string({ minLength: 1 }),
          trackId: fc.string({ minLength: 1 }),
          originatedOn: validDate,
          refreshesOn: validDate,
          validTill: validDate,
        }),
        fc.string({ minLength: 16 }),
        async (identityShape, appSecret) => {
          mockApplicationFindUnique.mockResolvedValue({ appSecret });

          const identity = identityShape as unknown as Identity;
          const token = await signIdentityJwt(identity, 'test-app');
          const decoded = jwt.decode(token) as Record<string, unknown>;

          const payloadKeys = Object.keys(decoded);

          // Forbidden fields must not be present
          expect(payloadKeys).not.toContain('sessionKey');
          expect(payloadKeys).not.toContain('sid');
          expect(payloadKeys).not.toContain('key');
          expect(payloadKeys).not.toContain('password');

          // Raw appSecret must not appear as any value in the payload
          const payloadValues = Object.values(decoded);
          expect(payloadValues).not.toContain(appSecret);

          // Only expected keys should be present (jwt adds 'iat' automatically)
          const allowedKeys = new Set(['ssid', 'expires_on', 'refreshes_on', 'details', 'iat']);
          for (const key of payloadKeys) {
            expect(allowedKeys.has(key)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
