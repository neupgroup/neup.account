'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [acquisitionType, setAcquisitionType] = useState<'assignment' | 'public_request' | 'invitation' | 'system_generated'>('assignment');
  const [approvalPolicy, setApprovalPolicy] = useState<'none' | 'approval_required'>('none');
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
      acquisitionType,
      approvalPolicy,
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
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={acquisitionType} onValueChange={(value) => setAcquisitionType(value as typeof acquisitionType)}>
          <SelectTrigger>
            <SelectValue placeholder="Acquisition type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="assignment">assignment</SelectItem>
            <SelectItem value="public_request">public_request</SelectItem>
            <SelectItem value="invitation">invitation</SelectItem>
            <SelectItem value="system_generated">system_generated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={approvalPolicy} onValueChange={(value) => setApprovalPolicy(value as typeof approvalPolicy)}>
          <SelectTrigger>
            <SelectValue placeholder="Approval policy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">none</SelectItem>
            <SelectItem value="approval_required">approval_required</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
