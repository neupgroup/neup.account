'use client';

/*
::neup.documentation::application-role-detail-editor
::title Application Role Detail Editor

Edits a role's permissions and metadata, including `scope_for` and `scope_level`.

::public

This component powers the role detail page where managers adjust permission membership, default-role state, and the role's scope policy.

::public end

::end
*/

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '#/core/hooks/useToast';
import { Button } from '#/components/ui/button';
import { Badge } from '#/components/ui/badge';
import { Input } from '#/components/ui/input';
import { Checkbox } from '#/components/ui/checkbox';
import {
  deleteAppRole,
  setAppDefaultRole,
  updateAppRole,
  type AppPermission,
  type AppRole,
} from '@/services/applications/authz-manage';
import { redirectInApp } from '@/.neup/core/helpers/link/navigation';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { isBuiltInApplicationManagementPermissionName } from '@/services/applications/permission-definitions';
import { AuthzDefinitionSelector } from './authz-definition-selector';
import type { ApplicationAuthzDefinitionOption } from '@/services/applications/authz-config';
import {
  AUTHZ_SCOPE_FOR_META,
  AUTHZ_SCOPE_LEVEL_META,
  getCompatibleRolePermissionScopePairs,
  type AuthzScopeLevel,
} from '@/services/applications/authz-scope-policy';
import { ScopeForSelector, ScopeLevelSelector } from './authz-scope-policy-selector';

type Props = {
  appId: string;
  role: AppRole;
  permissions: AppPermission[];
  defaultRoleId: string | null;
  canManage: boolean;
  applicableForOptions: ApplicationAuthzDefinitionOption[];
  mode?: string;
  editingInfo?: boolean;
};

