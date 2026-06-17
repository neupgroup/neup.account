'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  deleteAppRole,
  setAppDefaultRole,
  updateAppRole,
  type AppPermission,
  type AppRole,
} from '@/services/applications/authz-manage';
import { redirectInApp } from '@/core/helper/navigation';
import { ROLE_SCOPE_OPTIONS, isKnownRoleScope } from '@/services/role-scopes';

type Props = {
  appId: string;
  role: AppRole;
  permissions: AppPermission[];
  defaultRoleId: string | null;
};

export function RoleDetailEditor({ appId, role, permissions, defaultRoleId: initialDefaultRoleId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [scope, setScope] = useState(isKnownRoleScope(role.scope) ? role.scope : '');
  const [infoOpen, setInfoOpen] = useState(false);
  const [permissionIds, setPermissionIds] = useState<string[]>(() => {
    const idsFromRole = role.permissions
      .map((p) => p.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const namesFromRole = new Set(
      role.permissions
        .map((p) => p.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
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
    const q = search.trim().toLowerCase();
    const filtered = permissions.filter((permission) => {
      if (!q) return true;
      const haystack = `${permission.name} ${permission.description || ''}`.toLowerCase();
      return haystack.includes(q);
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [permissions, search, selectedSet]);

  const selectedCount = permissionIds.length;
  const isDefaultRole = defaultRoleId === role.id;

  const handleSave = async () => {
    setSavePending(true);
    const result = await updateAppRole({
      appId,
      roleId: role.id,
      name,
      description: description || undefined,
      scope: scope || undefined,
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
    redirectInApp(router, `/application/${appId}/roles?mode=root`);
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
          Selected: {selectedCount} of {permissions.length}
        </p>
        {permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {visiblePermissions.map((permission) => {
              const isChecked = selectedSet.has(permission.id);
              return (
                <label
                  key={permission.id}
                  className="group flex cursor-pointer items-start gap-3 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() =>
                      setPermissionIds((prev) =>
                        prev.includes(permission.id)
                          ? prev.filter((id) => id !== permission.id)
                          : [...prev, permission.id]
                      )
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium leading-6">{permission.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {permission.description || 'No description'}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {!infoOpen ? (
        <>
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
                disabled={defaultPending}
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
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={deletePending}>
                {deletePending ? 'Deleting...' : 'Delete Role'}
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {infoOpen ? (
        <div className="grid gap-3 rounded-2xl border bg-card p-5">
          <div>
            <p className="text-sm font-medium">Role details</p>
            <p className="text-xs text-muted-foreground">
              Edit the role name, description, and scope while managing its permissions.
            </p>
          </div>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Role name, e.g. viewer"
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
          />
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            required
          >
            <option value="" disabled>Choose role scope</option>
            {ROLE_SCOPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => redirectInApp(router, `/application/${appId}/roles?mode=root`)}>
          Back
        </Button>
        <Button type="button" variant="outline" onClick={() => setInfoOpen((open) => !open)}>
          {infoOpen ? 'Hide Info' : 'Edit Info'}
        </Button>
        <Button onClick={handleSave} disabled={savePending || !name.trim() || !scope.trim()}>
          {savePending ? 'Saving...' : 'Save Role'}
        </Button>
      </div>
    </div>
  );
}
