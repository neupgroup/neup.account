'use client';

import { useState, type KeyboardEvent } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from '@/components/icons';
import {
  createAppPermission,
  createAppRole,
  deleteAppPermission,
  deleteAppRole,
  updateAppRolePermissions,
  pushAuthzToWebhook,
  type AppPermission,
  type AppRole,
} from '@/services/applications/authz-manage';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  appId: string;
  initialPermissions: AppPermission[];
  initialRoles: AppRole[];
  hasWebhook: boolean;
};

type PermissionTagInput = Parameters<typeof createAppPermission>[0]['tag'];
const RECOMMENDED_PERMISSION_TAGS = ['private', 'public', 'protected', 'manageable'] as const;
const CUSTOM_TAG_LIMIT = 4;
const TAG_NAME_PATTERN = /^[a-zA-Z0-9._]+$/;

function isRecommendedTag(tag: string) {
  return RECOMMENDED_PERMISSION_TAGS.includes(tag as (typeof RECOMMENDED_PERMISSION_TAGS)[number]);
}

function normalizePermissionTags(tags: string[]) {
  const seen = new Set<string>();
  let recommendedTag: string | null = null;
  const customTags: string[] = [];

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag || seen.has(tag) || !TAG_NAME_PATTERN.test(tag)) continue;
    seen.add(tag);

    if (isRecommendedTag(tag)) {
      recommendedTag = recommendedTag ?? tag;
      continue;
    }

    if (customTags.length < CUSTOM_TAG_LIMIT) {
      customTags.push(tag);
    }
  }

  return recommendedTag ? [recommendedTag, ...customTags] : customTags;
}

