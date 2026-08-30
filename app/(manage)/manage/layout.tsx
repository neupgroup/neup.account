import type { ReactNode } from 'react';
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { permission } from '@/.neup/logica/permission';

const layoutPermissions = [
  permission('root.account.view', 'for_individual', 'layout'),
];

export default async function ManageLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyPermission404(['root.account.view']);

  return children;
}
