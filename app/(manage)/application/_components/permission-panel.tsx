'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronRight, X } from '@/components/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  createAppPermission,
  updateAppPermission,
  deleteAppPermission,
  type AppPermission,
} from '@/services/applications/authz-manage';
import { ROLE_SCOPE_OPTIONS, isKnownRoleScope } from '@/services/role-scopes';

type Props = {
  appId: string;
  initialPermissions: AppPermission[];
};

type PermissionTagInput = Parameters<typeof createAppPermission>[0]['tag'];
const TAG_LIMIT = 4;
const TAG_NAME_PATTERN = /^[a-zA-Z0-9._]+$/;

function normalizePermissionTags(tags: string[]) {
  const seen = new Set<string>();
  const normalizedTags: string[] = [];

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag || seen.has(tag) || !TAG_NAME_PATTERN.test(tag)) continue;
    seen.add(tag);

    if (normalizedTags.length < TAG_LIMIT) {
      normalizedTags.push(tag);
    }
  }

  return normalizedTags;
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

    if (normalizedTags.length >= TAG_LIMIT && !normalizedTags.includes(nextTag)) {
      setError('You can add up to 4 tags.');
      return;
    }

    setError('');
    updateTags([...normalizedTags, nextTag]);
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
        className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        placeholder="Add custom tag and press Enter"
      />

      {normalizedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalizedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex h-8 items-center gap-1 rounded-full border bg-muted px-3 text-sm leading-none text-foreground"
            >
              {tag}
              <button
                type="button"
                className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                onClick={() => updateTags(normalizedTags.filter((candidate) => candidate !== tag))}
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <p className="text-xs text-muted-foreground">
        Add up to 4 tags using letters, numbers, dots, or underscores.
      </p>
    </div>
  );
}

