'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createAppRole, type AppPermission } from '@/services/applications/authz-manage';
import { redirectInApp } from '@/core/helper/navigation';
import { ROLE_SCOPE_OPTIONS } from '@/services/role-scopes';
import {
  getCompatibleRoleScopesForPermissionScopes,
  getRoleScopeCompatibilityError,
  isPermissionScopeAllowedForRoleScope,
} from '@/services/applications/role-scope-compatibility';

type Props = {
  appId: string;
  permissions: AppPermission[];
};

export function RoleCreateForm({ appId, permissions }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('');
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const hasUsableScope = (value: string | null | undefined) => typeof value === 'string' && value.trim().length > 0;
  const selectedPermissions = useMemo(
    () => permissions.filter((permission) => permissionIds.includes(permission.id)),
    [permissionIds, permissions],
  );
  const compatibleRoleScopes = useMemo(
    () => getCompatibleRoleScopesForPermissionScopes(selectedPermissions.map((permission) => permission.scope)),
    [selectedPermissions],
  );
  const compatibleRoleScopeSet = useMemo(() => new Set(compatibleRoleScopes), [compatibleRoleScopes]);
  const scopeCompatibilityError = useMemo(
    () => getRoleScopeCompatibilityError(scope, selectedPermissions.map((permission) => permission.scope)),
    [scope, selectedPermissions],
  );

  const handleSubmit = async () => {
    const roleName = name.trim();
    if (!roleName || scopeCompatibilityError) return;
    setPending(true);
    const result = await createAppRole({
      appId,
      name: roleName,
      description: description || undefined,
      scope: scope || undefined,
      permissionIds,
    });
    setPending(false);

    if (!result.success || !result.role) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not create role.' });
      return;
    }

    toast({ title: 'Role created' });
    redirectInApp(router, `/application/${appId}/roles/${result.role.id}?mode=root`);
    router.refresh();
  };

  return (
    <div className="grid gap-4 rounded-2xl border bg-card p-5">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name, e.g. viewer" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        required
      >
        <option value="" disabled>Choose role scope</option>
        {ROLE_SCOPE_OPTIONS.map((option) => (
          <option key={option} value={option} disabled={!compatibleRoleScopeSet.has(option)}>
            {option}
          </option>
        ))}
      </select>
      {scopeCompatibilityError ? (
        <p className="text-xs text-destructive">{scopeCompatibilityError}</p>
      ) : null}

      <div className="grid gap-2">
        <p className="text-sm font-medium">Permissions</p>
        {permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {permissions.map((permission) => {
              const isChecked = permissionIds.includes(permission.id);
              const canUsePermission = hasUsableScope(permission.scope) && (isChecked || !scope || isPermissionScopeAllowedForRoleScope(permission.scope, scope));

              return (
                <label key={permission.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${canUsePermission ? '' : 'opacity-60'}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!canUsePermission}
                    onChange={() =>
                      setPermissionIds((prev) =>
                        prev.includes(permission.id)
                          ? prev.filter((id) => id !== permission.id)
                          : [...prev, permission.id]
                      )
                    }
                  />
                  <span>{permission.name}</span>
                  {permission.scope ? (
                    <Badge variant="secondary" className="text-xs">
                      {permission.scope}
                    </Badge>
                  ) : null}
                  {!hasUsableScope(permission.scope) ? (
                    <span className="text-xs text-muted-foreground">(missing scope)</span>
                  ) : scope && !isChecked && !isPermissionScopeAllowedForRoleScope(permission.scope, scope) ? (
                    <span className="text-xs text-muted-foreground">(not allowed for selected role scope)</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => redirectInApp(router, `/application/${appId}/roles?mode=root`)}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={pending || !name.trim() || !scope || !!scopeCompatibilityError}>
          {pending ? 'Creating...' : 'Create Role'}
        </Button>
      </div>
    </div>
  );
}
