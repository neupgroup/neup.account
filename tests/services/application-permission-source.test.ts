import { describe, expect, it, vi } from 'vitest';

vi.mock('@neup/core/database/prisma', () => ({ default: {} }));
import { resolvePermissionSourceId } from '@/services/applications/permission-source';

function database(sources: Record<string, string | null>) {
  return {
    application: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id in sources ? { usePermissionFrom: sources[where.id] } : null,
      ),
    },
  } as unknown as Parameters<typeof resolvePermissionSourceId>[1];
}

describe('application permission source', () => {
  it('uses local definitions when no source is selected', async () => {
    await expect(resolvePermissionSourceId('local', database({ local: null }))).resolves.toBe('local');
  });
  it('resolves multiple consumers to the same definitions', async () => {
    const db = database({ first: 'source', second: 'source', source: null });
    await expect(resolvePermissionSourceId('first', db)).resolves.toBe('source');
    await expect(resolvePermissionSourceId('second', db)).resolves.toBe('source');
  });
  it('follows existing chains without falling back to local definitions', async () => {
    await expect(resolvePermissionSourceId('a', database({ a: 'b', b: 'c', c: null }))).resolves.toBe('c');
  });
  it.each<Record<string, string | null>>([{ a: 'a' }, { a: 'b', b: 'a' }])('rejects cyclic references', async (sources) => {
    await expect(resolvePermissionSourceId('a', database(sources))).rejects.toThrow('cycle');
  });
  it('fails closed if a source is missing', async () => {
    await expect(resolvePermissionSourceId('a', database({ a: 'missing' }))).rejects.toThrow('not found');
  });
});
