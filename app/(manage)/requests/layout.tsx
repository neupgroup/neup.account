import type { ReactNode } from 'react';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { permission } from '@/logica/permission';

const layoutPermissions = [
  permission('requests.root_approval.view', 'for_individual', 'layout'),
];

export default async function RequestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyPermission404(['requests.root_approval.view']);

  return children;
}
