'use client';

/*
::neup.documentation::application-permission-detail-editor
::title Application Permission Detail Editor

Edits one application permission, including the `scope_for` / `scope_level` policy.

::public

Use this component from the application permission detail page to update or remove an existing permission without leaving the management flow.

::public end

::end
*/

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '#/core/hooks/useToast';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Textarea } from '#/components/ui/textarea';
import {
  deleteAppPermission,
  updateAppPermission,
  type AppPermission,
} from '@/services/applications/authz-manage';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { redirectInApp } from '@/.neup/core/helpers/link/navigation';
import { ScopeForSelector, ScopeLevelSelector } from './authz-scope-policy-selector';

type Props = {
  appId: string;
  permission: AppPermission;
  canManage: boolean;
  mode?: string;
};

export function PermissionDetailEditor({
  appId,
  permission,
  canManage,
  mode,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [description, setDescription] = useState(permission.description ?? '');
  const [scopeFor, setScopeFor] = useState(permission.scopeFor);
  const [scopeLevel, setScopeLevel] = useState(permission.scopeLevel);
  const [rules, setRules] = useState(permission.rules ?? '');
  const [status, setStatus] = useState(permission.status ?? '');
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const goBack = () => {
    redirectInApp(router, applicationHref('/application/permissions', appId, { mode }));
  };

  const handleSave = async () => {
    setSavePending(true);
    const result = await updateAppPermission({
      appId,
      permissionId: permission.id,
      description: description || undefined,
      scopeFor,
      scopeLevel,
      rules: rules || undefined,
      status: status || undefined,
    });
    setSavePending(false);

    if (!result.success || !result.permission) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update permission.' });
      return;
    }

    toast({ title: 'Permission updated' });
    router.refresh();
  };

  const handleDelete = async () => {
    setDeletePending(true);
    const result = await deleteAppPermission({ appId, permissionId: permission.id });
    setDeletePending(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not delete permission.' });
      return;
    }

    toast({ title: 'Permission removed' });
    goBack();
  };

  return (
    <>
      <div className="grid gap-4">
        <Textarea
          value={description}
          disabled={!canManage}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
        />
        <ScopeForSelector value={scopeFor} onChange={setScopeFor} disabled={!canManage} />
        <ScopeLevelSelector value={scopeLevel} onChange={setScopeLevel} disabled={!canManage} />
        <Input
          value={rules}
          disabled={!canManage}
          onChange={(event) => setRules(event.target.value)}
          placeholder="Rules (optional)"
        />
        <Input
          value={status}
          disabled={!canManage}
          onChange={(event) => setStatus(event.target.value)}
          placeholder="Status (optional)"
        />

        {showDeleteSection ? (
          <div className="grid gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <div>
              <p className="text-sm font-medium text-destructive">Delete permission</p>
              <p className="text-xs text-muted-foreground">
                Remove this permission from the application. Any roles using it will lose it.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteSection(false)}
                disabled={deletePending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deletePending}
              >
                {deletePending ? 'Deleting...' : 'Delete Permission'}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={goBack}>
            Back
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDeleteSection(true)}
            disabled={!canManage || deletePending}
          >
            Delete
          </Button>
          <Button type="button" onClick={handleSave} disabled={savePending || !canManage}>
            {savePending ? 'Saving...' : 'Save Permission'}
          </Button>
        </div>
      </div>
    </>
  );
}
