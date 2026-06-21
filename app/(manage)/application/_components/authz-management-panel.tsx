'use client';

import { type AppPermission, type AppRole } from '@/services/applications/authz-manage';
import { PermissionPanel } from '@/app/(manage)/application/_components/permission-panel';
import { RolesPanel } from '@/app/(manage)/application/_components/roles-panel';
import type { ApplicationAuthzDefinitionOption } from '@/services/applications/authz-config';

type Props = {
  appId: string;
  initialPermissions: AppPermission[];
  initialRoles: AppRole[];
  canManage: boolean;
  canResetPush: boolean;
  hasWebhook: boolean;
  defaultRoleId?: string | null;
  definedScopeOptions?: ApplicationAuthzDefinitionOption[];
  allowMultipleDefinedScopes?: boolean;
  applicableForOptions?: ApplicationAuthzDefinitionOption[];
};

export function AuthzManagementPanel({
  appId,
  initialPermissions,
  initialRoles,
  canManage,
  canResetPush,
  hasWebhook,
  defaultRoleId = null,
  definedScopeOptions = [],
  allowMultipleDefinedScopes = false,
  applicableForOptions = [],
}: Props) {
  return (
    <div className="grid gap-6">
      <PermissionPanel
        appId={appId}
        initialPermissions={initialPermissions}
        canManage={canManage}
        definedScopeOptions={definedScopeOptions}
        allowMultipleDefinedScopes={allowMultipleDefinedScopes}
        applicableForOptions={applicableForOptions}
      />
      <RolesPanel
        appId={appId}
        initialRoles={initialRoles}
        hasWebhook={hasWebhook}
        defaultRoleId={defaultRoleId}
        canManage={canManage}
        canResetPush={canResetPush}
      />
    </div>
  );
}