export function RoleDetailEditor({
  appId,
  role,
  permissions,
  defaultRoleId: initialDefaultRoleId,
  canManage,
  applicableForOptions,
  mode,
  editingInfo = false,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [description, setDescription] = useState(role.description ?? '');
  const [scopeFor, setScopeFor] = useState(role.scopeFor);
  const [scopeLevel, setScopeLevel] = useState<AuthzScopeLevel[]>([role.scopeLevel]);
  const [applicableFor, setApplicableFor] = useState<string[]>(role.applicableFor);
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
  const activeScopeLevel = scopeLevel[0] ?? role.scopeLevel;

  const permissionCompatibility = useMemo(() => {
    return new Map(
      permissions.map((permission) => {
        const matchingPairs = getCompatibleRolePermissionScopePairs({
          roleScopeFor: scopeFor,
          roleScopeLevel: activeScopeLevel,
          permissionScopeFor: permission.scopeFor,
          permissionScopeLevels: permission.scopeLevel,
        });

        return [permission.id, matchingPairs.length > 0] as const;
      }),
    );
  }, [activeScopeLevel, permissions, scopeFor]);

  useEffect(() => {
    setPermissionIds((current) => current.filter((id) => permissionCompatibility.get(id) !== false));
  }, [permissionCompatibility]);

  const visiblePermissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = permissions.filter((permission) => {
      if (!query) return true;
      const haystack = `${permission.name} ${permission.description || ''}`.toLowerCase();
      return haystack.includes(query);
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [permissions, search]);

  const isDefaultRole = defaultRoleId === role.id;
  const isSystemRole = appId === 'neup.account' && (role.id === 'application.owner' || role.id === 'application.manage');

  const handleSave = async () => {
    setSavePending(true);
    const result = await updateAppRole({
      appId,
      roleId: role.id,
      description: description || undefined,
      scopeFor,
      scopeLevel: scopeLevel[0],
      applicableFor,
      permissionIds,
    });
    setSavePending(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update role.' });
      return;
    }

    toast({ title: 'Role updated' });
    redirectInApp(
      router,
      applicationHref(`/application/roles/${role.id}`, appId, mode ? { mode } : undefined),
    );
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
    redirectInApp(router, applicationHref('/application/roles', appId, mode ? { mode } : { mode: 'root' }));
  };

  if (editingInfo) {
    return (
      <div className="grid gap-3 rounded-2xl border bg-card p-5">
        <div>
          <p className="text-sm font-medium">Role details</p>
          <p className="text-xs text-muted-foreground">
            Role title is fixed after creation. Description, scope policy, and applicable targets can be updated here.
          </p>
        </div>
        <Input value={role.name} disabled aria-label="Role title" />
        <Input
          value={description}
          disabled={!canManage || isSystemRole}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
        />
        <ScopeForSelector value={scopeFor} onChange={setScopeFor} disabled={!canManage || isSystemRole} />
        <ScopeLevelSelector value={scopeLevel} onChange={(value) => setScopeLevel([value[0] ?? role.scopeLevel])} allowMultiple={false} disabled={!canManage || isSystemRole} />
        <AuthzDefinitionSelector
          label="Applicable for"
          description="Choose the configured applicable-for targets for this role."
          options={applicableForOptions}
          value={applicableFor}
          onChange={setApplicableFor}
          disabled={!canManage || isSystemRole}
          emptyLabel="No applicable-for definitions configured on the application configuration page."
        />
        {isSystemRole ? (
          <p className="text-xs text-muted-foreground">
            This is a system-managed role for the authz app and cannot be edited here.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="outlined"
            onClick={() => redirectInApp(router, applicationHref(`/application/roles/${role.id}`, appId, mode ? { mode } : undefined))}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={savePending || !canManage || isSystemRole}>
            {savePending ? 'Saving...' : 'Save Role'}
          </Button>
        </div>
      </div>
    );
  }

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
        {permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {visiblePermissions.map((permission) => {
              const isChecked = selectedSet.has(permission.id);
              const isSystemPermission = appId === 'neup.account' && isBuiltInApplicationManagementPermissionName(permission.name);
              const isLockedSystemAssignment = isSystemRole && isSystemPermission;
              const isCompatible = permissionCompatibility.get(permission.id) !== false;
              const isDisabled = !canManage || isSystemRole || !isCompatible;

              return (
                <label
                  key={permission.id}
                  className={`group flex items-start gap-3 border-b px-4 py-4 transition-colors last:border-b-0 sm:px-5 ${
                    isDisabled
                      ? 'cursor-not-allowed bg-muted/10 text-muted-foreground'
                      : 'cursor-pointer hover:bg-muted/40'
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={isDisabled}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`truncate text-base font-medium leading-6 ${isDisabled ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {permission.name}
                        {isLockedSystemAssignment ? ' (Sys)' : ''}
                      </p>
                    </div>
                    {permission.description ? (
                      <p className="text-sm text-muted-foreground">
                        {permission.description}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {permission.scopeFor.map((value) => (
                        <Badge key={value} variant="outline" className={`text-xs ${isDisabled ? 'opacity-70' : ''}`}>
                          {AUTHZ_SCOPE_FOR_META[value]?.label ?? value}
                        </Badge>
                      ))}
                      {permission.scopeLevel.map((value) => (
                        <Badge key={value} variant="outline" className={`text-xs ${isDisabled ? 'opacity-70' : ''}`}>
                          {AUTHZ_SCOPE_LEVEL_META[value]?.label ?? value}
                        </Badge>
                      ))}
                    </div>
                    {!isCompatible ? (
                      <p className="text-xs text-muted-foreground">
                        This permission cannot be selected because its scope_for / scope_level does not match this role.
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
            htmlType="button"
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
          <Button htmlType="button" type="solid" convey="danger" onClick={handleDelete} disabled={deletePending || !canManage || isSystemRole}>
            {deletePending ? 'Deleting...' : 'Delete Role'}
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="outlined" onClick={() => redirectInApp(router, applicationHref('/application/roles', appId, mode ? { mode } : { mode: 'root' }))}>
          Back
        </Button>
        <Button
          htmlType="button"
          type="outlined"
          onClick={() => redirectInApp(router, applicationHref(`/application/roles/${role.id}/edit`, appId, mode ? { mode } : undefined))}
        >
          Edit info
        </Button>
        <Button onClick={handleSave} disabled={savePending || !canManage || isSystemRole}>
          {savePending ? 'Saving...' : 'Save Role'}
        </Button>
      </div>
    </div>
  );
}
