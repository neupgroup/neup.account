'use client';

/*
::neup.documentation::application-role-create-form
::title Application Role Create Form

Creates a new application role with `scope_for`, `scope_level`, and applicable-for metadata.

::public

Use this form from the application role creation page to define a role before assigning permissions.

::public end

::end
*/

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '#/core/hooks/useToast';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { createAppRole } from '@/services/applications/authz-manage';
import { redirectInApp } from '@/.neup/core/helpers/link/navigation';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { AuthzDefinitionSelector } from './authz-definition-selector';
import type { ApplicationAuthzDefinitionOption } from '@/services/applications/authz-config';
import { ScopeForSelector, ScopeLevelSelector } from './authz-scope-policy-selector';
import type { AuthzScopeFor, AuthzScopeLevel } from '@/services/applications/authz-scope-policy';

type Props = {
  appId: string;
  applicableForOptions: ApplicationAuthzDefinitionOption[];
};

export function RoleCreateForm({ appId, applicableForOptions }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopeFor, setScopeFor] = useState<AuthzScopeFor[]>(['for_individual']);
  const [scopeLevel, setScopeLevel] = useState<AuthzScopeLevel[]>(['assignable.byTeam']);
  const [applicableFor, setApplicableFor] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const handleSubmit = async () => {
    const roleTitle = name.trim();
    if (!roleTitle) return;

    setPending(true);
    const result = await createAppRole({
      appId,
      name: roleTitle,
      description: description || undefined,
      scopeFor: [...scopeFor],
      scopeLevel: scopeLevel[0],
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
      <ScopeForSelector value={scopeFor} onChange={setScopeFor} />
      <ScopeLevelSelector value={scopeLevel} onChange={(value) => setScopeLevel([value[0] ?? 'assignable.byTeam'])} allowMultiple={false} />
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
        <Button onClick={handleSubmit} disabled={pending || !name.trim()}>
          {pending ? 'Creating...' : 'Create Role'}
        </Button>
      </div>
    </div>
  );
}
