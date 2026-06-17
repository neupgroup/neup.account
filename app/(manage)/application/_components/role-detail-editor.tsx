'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  updateAppRole,
  type AppPermission,
  type AppRole,
} from '@/services/applications/authz-manage';
import { redirectInApp } from '@/core/helper/navigation';

type Props = {
  appId: string;
  role: AppRole;
  permissions: AppPermission[];
};

export function RoleDetailEditor({ appId, role, permissions }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [scope, setScope] = useState(role.scope || 'application');
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

  return (
    <div className="grid gap-4">
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
        <Input
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          placeholder="Scope, e.g. application"
        />
      </div>

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

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => redirectInApp(router, `/application/${appId}/roles?mode=root`)}>
          Back
        </Button>
        <Button onClick={handleSave} disabled={savePending || !name.trim() || !scope.trim()}>
          {savePending ? 'Saving...' : 'Save Role'}
        </Button>
      </div>
    </div>
  );
}
