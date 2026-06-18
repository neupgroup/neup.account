import type { ReactNode } from 'react';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';

export default async function RequestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyPermission404(['requests.root_approval.view']);

  return children;
}
