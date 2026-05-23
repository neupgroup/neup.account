'use client';

import { useState } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  createAppRole,
  deleteAppRole,
  updateAppRolePermissions,
  pushAuthzToWebhook,
  clearAuthzPushStatus,
  type AppPermission,
  type AppRole,
} from '@/services/applications/authz-manage';

type Props = {
  appId: string;
  initialRoles: AppRole[];
  permissions: AppPermission[];
  hasWebhook: boolean;
};

export function RolesPanel({ appId, initialRoles, permissions, hasWebhook }: Props) {
  const { toast } = useToast();
  const [roles, setRoles] = useState<AppRole[]>(initialRoles);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleScope, setNewRoleScope] = useState('');
  const [newRoleCapIds, setNewRoleCapIds] = useState<string[]>([]);
  const [rolePending, setRolePending] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingCapIds, setEditingCapIds] = useState<string[]>([]);
  const [editPending, setEditPending] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [clearPending, setClearPending] = useState(false);

  const handleAddRole = async () => {
    const name = newRoleName.trim();
    if (!name) return;
    setRolePending(true);
    const result = await createAppRole({
      appId,
      name,
      description: newRoleDesc || undefined,
      scope: newRoleScope || undefined,
      permissionIds: newRoleCapIds,
    });
    setRolePending(false);
    if (!result.success || !result.role) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not create role.' });
      return;
    }
    setRoles((prev) => [...prev, result.role!]);
    setNewRoleName('');
    setNewRoleDesc('');
    setNewRoleScope('');
    setNewRoleCapIds([]);
    toast({ title: 'Role created' });
  };

  const handleDeleteRole = async (roleId: string) => {
    const result = await deleteAppRole({ appId, roleId });
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not delete role.' });
      return;
    }
    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    toast({ title: 'Role deleted' });
  };

  const handleSaveRolePermissions = async () => {
    if (!editingRoleId) return;
    setEditPending(true);
    const result = await updateAppRolePermissions({ appId, roleId: editingRoleId, permissionIds: editingCapIds });
    setEditPending(false);
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update role.' });
      return;
    }
    setRoles((prev) =>
      prev.map((r) =>
        r.id === editingRoleId
          ? { ...r, permissions: permissions.filter((c) => editingCapIds.includes(c.id)) }
          : r
      )
    );
    setEditingRoleId(null);
    setEditingCapIds([]);
    toast({ title: 'Role updated' });
  };

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
      {/* Existing roles */}
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>
            Group permissions into roles. Roles are assigned to accounts via access grants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {roles.length > 0 ? (
            <div className="space-y-3">
              {roles.map((role) => (
                <div key={role.id} className="rounded-md border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{role.name}</p>
                      {role.description && (
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      )}
                      {role.scope && (
                        <Badge variant="outline" className="mt-1 text-xs">{role.scope}</Badge>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setEditingRoleId(role.id); setEditingCapIds(role.permissions.map((c) => c.id)); }}
                      >
                        Edit permissions
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteRole(role.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>

                  {editingRoleId === role.id ? (
                    <div className="space-y-3 pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground">Select permissions</p>
                      {permissions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No permissions defined yet.</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {permissions.map((cap) => (
                            <label key={cap.id} className="flex items-center gap-2 text-sm rounded-md border px-3 py-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingCapIds.includes(cap.id)}
                                onChange={() =>
                                  setEditingCapIds((prev) =>
                                    prev.includes(cap.id) ? prev.filter((id) => id !== cap.id) : [...prev, cap.id]
                                  )
                                }
                              />
                              <span>{cap.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingRoleId(null); setEditingCapIds([]); }}>
                          Cancel
                        </Button>
                        <Button type="button" size="sm" onClick={handleSaveRolePermissions} disabled={editPending}>
                          {editPending ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    role.permissions.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.map((cap) => (
                          <Badge key={cap.id} variant="secondary" className="text-xs">{cap.name}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No permissions assigned.</p>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No roles yet.</p>
          )}

          {/* Add new role */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">Add role</p>
            <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Role name, e.g. viewer" />
            <Input value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} placeholder="Description (optional)" />
            <Input value={newRoleScope} onChange={(e) => setNewRoleScope(e.target.value)} placeholder="Scope (optional)" />
            {permissions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Assign permissions</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {permissions.map((cap) => (
                    <label key={cap.id} className="flex items-center gap-2 text-sm rounded-md border px-3 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRoleCapIds.includes(cap.id)}
                        onChange={() =>
                          setNewRoleCapIds((prev) =>
                            prev.includes(cap.id) ? prev.filter((id) => id !== cap.id) : [...prev, cap.id]
                          )
                        }
                      />
                      <span>{cap.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" onClick={handleAddRole} disabled={rolePending || !newRoleName.trim()}>
                {rolePending ? 'Adding...' : 'Add Role'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Push to webhook */}
      <Card>
        <CardHeader>
          <CardTitle>Push to Application</CardTitle>
          <CardDescription>
            Send all current role-permission mappings to the registered webhook endpoint.
            {!hasWebhook && ' No webhook URL is configured — set one in the application settings first.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pushes every <code className="rounded bg-muted px-1 py-0.5 text-xs">authz_role_capability</code> record
            for this app to the webhook as individual <code className="rounded bg-muted px-1 py-0.5 text-xs">insert</code> operations.
          </p>
          <Button type="button" onClick={handlePush} disabled={pushPending || !hasWebhook}>
            {pushPending ? 'Pushing...' : 'Push All to App'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reset Push Status</CardTitle>
          <CardDescription>
            Clears the <code className="rounded bg-muted px-1 py-0.5 text-xs">pushed</code> flag on roles and access grants for this application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use this if your client’s synced authz data is corrupted and you need to re-sync from scratch.
          </p>
          <Button type="button" variant="outline" onClick={handleClearPushStatus} disabled={clearPending}>
            {clearPending ? 'Clearing...' : 'Clear Push Status'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
