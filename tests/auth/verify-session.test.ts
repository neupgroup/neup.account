import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/core/database/prisma', () => ({
    default: {
        authnSession: { findUnique: vi.fn() },
    },
}));

import prisma from '@/core/database/prisma';
import { verifyActiveSession } from '@/services/auth/verify';

const mockFindUnique = prisma.authnSession.findUnique as ReturnType<typeof vi.fn>;

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
        mockFindUnique.mockResolvedValue(validSession);
        const result = await verifyActiveSession(validCookies);
        expect(result.valid).toBe(true);
        if (result.valid) expect(result.accountId).toBe('acc_1');
    });

    it('returns invalid when cookies are missing', async () => {
        const result = await verifyActiveSession({ accountId: '', sessionId: '', sessionKey: '' });
        expect(result.valid).toBe(false);
    });

    it('returns invalid when session is not found in DB', async () => {
        mockFindUnique.mockResolvedValue(null);
        expect((await verifyActiveSession(validCookies)).valid).toBe(false);
    });

    it('returns invalid when accountId does not match', async () => {
        mockFindUnique.mockResolvedValue({ ...validSession, accountId: 'different_acc' });
        expect((await verifyActiveSession(validCookies)).valid).toBe(false);
    });

    it('returns invalid when session key does not match', async () => {
        mockFindUnique.mockResolvedValue({ ...validSession, key: 'wrong_key' });
        expect((await verifyActiveSession(validCookies)).valid).toBe(false);
    });

    it('returns invalid when session is expired', async () => {
        mockFindUnique.mockResolvedValue({ ...validSession, validTill: past });
        expect((await verifyActiveSession(validCookies)).valid).toBe(false);
    });

    it('returns invalid when account is permanently blocked', async () => {
        mockFindUnique.mockResolvedValue({
            ...validSession,
            account: { status: 'blocked', details: { block: { is_permanent: true } } },
        });
        expect((await verifyActiveSession(validCookies)).valid).toBe(false);
    });

    it('returns invalid when account has a time-limited block that has not expired', async () => {
        mockFindUnique.mockResolvedValue({
            ...validSession,
            account: { status: 'blocked', details: { block: { until: future.toISOString() } } },
        });
        expect((await verifyActiveSession(validCookies)).valid).toBe(false);
    });

    it('returns valid when account block has already expired', async () => {
        mockFindUnique.mockResolvedValue({
            ...validSession,
            account: { status: 'blocked', details: { block: { until: past.toISOString() } } },
        });
        // Block expired — account should be treated as valid
        expect((await verifyActiveSession(validCookies)).valid).toBe(true);
    });

    it('returns invalid when DB throws', async () => {
        mockFindUnique.mockRejectedValue(new Error('DB error'));
        expect((await verifyActiveSession(validCookies)).valid).toBe(false);
    });
});
