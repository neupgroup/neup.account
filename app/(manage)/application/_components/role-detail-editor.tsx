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
import { isBuiltInApplicationManagementPermissionName } from '@/services/applications/permission-definitions';
import { AuthzDefinitionSelector } from './authz-definition-selector';
import type { ApplicationAuthzDefinitionOption } from '@/services/applications/authz-config';
import type { AuthzScopeLevel } from '@/services/applications/authz-scope-policy';
import { PermissionScopeBadges } from './permission-scope-badges';
import { RoleScopeSelector } from './scope-selectors';
import { ScopeForSelector, ScopeLevelSelector } from './authz-scope-policy-selector';

type Props = {
  appId: string;
  role: AppRole;
  permissions: AppPermission[];
  defaultRoleId: string | null;
  canManage: boolean;
  applicableForOptions: ApplicationAuthzDefinitionOption[];
};

export function RoleDetailEditor({
  appId,
  role,
  permissions,
  defaultRoleId: initialDefaultRoleId,
  canManage,
  applicableForOptions,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [description, setDescription] = useState(role.description ?? '');
  const [scope, setScope] = useState<string[]>(role.scope);
  const [scopeFor, setScopeFor] = useState(role.scopeFor);
  const [scopeLevel, setScopeLevel] = useState<AuthzScopeLevel[]>([role.scopeLevel]);
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
      scope,
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
        {permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {visiblePermissions.map((permission) => {
              const isChecked = selectedSet.has(permission.id);
              const isSystemPermission = appId === 'neup.account' && isBuiltInApplicationManagementPermissionName(permission.name);
              const isLockedSystemAssignment = isSystemRole && isSystemPermission;

              return (
                <label
                  key={permission.id}
                  className="group flex items-start gap-3 border-b px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/40 sm:px-5"
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={!canManage || isSystemRole}
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
                    <p className="truncate text-base font-medium leading-6">
                      {permission.name}
                      {isLockedSystemAssignment ? ' (Sys)' : ''}
                    </p>
                    {permission.description ? (
                      <p className="text-sm text-muted-foreground">
                        {permission.description}
                      </p>
                    ) : null}
                    <PermissionScopeBadges scope={permission.scope} className="mt-1 flex flex-wrap gap-1" />
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
              Role title is fixed after creation. Description, access mode, and applicable targets can be updated here.
            </p>
          </div>
          <Input value={role.name} disabled aria-label="Role title" />
          <RoleScopeSelector value={scope} onChange={setScope} disabled={!canManage || isSystemRole} />
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
          <Button onClick={handleSave} disabled={savePending || !canManage || isSystemRole}>
            {savePending ? 'Saving...' : 'Save Role'}
          </Button>
        </div>
      </Collapsible>
    </div>
  );
}
