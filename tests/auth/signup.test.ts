import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/core/helpers/prisma', () => ({
    default: {
        authnRequest: { findUnique: vi.fn(), update: vi.fn() },
        neupId: { findUnique: vi.fn() },
        account: { count: vi.fn(), create: vi.fn() },
        permit: { create: vi.fn() },
    },
}));

vi.mock('@/services/log-actions', () => ({ logActivity: vi.fn() }));
vi.mock('@/core/helpers/logger', () => ({ logError: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => ({ get: vi.fn(() => null) })) }));
vi.mock('@/services/auth/session', () => ({ makeSession: vi.fn().mockResolvedValue({ success: true }) }));

import prisma from '@/core/helpers/prisma';
import {
    submitNameStep,
    submitNeupIdStep,
    submitPasswordStep,
} from '@/services/auth/signup/index';

const mockFindUnique = prisma.authnRequest.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.authnRequest.update as ReturnType<typeof vi.fn>;
const mockNeupIdFindUnique = prisma.neupId.findUnique as ReturnType<typeof vi.fn>;

const future = new Date(Date.now() + 60_000);
const baseRequest = { id: 'req_1', type: 'signup', status: 'pending', data: {}, accountId: null, expiresAt: future, createdAt: new Date() };

beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
});

describe('submitNameStep', () => {
    it('returns error when authRequestId is missing', async () => {
        const result = await submitNameStep('', { firstName: 'John', lastName: 'Doe' });
        expect(result.success).toBe(false);
    });

    it('returns error when session is expired', async () => {
        mockFindUnique.mockResolvedValue(null);
        const result = await submitNameStep('req_1', { firstName: 'John', lastName: 'Doe' });
        expect(result.success).toBe(false);
        expect(result.error).toBe('Timeout Error: Exceeded the time for SignUp.');
    });

    it('returns success with valid name data', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        const result = await submitNameStep('req_1', { firstName: 'John', lastName: 'Doe' });
        expect(result.success).toBe(true);
    });

    it('trims and normalises whitespace in name fields', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        await submitNameStep('req_1', { firstName: '  John  ', lastName: '  Doe  ' });
        const updateCall = mockUpdate.mock.calls[0][0];
        expect(updateCall.data.data.nameFirst).toBe('John');
        expect(updateCall.data.data.nameLast).toBe('Doe');
    });

    it('returns validation error when firstName is missing', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        const result = await submitNameStep('req_1', { firstName: '', lastName: 'Doe' });
        expect(result.success).toBe(false);
    });
});

describe('submitNeupIdStep', () => {
    it('returns error when NeupID is already taken', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        mockNeupIdFindUnique.mockResolvedValue({ id: 'taken.id', accountId: 'acc_other' });
        const result = await submitNeupIdStep('req_1', { neupId: 'taken.id' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/taken/i);
    });

    it('returns success when NeupID is available', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        mockNeupIdFindUnique.mockResolvedValue(null);
        const result = await submitNeupIdStep('req_1', { neupId: 'available.id' });
        expect(result.success).toBe(true);
    });

    it('lowercases the NeupID before saving', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        mockNeupIdFindUnique.mockResolvedValue(null);
        await submitNeupIdStep('req_1', { neupId: 'MyNeupID' });
        const updateCall = mockUpdate.mock.calls[0][0];
        expect(updateCall.data.data.neupId).toBe('myneupid');
    });
});

describe('submitPasswordStep', () => {
    it('returns error when password is too short', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        const result = await submitPasswordStep('req_1', { password: 'short' });
        expect(result.success).toBe(false);
    });

    it('returns success with a valid password', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        const result = await submitPasswordStep('req_1', { password: 'ValidPassword123!' });
        expect(result.success).toBe(true);
    });

    it('stores a bcrypt hash, not the plaintext password', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        await submitPasswordStep('req_1', { password: 'ValidPassword123!' });
        const updateCall = mockUpdate.mock.calls[0][0];
        const storedPassword = updateCall.data.data.password;
        expect(storedPassword).not.toBe('ValidPassword123!');
        expect(storedPassword).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
    });
});
