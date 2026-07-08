import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module under test
vi.mock('@/core/helpers/prisma', () => ({
    default: {
        authnRequest: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

import prisma from '@/core/helpers/prisma';
import { getAuthRequest } from '@/services/auth/auth-request';

const mockFindUnique = prisma.authnRequest.findUnique as ReturnType<typeof vi.fn>;

const future = new Date(Date.now() + 60_000);
const past = new Date(Date.now() - 60_000);

const baseRequest = {
    id: 'req_1',
    type: 'signin',
    status: 'pending',
    data: {},
    accountId: 'acc_1',
    expiresAt: future,
    createdAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe('getAuthRequest', () => {
    it('returns the request when valid', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        const result = await getAuthRequest('req_1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('req_1');
    });

    it('returns null when request does not exist', async () => {
        mockFindUnique.mockResolvedValue(null);
        expect(await getAuthRequest('missing')).toBeNull();
    });

    it('returns null when request is expired', async () => {
        mockFindUnique.mockResolvedValue({ ...baseRequest, expiresAt: past });
        expect(await getAuthRequest('req_1')).toBeNull();
    });

    it('returns null when status is completed', async () => {
        mockFindUnique.mockResolvedValue({ ...baseRequest, status: 'completed' });
        expect(await getAuthRequest('req_1')).toBeNull();
    });

    it('returns null when status is used', async () => {
        mockFindUnique.mockResolvedValue({ ...baseRequest, status: 'used' });
        expect(await getAuthRequest('req_1')).toBeNull();
    });

    it('returns null when status is cancelled', async () => {
        mockFindUnique.mockResolvedValue({ ...baseRequest, status: 'cancelled' });
        expect(await getAuthRequest('req_1')).toBeNull();
    });

    it('returns null when expectedType does not match', async () => {
        mockFindUnique.mockResolvedValue({ ...baseRequest, type: 'signup' });
        expect(await getAuthRequest('req_1', { expectedType: 'signin' })).toBeNull();
    });

    it('returns the request when expectedType matches', async () => {
        mockFindUnique.mockResolvedValue(baseRequest);
        const result = await getAuthRequest('req_1', { expectedType: 'signin' });
        expect(result).not.toBeNull();
    });

    it('returns null when status not in expectedStatuses', async () => {
        mockFindUnique.mockResolvedValue({ ...baseRequest, status: 'pending_password' });
        expect(await getAuthRequest('req_1', { expectedStatuses: ['pending'] })).toBeNull();
    });

    it('returns the request when status is in expectedStatuses', async () => {
        mockFindUnique.mockResolvedValue({ ...baseRequest, status: 'pending_password' });
        const result = await getAuthRequest('req_1', { expectedStatuses: ['pending_password', 'pending'] });
        expect(result).not.toBeNull();
    });
});
