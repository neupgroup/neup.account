'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  deleteAppRole,
  updateAppRolePermissions,
  type AppPermission,
  type AppRole,
} from '@/services/applications/authz-manage';

type Props = {
  appId: string;
  role: AppRole;
  permissions: AppPermission[];
};

export function RoleDetailEditor({ appId, role, permissions }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [permissionIds, setPermissionIds] = useState<string[]>(role.permissions.map((p) => p.id));
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const handleSave = async () => {
    setSavePending(true);
    const result = await updateAppRolePermissions({ appId, roleId: role.id, permissionIds });
    setSavePending(false);
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update role.' });
      return;
    }
    toast({ title: 'Role updated' });
    router.refresh();
  };

  const handleDelete = async () => {
    const ok = window.confirm(`Delete role "${role.name}"?`);
    if (!ok) return;
    setDeletePending(true);
    const result = await deleteAppRole({ appId, roleId: role.id });
    setDeletePending(false);
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not delete role.' });
      return;
    }
    toast({ title: 'Role deleted' });
    router.push(`/application/${appId}/roles?mode=root`);
    router.refresh();
  };

  return (
    <div className="grid gap-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-lg font-semibold">{role.name}</p>
          {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
          {role.scope && <Badge variant="outline">{role.scope}</Badge>}
        </div>
        <Button variant="ghost" onClick={handleDelete} disabled={deletePending}>
          {deletePending ? 'Removing...' : 'Remove Role'}
        </Button>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Permissions</p>
        {permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {permissions.map((permission) => (
              <label key={permission.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={permissionIds.includes(permission.id)}
                  onChange={() =>
                    setPermissionIds((prev) =>
                      prev.includes(permission.id)
                        ? prev.filter((id) => id !== permission.id)
                        : [...prev, permission.id]
                    )
                  }
                />
                <span>{permission.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/application/${appId}/roles?mode=root`)}>
          Back
        </Button>
        <Button onClick={handleSave} disabled={savePending}>
          {savePending ? 'Saving...' : 'Save Permissions'}
        </Button>
      </div>
    </div>
  );
}

