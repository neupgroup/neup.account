'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createAppRole } from '@/services/applications/authz-manage';
import { redirectInApp } from '@/core/helper/navigation';
import { ROLE_SCOPE_OPTIONS } from '@/services/role-scopes';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  appId: string;
};

export function RoleCreateForm({ appId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async () => {
    const roleName = name.trim();
    if (!roleName || !scope) return;

    setPending(true);
    const result = await createAppRole({
      appId,
      name: roleName,
      description: description || undefined,
      scope,
      permissionIds: [],
    });
    setPending(false);

    if (!result.success || !result.role) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not create role.' });
      return;
    }

    toast({ title: 'Role created' });
    redirectInApp(router, applicationHref(`/application/roles/${result.role.id}`, appId, { mode: 'root' }));
    router.refresh();
  };

  return (
    <div className="grid gap-4 rounded-2xl border bg-card p-5">
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Role name, e.g. viewer" />
      <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
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

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => redirectInApp(router, applicationHref('/application/roles', appId, { mode: 'root' }))}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={pending || !name.trim() || !scope}>
          {pending ? 'Creating...' : 'Create Role'}
        </Button>
      </div>
    </div>
  );
}
