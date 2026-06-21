'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createAppRole } from '@/services/applications/authz-manage';
import { redirectInApp } from '@/core/helper/navigation';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { RoleScopeSelector } from './scope-selectors';
import { StringTagInput } from './string-tag-input';

type Props = {
  appId: string;
};

export function RoleCreateForm({ appId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('');
  const [applicableFor, setApplicableFor] = useState<string[]>([]);
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
      applicableFor,
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
      <RoleScopeSelector value={scope} onChange={setScope} />
      <StringTagInput
        label="Applicable for"
        value={applicableFor}
        onChange={setApplicableFor}
        placeholder="application"
        hint='Custom string tags such as "application", "portfolio", or "account.brand".'
      />

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
