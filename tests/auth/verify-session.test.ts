import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/core/helpers/prisma', () => ({
    default: {
        authnSession: { findUnique: vi.fn() },
    },
}));

vi.mock('@/core/auth/cookies', () => ({
    getSessionCookies: vi.fn(),
}));

import prisma from '@/core/helpers/prisma';
import { getSessionCookies } from '@/core/auth/cookies';
import { verifyActiveSession } from '@/services/auth/verify';

const mockFindUnique = prisma.authnSession.findUnique as ReturnType<typeof vi.fn>;
const mockGetSessionCookies = getSessionCookies as ReturnType<typeof vi.fn>;

const future = new Date(Date.now() + 60_000);
const past = new Date(Date.now() - 60_000);

const validCookies = { accountId: 'acc_1', sessionId: 'sess_1', sessionKey: 'key_1' };
const validSession = {
    accountId: 'acc_1',
    key: 'key_1',
    validTill: future,
    account: { status: 'active', details: null },
};

beforeEach(() => vi.clearAllMocks());

describe('verifyActiveSession', () => {
    it('returns valid when session is active and account is not blocked', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockResolvedValue(validSession);
        const result = await verifyActiveSession();
        expect(result.valid).toBe(true);
        if (result.valid) expect(result.accountId).toBe('acc_1');
    });

    it('returns invalid when cookies are missing', async () => {
        mockGetSessionCookies.mockResolvedValue({ accountId: '', sessionId: '', sessionKey: '' });
        const result = await verifyActiveSession();
        expect(result.valid).toBe(false);
    });

    it('returns invalid when session is not found in DB', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockResolvedValue(null);
        expect((await verifyActiveSession()).valid).toBe(false);
    });

    it('returns invalid when accountId does not match', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockResolvedValue({ ...validSession, accountId: 'different_acc' });
        expect((await verifyActiveSession()).valid).toBe(false);
    });

    it('returns invalid when session key does not match', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockResolvedValue({ ...validSession, key: 'wrong_key' });
        expect((await verifyActiveSession()).valid).toBe(false);
    });

    it('returns invalid when session is expired', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockResolvedValue({ ...validSession, validTill: past });
        expect((await verifyActiveSession()).valid).toBe(false);
    });

    it('returns invalid when account is permanently blocked', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockResolvedValue({
            ...validSession,
            account: { status: 'blocked', details: { block: { is_permanent: true } } },
        });
        expect((await verifyActiveSession()).valid).toBe(false);
    });

    it('returns invalid when account has a time-limited block that has not expired', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockResolvedValue({
            ...validSession,
            account: { status: 'blocked', details: { block: { until: future.toISOString() } } },
        });
        expect((await verifyActiveSession()).valid).toBe(false);
    });

    it('returns valid when account block has already expired', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockResolvedValue({
            ...validSession,
            account: { status: 'blocked', details: { block: { until: past.toISOString() } } },
        });
        // Block expired — account should be treated as valid
        expect((await verifyActiveSession()).valid).toBe(true);
    });

    it('returns invalid when DB throws', async () => {
        mockGetSessionCookies.mockResolvedValue(validCookies);
        mockFindUnique.mockRejectedValue(new Error('DB error'));
        expect((await verifyActiveSession()).valid).toBe(false);
    });
});
