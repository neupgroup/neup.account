import type { ReactNode } from 'react';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';

export default async function ManageLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyPermission404(['root.account.view']);

  return children;
}
