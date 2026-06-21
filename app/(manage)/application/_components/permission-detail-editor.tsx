'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  deleteAppPermission,
  updateAppPermission,
  type AppPermission,
  type PermissionScopeImpactRole,
} from '@/services/applications/authz-manage';
import { AuthzDefinitionSelector } from './authz-definition-selector';
import type { ApplicationAuthzDefinitionOption } from '@/services/applications/authz-config';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { redirectInApp } from '@/core/helper/navigation';

type Props = {
  appId: string;
  permission: AppPermission;
  canManage: boolean;
  mode?: string;
  allowMultipleDefinedScopes: boolean;
  definedScopeOptions: ApplicationAuthzDefinitionOption[];
  applicableForOptions: ApplicationAuthzDefinitionOption[];
};

export function PermissionDetailEditor({
  appId,
  permission,
  canManage,
  mode,
  allowMultipleDefinedScopes,
  definedScopeOptions,
  applicableForOptions,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [description, setDescription] = useState(permission.description ?? '');
  const [definedScopeKeys, setDefinedScopeKeys] = useState<string[]>(permission.definedScopeKeys);
  const [applicableFor, setApplicableFor] = useState<string[]>(permission.applicableFor);
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [scopeRemovalImpact, setScopeRemovalImpact] = useState<PermissionScopeImpactRole[]>([]);
  const [showDeleteSection, setShowDeleteSection] = useState(false);

  const goBack = () => {
    redirectInApp(router, applicationHref('/application/permissions', appId, { mode }));
  };

  const handleSave = async (confirmScopeRemoval = false) => {
    setSavePending(true);
    const result = await updateAppPermission({
      appId,
      permissionId: permission.id,
      description: description || undefined,
      scope: permission.scope,
      definedScopeKeys,
      applicableFor,
      confirmScopeRemoval,
    });
    setSavePending(false);

    if (result.requiresConfirmation && result.impactedRoles?.length) {
      setScopeRemovalImpact(result.impactedRoles);
      return;
    }

    if (!result.success || !result.permission) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update permission.' });
      return;
    }

    setScopeRemovalImpact([]);
    toast({
      title: 'Permission updated',
      description: confirmScopeRemoval ? 'Incompatible role mappings were removed and recalculated.' : undefined,
    });
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
        <Input value={permission.name} disabled aria-label="Permission title" />
        <Input
          value={description}
          disabled={!canManage}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
        />

        <AuthzDefinitionSelector
          label="Defined scopes"
          description="Application-defined scopes stored in permission metadata."
          options={definedScopeOptions}
          value={definedScopeKeys}
          onChange={setDefinedScopeKeys}
          allowMultiple={allowMultipleDefinedScopes}
          disabled={!canManage}
          emptyLabel="No app-defined scopes configured on the application configuration page."
        />

        <AuthzDefinitionSelector
          label="Applicable for"
          description="Application-defined applicable-for values stored on this permission."
          options={applicableForOptions}
          value={applicableFor}
          onChange={setApplicableFor}
          disabled={!canManage}
          emptyLabel="No applicable-for definitions configured on the application configuration page."
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
          <Button type="button" onClick={() => handleSave(false)} disabled={savePending || !canManage}>
            {savePending ? 'Saving...' : 'Save Permission'}
          </Button>
        </div>
      </div>

      <AlertDialog open={scopeRemovalImpact.length > 0} onOpenChange={(open) => { if (!open) setScopeRemovalImpact([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove incompatible role mappings?</AlertDialogTitle>
            <AlertDialogDescription>
              Saving <strong>{permission.name}</strong> will remove this permission from the following roles because their mapped scope is no longer allowed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {scopeRemovalImpact.map((role) => (
              <div key={`${role.roleId}-${role.roleScope}`} className="rounded-md border px-3 py-2 text-sm">
                <div className="font-medium">{role.roleName}</div>
                <div className="text-muted-foreground">{role.roleScope}</div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => handleSave(true)}
              disabled={savePending}
            >
              {savePending ? 'Updating...' : 'Remove And Recalculate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