export function PermissionPanel({ appId, initialPermissions }: Props) {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<AppPermission[]>(initialPermissions);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addScope, setAddScope] = useState('');
  const [addTags, setAddTags] = useState<string[]>([]);
  const [addTagDraft, setAddTagDraft] = useState('');
  const [addPending, setAddPending] = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<AppPermission | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagDraft, setEditTagDraft] = useState('');
  const [editPending, setEditPending] = useState(false);

  // Remove dialog
  const [removeTarget, setRemoveTarget] = useState<AppPermission | null>(null);
  const [removePending, setRemovePending] = useState(false);

  const isValidName = (value: string) => /^[a-zA-Z0-9._]+$/.test(value.trim());
  const isValidScope = (value: string) => isKnownRoleScope(value.trim());
  const sortedPermissions = useMemo(() => {
    return [...permissions].sort((a, b) => {
      const result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? result : -result;
    });
  }, [permissions, sortDirection]);

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
    if (normalizedTags.length >= TAG_LIMIT && !normalizedTags.includes(nextTag)) {
      return 'You can add up to 4 tags.';
    }
    return null;
  };

  const openEdit = (cap: AppPermission) => {
    setEditTarget(cap);
    setEditDesc(cap.description ?? '');
    setEditTags(getTagLabels(cap.tag));
    setEditTagDraft('');
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditDesc('');
    setEditTags([]);
    setEditTagDraft('');
  };

  const handleAdd = async () => {
    const trimmed = addName.trim();
    if (!trimmed) return;
    if (!isValidName(trimmed)) {
      toast({
        variant: 'destructive',
        title: 'Invalid name',
        description: 'Permission name may only contain letters, numbers, dots (.), and underscores (_).',
      });
      return;
    }
    const scope = addScope.trim();
    if (!isValidScope(scope)) {
      toast({
        variant: 'destructive',
        title: 'Invalid scope',
        description: 'Choose a valid scope.',
      });
      return;
    }
    const tagError = validateDraftTag(addTags, addTagDraft);
    if (tagError) {
      toast({ variant: 'destructive', title: 'Invalid tag', description: tagError });
      return;
    }
    const nextTags = addTagDraft.trim() ? normalizePermissionTags([...addTags, addTagDraft.trim()]) : normalizePermissionTags(addTags);
    setAddPending(true);
    const result = await createAppPermission({
      appId,
      name: trimmed,
      description: addDesc || undefined,
      scope,
      tag: serializeTags(nextTags),
    });
    setAddPending(false);
    if (!result.success || !result.permission) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not create permission.' });
      return;
    }
    setPermissions((prev) => [...prev, result.permission!]);
    setAddName('');
    setAddDesc('');
    setAddScope('');
    setAddTags([]);
    setAddTagDraft('');
    setAddOpen(false);
    toast({ title: 'Permission created' });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    const tagError = validateDraftTag(editTags, editTagDraft);
    if (tagError) {
      toast({ variant: 'destructive', title: 'Invalid tag', description: tagError });
      return;
    }
    const nextTags = editTagDraft.trim() ? normalizePermissionTags([...editTags, editTagDraft.trim()]) : normalizePermissionTags(editTags);
    setEditPending(true);
    const result = await updateAppPermission({
      appId,
      permissionId: editTarget.id,
      description: editDesc || undefined,
      tag: serializeTags(nextTags),
    });
    setEditPending(false);
    if (!result.success || !result.permission) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update permission.' });
      return;
    }
    setPermissions((prev) => prev.map((c) => c.id === editTarget.id ? result.permission! : c));
    closeEdit();
    toast({ title: 'Permission updated' });
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    setRemovePending(true);
    const result = await deleteAppPermission({ appId, permissionId: removeTarget.id });
    setRemovePending(false);
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not delete permission.' });
      return;
    }
    setPermissions((prev) => prev.filter((c) => c.id !== removeTarget.id));
    setRemoveTarget(null);
    toast({ title: 'Permission removed' });
  };

  return (
    <>
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as 'asc' | 'desc')}>
            <SelectTrigger className="h-9 w-[132px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="asc">Name A-Z</SelectItem>
              <SelectItem value="desc">Name Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main list */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        {/* Add row */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="group flex w-full items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed bg-muted/20">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="truncate text-base font-medium leading-6 text-muted-foreground">
              New Permission
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>

        {/* Permission rows */}
        {sortedPermissions.length > 0 ? (
          sortedPermissions.map((cap) => (
            <div
              key={cap.id}
              className="group flex items-center justify-between gap-4 border-b px-4 py-4 last:border-b-0 transition-colors hover:bg-muted/40 sm:px-5"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => openEdit(cap)}
              >
                <p className="truncate text-base font-medium leading-6">{cap.name}</p>
                {cap.description && (
                  <p className="truncate text-sm text-muted-foreground">{cap.description}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs">{cap.scope}</Badge>
                  {getTagLabels(cap.tag).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground"
                onClick={() => setRemoveTarget(cap)}
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
            No permissions defined yet.
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) { setAddName(''); setAddDesc(''); setAddScope(''); setAddTags([]); setAddTagDraft(''); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Permission</DialogTitle>
            <DialogDescription>
              Use letters, numbers, dots, or underscores — e.g.{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">orders.read</code> or{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">Orders_Read</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Name, e.g. orders.read"
              autoFocus
            />
            <Input
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              placeholder="Description (optional)"
            />
            <Select value={addScope} onValueChange={setAddScope}>
              <SelectTrigger className="h-12 w-full">
                <SelectValue placeholder="Choose permission scope" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PermissionTagEditor
              tags={addTags}
              draft={addTagDraft}
              onDraftChange={setAddTagDraft}
              onTagsChange={setAddTags}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={addPending || !addName.trim() || !isValidName(addName) || !isValidScope(addScope)}
            >
              {addPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Permission</DialogTitle>
            <DialogDescription>
              Update the description or tag of this permission. Permission names and scopes cannot be changed after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editTarget?.name ?? ''}
              disabled
              aria-label="Permission name"
            />
            <Input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              autoFocus
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Scope</label>
              <div className="flex min-h-12 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
                {editTarget?.scope ?? 'Unknown'}
              </div>
              <p className="text-xs text-muted-foreground">
                To change the scope, delete this permission and create a new one.
              </p>
            </div>
            <PermissionTagEditor
              tags={editTags}
              draft={editTagDraft}
              onDraftChange={setEditTagDraft}
              onTagsChange={setEditTags}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleEdit}
              disabled={editPending}
            >
              {editPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove permission?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removeTarget?.name}</strong> will be permanently removed. Any roles that include this permission will lose it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRemoveConfirm}
              disabled={removePending}
            >
              {removePending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
