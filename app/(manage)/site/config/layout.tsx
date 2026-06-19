import type { ReactNode } from 'react';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';

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
