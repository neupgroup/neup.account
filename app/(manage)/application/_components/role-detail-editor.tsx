'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  deleteAppRole,
  setAppDefaultRole,
  updateAppRole,
  type AppPermission,
  type AppRole,
} from '@/services/applications/authz-manage';
import { redirectInApp } from '@/core/helper/navigation';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { getRoleScopeCompatibilityError, isPermissionScopeAllowedForRoleScope } from '@/services/applications/role-scope-compatibility';
import { isBuiltInApplicationManagementPermissionName } from '@/services/applications/permission-definitions';
import { StringTagInput } from './string-tag-input';

type Props = {
  appId: string;
  role: AppRole;
  permissions: AppPermission[];
  defaultRoleId: string | null;
  canManage: boolean;
};

export function RoleDetailEditor({ appId, role, permissions, defaultRoleId: initialDefaultRoleId, canManage }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [description, setDescription] = useState(role.description ?? '');
  const [applicableFor, setApplicableFor] = useState<string[]>(role.applicableFor);
  const [showDetailsEditor, setShowDetailsEditor] = useState(false);
  const [permissionIds, setPermissionIds] = useState<string[]>(() => {
    const idsFromRole = role.permissions
      .map((permission) => permission.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const namesFromRole = new Set(
      role.permissions
        .map((permission) => permission.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0),
    );

    const idsFromNames = permissions
      .filter((permission) => namesFromRole.has(permission.name))
      .map((permission) => permission.id);

    return Array.from(new Set([...idsFromRole, ...idsFromNames]));
  });
  const [search, setSearch] = useState('');
  const [savePending, setSavePending] = useState(false);
  const [defaultRoleId, setDefaultRoleId] = useState<string | null>(initialDefaultRoleId);
  const [defaultPending, setDefaultPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const selectedSet = useMemo(() => new Set(permissionIds), [permissionIds]);
  const selectedPermissions = useMemo(
    () => permissions.filter((permission) => selectedSet.has(permission.id)),
    [permissions, selectedSet],
  );
  const scopeCompatibilityError = useMemo(
    () => getRoleScopeCompatibilityError(role.scope, selectedPermissions.map((permission) => permission.scope)),
    [role.scope, selectedPermissions],
  );

  const visiblePermissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = permissions.filter((permission) => {
      const isChecked = selectedSet.has(permission.id);
      const isScopeCompatible = isPermissionScopeAllowedForRoleScope(permission.scope, role.scope);
      if (!isChecked && !isScopeCompatible) return false;

      if (!query) return true;
      const haystack = `${permission.name} ${permission.description || ''}`.toLowerCase();
      return haystack.includes(query);
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [permissions, role.scope, search, selectedSet]);

  const isDefaultRole = defaultRoleId === role.id;
  const isSystemRole = appId === 'neup.account' && (role.id === 'application.owner' || role.id === 'application.manage');

  const handleSave = async () => {
    if (scopeCompatibilityError) return;

    setSavePending(true);
    const result = await updateAppRole({
      appId,
      roleId: role.id,
      description: description || undefined,
      applicableFor,
      permissionIds,
    });
    setSavePending(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update role.' });
      return;
    }

    toast({ title: 'Role updated' });
    router.refresh();
  };

  const handleDefaultRole = async () => {
    setDefaultPending(true);
    const result = await setAppDefaultRole({ appId, roleId: isDefaultRole ? null : role.id });
    setDefaultPending(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not set default role.' });
      return;
    }

    setDefaultRoleId(isDefaultRole ? null : role.id);
    toast({ title: 'Default role updated' });
    router.refresh();
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete the role "${role.name}"?\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    setDeletePending(true);
    const result = await deleteAppRole({ appId, roleId: role.id });
    setDeletePending(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not delete role.' });
      return;
    }

    toast({ title: 'Role deleted' });
    redirectInApp(router, applicationHref('/application/roles', appId, { mode: 'root' }));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 rounded-2xl bg-card">
        <Input
          placeholder="Search permissions..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Selected: {permissionIds.length} of {permissions.length}
        </p>
        {scopeCompatibilityError ? (
          <p className="text-xs text-destructive">{scopeCompatibilityError}</p>
        ) : null}
        {permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {visiblePermissions.map((permission) => {
              const isChecked = selectedSet.has(permission.id);
              const isScopeCompatible = isPermissionScopeAllowedForRoleScope(permission.scope, role.scope);
              const canAddPermission = isChecked || isScopeCompatible;
              const isInvalidSelectedPermission = isChecked && !isScopeCompatible;
              const isSystemPermission = appId === 'neup.account' && isBuiltInApplicationManagementPermissionName(permission.name);
              const isLockedSystemAssignment = isSystemRole && isSystemPermission;

              return (
                <label
                  key={permission.id}
                  className={`group flex items-start gap-3 border-b px-4 py-4 transition-colors last:border-b-0 sm:px-5 ${
                    canAddPermission ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={!canManage || !canAddPermission || isSystemRole}
                    onCheckedChange={() =>
                      setPermissionIds((prev) =>
                        prev.includes(permission.id)
                          ? prev.filter((id) => id !== permission.id)
                          : [...prev, permission.id],
                      )
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className={`truncate text-base font-medium leading-6 ${isInvalidSelectedPermission ? 'text-destructive' : ''}`}>
                      {permission.name}
                      {isLockedSystemAssignment ? ' (Sys)' : ''}
                    </p>
                    {permission.description ? (
                      <p className="text-sm text-muted-foreground">
                        {permission.description}
                      </p>
                    ) : null}
                    {!canAddPermission ? (
                      <p className="text-xs text-muted-foreground">
                        This permission does not include the role scope level required by this role.
                      </p>
                    ) : null}
                    {isInvalidSelectedPermission ? (
                      <p className="text-xs text-destructive">
                        This selected permission no longer belongs to this role scope.
                      </p>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-3 rounded-2xl border bg-card p-5">
        <div>
          <p className="text-sm font-medium">Default role</p>
          <p className="text-xs text-muted-foreground">
            {isDefaultRole
              ? 'New application connections are created with this role.'
              : 'Make this the role used when new application connections are created.'}
          </p>
        </div>
        <div>
          <Button
            type="button"
            variant={isDefaultRole ? 'outline' : 'secondary'}
            onClick={handleDefaultRole}
            disabled={defaultPending || !canManage}
          >
            {defaultPending ? 'Saving...' : isDefaultRole ? 'Clear Default' : 'Set Default'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-destructive/30 bg-card p-5">
        <div>
          <p className="text-sm font-medium text-destructive">Delete role</p>
          <p className="text-xs text-muted-foreground">
            Remove this role from the application. This action cannot be undone.
          </p>
        </div>
        <div>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deletePending || !canManage || isSystemRole}>
            {deletePending ? 'Deleting...' : 'Delete Role'}
          </Button>
        </div>
      </div>

      <Collapsible open={showDetailsEditor} onOpenChange={setShowDetailsEditor} className="grid gap-3">
        <CollapsibleContent className="grid gap-3 rounded-2xl border bg-card p-5">
          <div>
            <p className="text-sm font-medium">Role details</p>
            <p className="text-xs text-muted-foreground">
              Role name is fixed after creation. Only the description and applicable targets can be updated here.
            </p>
          </div>
          <Input value={role.name} disabled aria-label="Role name" />
          <Input
            value={description}
            disabled={!canManage || isSystemRole}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
          />
          <StringTagInput
            label="Applicable for"
            value={applicableFor}
            onChange={setApplicableFor}
            disabled={!canManage || isSystemRole}
            placeholder="application"
            hint='Custom string tags such as "application", "portfolio", "account", or "account.brand".'
          />
          {isSystemRole ? (
            <p className="text-xs text-muted-foreground">
              This is a system-managed role for the authz app and cannot be edited here.
            </p>
          ) : null}
        </CollapsibleContent>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => redirectInApp(router, applicationHref('/application/roles', appId, { mode: 'root' }))}>
            Back
          </Button>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline">
              {showDetailsEditor ? 'Hide info' : 'Edit info'}
            </Button>
          </CollapsibleTrigger>
          <Button onClick={handleSave} disabled={savePending || !!scopeCompatibilityError || !canManage || isSystemRole}>
            {savePending ? 'Saving...' : 'Save Role'}
          </Button>
        </div>
      </Collapsible>
    </div>
  );
}
