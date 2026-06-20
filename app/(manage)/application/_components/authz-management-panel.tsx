'use client';

import { type AppPermission, type AppRole } from '@/services/applications/authz-manage';
import { PermissionPanel } from '@/app/(manage)/application/_components/permission-panel';
import { RolesPanel } from '@/app/(manage)/application/_components/roles-panel';

type Props = {
  appId: string;
  initialPermissions: AppPermission[];
  initialRoles: AppRole[];
  hasWebhook: boolean;
  defaultRoleId?: string | null;
};

export function AuthzManagementPanel({
  appId,
  initialPermissions,
  initialRoles,
  hasWebhook,
  defaultRoleId = null,
}: Props) {
  return (
    <div className="grid gap-6">
      <PermissionPanel appId={appId} initialPermissions={initialPermissions} />
      <RolesPanel appId={appId} initialRoles={initialRoles} hasWebhook={hasWebhook} defaultRoleId={defaultRoleId} />
    </div>
  );
}
