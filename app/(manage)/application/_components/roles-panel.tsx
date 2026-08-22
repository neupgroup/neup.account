'use client';

/*
::neup.documentation::application-roles-panel
::title Application Roles Panel

Lists application roles and the webhook sync actions for authz data.

::public

The panel shows each role's `scope_for`, `scope_level`, and default-role state, and also exposes push/reset actions for webhook-based authz sync.

::public end

::end
*/

import { useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/core/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  pushAuthzToWebhook,
  clearAuthzPushStatus,
  type AppRole,
} from '@/services/applications/authz-manage';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  appId: string;
  canManage: boolean;
  canResetPush: boolean;
  initialRoles: AppRole[];
  hasWebhook: boolean;
  defaultRoleId: string | null;
};

export function RolesPanel({ appId, canManage, canResetPush, initialRoles, hasWebhook, defaultRoleId }: Props) {
  const { toast } = useToast();
  const [pushPending, setPushPending] = useState(false);
  const [clearPending, setClearPending] = useState(false);

  const handlePush = async () => {
    setPushPending(true);
    const result = await pushAuthzToWebhook(appId);
    setPushPending(false);
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Push failed', description: result.error || 'Could not push data.' });
      return;
    }
    if (result.pushed === 0) {
      toast({ title: 'Nothing to push', description: 'No role-permission mappings exist yet.' });
      return;
    }
    toast({ title: 'Pushed', description: `${result.pushed} role-permission mapping${result.pushed === 1 ? '' : 's'} sent to webhook.` });
  };

  const handleClearPushStatus = async () => {
    const ok = window.confirm(
      'Clear push status for this application?\n\nThis will reset pushed=false for all roles and access grants, so external apps can re-sync.'
    );
    if (!ok) return;

    setClearPending(true);
    const result = await clearAuthzPushStatus(appId);
    setClearPending(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not clear push status.' });
      return;
    }

    toast({
      title: 'Push status cleared',
      description: `Reset ${result.cleared.roles} role${result.cleared.roles === 1 ? '' : 's'} and ${result.cleared.access} access grant${result.cleared.access === 1 ? '' : 's'}.`,
    });
  };

  return (
    <div className="grid gap-6">
      <div className="overflow-hidden rounded-2xl border bg-card">
        {canManage ? (
          <Link
            href={applicationHref('/application/roles/add', appId, { mode: 'root' })}
            className="group block border-b px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
          >
            <p className="text-base font-medium leading-6">Create a role</p>
            <p className="text-sm text-muted-foreground">Define the role title, description, and scope policy.</p>
          </Link>
        ) : null}

        {initialRoles.length > 0 ? (
          initialRoles.map((role) => (
            <div key={role.id} className="border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5">
              <div className="flex items-start justify-between gap-4">
                <Link href={applicationHref(`/application/roles/${role.id}`, appId, { mode: 'root' })} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-medium leading-6">{role.name}</p>
                    {role.scopeFor.map((label) => (
                      <Badge key={label} variant="outline" className="text-xs">{label}</Badge>
                    ))}
                    <Badge variant="outline" className="text-xs">{role.scopeLevel}</Badge>
                    {defaultRoleId === role.id ? (
                      <Badge className="text-xs">Default</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{role.description || 'No description'}</p>
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
            No roles yet.
          </div>
        )}
      </div>

      {/* Push to webhook */}
      <div className="rounded-2xl border bg-card p-5 space-y-3">
        <p className="text-base font-semibold">Push to Application</p>
        <p className="text-sm text-muted-foreground">
            Send all current role-permission mappings to the registered webhook endpoint.
            {!hasWebhook && ' No webhook URL is configured — set one in the application settings first.'}
        </p>
        <p className="text-sm text-muted-foreground">
          Pushes every <code className="rounded bg-muted px-1 py-0.5 text-xs">authz_role_capability</code> record
          for this app to the webhook as individual <code className="rounded bg-muted px-1 py-0.5 text-xs">insert</code> operations.
        </p>
        {canManage ? (
          <Button type="button" onClick={handlePush} disabled={pushPending || !hasWebhook}>
            {pushPending ? 'Pushing...' : 'Push All to App'}
          </Button>
        ) : null}
      </div>

      {canResetPush ? (
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <p className="text-base font-semibold">Reset Push Status</p>
          <p className="text-sm text-muted-foreground">
              Clears the <code className="rounded bg-muted px-1 py-0.5 text-xs">pushed</code> flag on roles and access grants for this application.
          </p>
          <p className="text-sm text-muted-foreground">
            Use this if your client’s synced authz data is corrupted and you need to re-sync from scratch.
          </p>
          <Button type="button" variant="outline" onClick={handleClearPushStatus} disabled={clearPending}>
            {clearPending ? 'Clearing...' : 'Clear Push Status'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
