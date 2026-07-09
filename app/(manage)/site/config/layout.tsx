import type { ReactNode } from 'react';
import { requireAnyPermission404 } from '@/logica/account/permission-guards';
import { permission } from '@/logica/permission';

const layoutPermissions = [
  permission('root.payment_config.view', 'for_individual', 'layout'),
  permission('root.display_images.view', 'for_individual', 'layout'),
];

export default async function SiteConfigLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyPermission404([
    'root.payment_config.view',
    'root.display_images.view',
  ]);

  return children;
}
