'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createAppRole, type AppPermission } from '@/services/applications/authz-manage';
import { redirectInApp } from '@/services/navigation';

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

  const handleSubmit = async () => {
    const roleName = name.trim();
    if (!roleName) return;
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
      <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Scope (optional)" />

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

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => redirectInApp(router, `/application/${appId}/roles?mode=root`)}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={pending || !name.trim()}>
          {pending ? 'Creating...' : 'Create Role'}
        </Button>
      </div>
    </div>
  );
}
