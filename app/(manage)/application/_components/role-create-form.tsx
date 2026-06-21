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
import { AuthzDefinitionSelector } from './authz-definition-selector';
import type { ApplicationAuthzDefinitionOption } from '@/services/applications/authz-config';

type Props = {
  appId: string;
  applicableForOptions: ApplicationAuthzDefinitionOption[];
};

export function RoleCreateForm({ appId, applicableForOptions }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('');
  const [applicableFor, setApplicableFor] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const handleSubmit = async () => {
    const roleTitle = name.trim();
    if (!roleTitle || !scope) return;

    setPending(true);
    const result = await createAppRole({
      appId,
      name: roleTitle,
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
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Role title, e.g. Viewer" />
      <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
      <RoleScopeSelector value={scope} onChange={setScope} />
      <AuthzDefinitionSelector
        label="Applicable for"
        description="Choose the configured applicable-for targets for this role."
        options={applicableForOptions}
        value={applicableFor}
        onChange={setApplicableFor}
        emptyLabel="No applicable-for definitions configured on the application configuration page."
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
