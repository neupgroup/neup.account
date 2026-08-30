'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '#/core/hooks/useToast';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import { Loader2 } from '@/components/icons';
import { addUserApplicationAccess, updateUserApplicationPermissions } from '@/services/applications/access';
import { redirectInApp } from '@/.neup/core/helpers/link/navigation';

type ApplicationAccessFormProps = {
  mode: 'add' | 'edit';
  initialAppId?: string;
  initialPermissions?: string[];
};

function parsePermissions(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/g)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export function ApplicationAccessForm({ mode, initialAppId = '', initialPermissions = [] }: ApplicationAccessFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, startTransition] = useTransition();
  const [appId, setAppId] = useState(initialAppId);
  const [permissionsInput, setPermissionsInput] = useState(initialPermissions.join(', '));

  const title = useMemo(() => (mode === 'add' ? 'Add Application' : 'Edit Application Permissions'), [mode]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedAppId = appId.trim();
    if (!normalizedAppId) {
      toast({ variant: 'destructive', title: 'Missing App ID', description: 'Please enter an app ID.' });
      return;
    }

    const permissions = parsePermissions(permissionsInput);

    startTransition(async () => {
      const result = mode === 'add'
        ? await addUserApplicationAccess({ appId: normalizedAppId, permissions })
        : await updateUserApplicationPermissions({ appId: normalizedAppId, permissions });

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: mode === 'add' ? 'Failed to Add' : 'Failed to Update',
          description: result.error || 'Something went wrong.',
        });
        return;
      }

      toast({
        title: mode === 'add' ? 'Application Added' : 'Permissions Updated',
        description: mode === 'add' ? 'Application access is now connected.' : 'Application permissions were updated.',
      });

      redirectInApp(router, `/data/appconnection/${normalizedAppId}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="appId">Application ID</Label>
        <Input
          id="appId"
          value={appId}
          onChange={(event) => setAppId(event.target.value)}
          disabled={isSubmitting || mode === 'edit'}
          placeholder="neup.tourio"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="permissions">Permissions</Label>
        <Textarea
          id="permissions"
          value={permissionsInput}
          onChange={(event) => setPermissionsInput(event.target.value)}
          disabled={isSubmitting}
          placeholder="name.read, email.read"
        />
        <p className="text-xs text-muted-foreground">Use comma or new line separated permissions.</p>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : title}
      </Button>
    </form>
  );
}