function PermissionTagEditor({
  tags,
  draft,
  onDraftChange,
  onTagsChange,
}: {
  tags: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
}) {
  const [error, setError] = useState('');
  const normalizedTags = normalizePermissionTags(tags);
  const selectedRecommendedTag = normalizedTags.find(isRecommendedTag) ?? null;
  const customTags = normalizedTags.filter((tag) => !isRecommendedTag(tag));

  const updateTags = (nextTags: string[]) => {
    onTagsChange(normalizePermissionTags(nextTags));
  };

  const addTag = (rawTag: string) => {
    const nextTag = rawTag.trim();
    if (!nextTag) return;

    if (!TAG_NAME_PATTERN.test(nextTag)) {
      setError('Tags may only contain letters, numbers, dots (.), and underscores (_).');
      return;
    }

    if (!isRecommendedTag(nextTag) && customTags.length >= CUSTOM_TAG_LIMIT && !customTags.includes(nextTag)) {
      setError('You can add up to 4 custom tags.');
      return;
    }

    setError('');
    if (isRecommendedTag(nextTag)) {
      updateTags([nextTag, ...customTags]);
    } else {
      updateTags([...(selectedRecommendedTag ? [selectedRecommendedTag] : []), ...customTags, nextTag]);
    }
    onDraftChange('');
  };

  const addDraftTag = () => {
    addTag(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftTag();
      return;
    }

    if (event.key === 'Backspace' && !draft && tags.length > 0) {
      updateTags(normalizedTags.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <input
        value={draft}
        onChange={(event) => {
          onDraftChange(event.target.value);
          if (error) setError('');
        }}
        onKeyDown={handleKeyDown}
        onBlur={addDraftTag}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        placeholder="Add custom tag and press Enter"
      />

      <div className="flex flex-wrap gap-2">
        {RECOMMENDED_PERMISSION_TAGS.map((tag) => {
          const selected = selectedRecommendedTag === tag;
          return (
            <button
              key={tag}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => {
                setError('');
                updateTags(selected ? customTags : [tag, ...customTags]);
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {normalizedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalizedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex h-7 items-center gap-1 rounded-full border bg-muted px-2.5 text-xs leading-none text-foreground"
            >
              {tag}
              <button
                type="button"
                className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                onClick={() => updateTags(normalizedTags.filter((candidate) => candidate !== tag))}
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <p className="text-xs text-muted-foreground">
        Select one recommended tag, plus up to 4 custom tags using letters, numbers, dots, or underscores.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuthzManagementPanel({ appId, initialPermissions, initialRoles, hasWebhook }: Props) {
  const { toast } = useToast();

  // ---- Permissions state ----
  const [permissions, setPermissions] = useState<AppPermission[]>(initialPermissions);
  const [newCapName, setNewCapName] = useState('');
  const [newCapDesc, setNewCapDesc] = useState('');
  const [newCapTags, setNewCapTags] = useState<string[]>([]);
  const [newCapTagDraft, setNewCapTagDraft] = useState('');
  const [capPending, setCapPending] = useState(false);

  // ---- Roles state ----
  const [roles, setRoles] = useState<AppRole[]>(initialRoles);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleScope, setNewRoleScope] = useState('');
  const [newRoleCapIds, setNewRoleCapIds] = useState<string[]>([]);
  const [rolePending, setRolePending] = useState(false);

  // ---- Editing role permissions ----
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingCapIds, setEditingCapIds] = useState<string[]>([]);
  const [editPending, setEditPending] = useState(false);

  // ---- Push state ----
  const [pushPending, setPushPending] = useState(false);

  // ---------------------------------------------------------------------------
  // Permission handlers
  // ---------------------------------------------------------------------------

  const getTagLabels = (value: AppPermission['tag']): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (value === null) return [];
    return [JSON.stringify(value)];
  };
  const serializeTags = (tags: string[]): PermissionTagInput | undefined => {
    const cleaned = normalizePermissionTags(tags);
    return cleaned.length > 0 ? cleaned : undefined;
  };
  const validateDraftTag = (currentTags: string[], draft: string) => {
    const nextTag = draft.trim();
    if (!nextTag) return null;
    if (!TAG_NAME_PATTERN.test(nextTag)) {
      return 'Tags may only contain letters, numbers, dots (.), and underscores (_).';
    }
    const normalizedTags = normalizePermissionTags(currentTags);
    const customTags = normalizedTags.filter((tag) => !isRecommendedTag(tag));
    if (!isRecommendedTag(nextTag) && customTags.length >= CUSTOM_TAG_LIMIT && !customTags.includes(nextTag)) {
      return 'You can add up to 4 custom tags.';
    }
    return null;
  };

  const handleAddPermission = async () => {
    const name = newCapName.trim();
    if (!name) return;
    const tagError = validateDraftTag(newCapTags, newCapTagDraft);
    if (tagError) {
      toast({ variant: 'destructive', title: 'Invalid tag', description: tagError });
      return;
    }
    const nextTags = newCapTagDraft.trim() ? normalizePermissionTags([...newCapTags, newCapTagDraft.trim()]) : normalizePermissionTags(newCapTags);

    setCapPending(true);
    const result = await createAppPermission({
      appId,
      name,
      description: newCapDesc || undefined,
      tag: serializeTags(nextTags),
    });
    setCapPending(false);

    if (!result.success || !result.permission) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not create permission.' });
      return;
    }

    setPermissions((prev) => [...prev, result.permission!]);
    setNewCapName('');
    setNewCapDesc('');
    setNewCapTags([]);
    setNewCapTagDraft('');
    toast({ title: 'Permission created' });
  };

  const handleDeletePermission = async (permissionId: string) => {
    const result = await deleteAppPermission({ appId, permissionId });
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not delete permission.' });
      return;
    }
    setPermissions((prev) => prev.filter((c) => c.id !== permissionId));
    // Also remove from any role that had it
    setRoles((prev) =>
      prev.map((r) => ({ ...r, permissions: r.permissions.filter((c) => c.id !== permissionId) }))
    );
    toast({ title: 'Permission deleted' });
  };

  // ---------------------------------------------------------------------------
  // Role handlers
  // ---------------------------------------------------------------------------

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

  const handleStartEditRole = (role: AppRole) => {
    setEditingRoleId(role.id);
    setEditingCapIds(role.permissions.map((c) => c.id));
  };

  const handleSaveRolePermissions = async () => {
    if (!editingRoleId) return;
    setEditPending(true);
    const result = await updateAppRolePermissions({
      appId,
      roleId: editingRoleId,
      permissionIds: editingCapIds,
    });
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

  // ---------------------------------------------------------------------------
  // Push handler
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="grid gap-6">

      {/* ---- Permissions ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>
            Define the individual permissions this application can assign. Each permission represents one action or access right.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Existing permissions */}
          {permissions.length > 0 ? (
            <div className="space-y-2">
              {permissions.map((cap) => (
                <div key={cap.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{cap.name}</p>
                    {cap.description && (
                      <p className="text-xs text-muted-foreground truncate">{cap.description}</p>
                    )}
                    {getTagLabels(cap.tag).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {getTagLabels(cap.tag).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePermission(cap.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No permissions yet.</p>
          )}

          {/* Add new permission */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">Add permission</p>
            <Input
              value={newCapName}
              onChange={(e) => setNewCapName(e.target.value)}
              placeholder="Name, e.g. orders.read"
            />
            <Input
              value={newCapDesc}
              onChange={(e) => setNewCapDesc(e.target.value)}
              placeholder="Description (optional)"
            />
            <PermissionTagEditor
              tags={newCapTags}
              draft={newCapTagDraft}
              onDraftChange={setNewCapTagDraft}
              onTagsChange={setNewCapTags}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleAddPermission}
                disabled={capPending || !newCapName.trim()}
              >
                {capPending ? 'Adding...' : 'Add Permission'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Roles ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>
            Group permissions into roles. Roles are assigned to accounts via access grants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Existing roles */}
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
                        onClick={() => handleStartEditRole(role)}
                      >
                        Edit permissions
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRole(role.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>

                  {/* Assigned permissions */}
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
                                    prev.includes(cap.id)
                                      ? prev.filter((id) => id !== cap.id)
                                      : [...prev, cap.id]
                                  )
                                }
                              />
                              <span>{cap.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingRoleId(null); setEditingCapIds([]); }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveRolePermissions}
                          disabled={editPending}
                        >
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
            <Input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name, e.g. viewer"
            />
            <Input
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
              placeholder="Description (optional)"
            />
            <Input
              value={newRoleScope}
              onChange={(e) => setNewRoleScope(e.target.value)}
              placeholder="Scope (optional)"
            />
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
                            prev.includes(cap.id)
                              ? prev.filter((id) => id !== cap.id)
                              : [...prev, cap.id]
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
              <Button
                type="button"
                onClick={handleAddRole}
                disabled={rolePending || !newRoleName.trim()}
              >
                {rolePending ? 'Adding...' : 'Add Role'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Push to app ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Push to Application</CardTitle>
          <CardDescription>
            Send all current role-permission mappings to the registered webhook endpoint.
            {!hasWebhook && ' No webhook URL is configured — set one in the Webhook section first.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This pushes every <code className="rounded bg-muted px-1 py-0.5 text-xs">authz_role_capability</code> record
            for this app to the webhook as individual <code className="rounded bg-muted px-1 py-0.5 text-xs">insert</code> operations.
            Use this to sync the receiving application after bulk changes.
          </p>
          <Button
            type="button"
            onClick={handlePush}
            disabled={pushPending || !hasWebhook}
          >
            {pushPending ? 'Pushing...' : 'Push All to App'}
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}
