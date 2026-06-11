'use client';

import { useState, type KeyboardEvent } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronRight, X } from '@/components/icons';
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

type Props = {
  appId: string;
  initialPermissions: AppPermission[];
};

type PermissionTagInput = Parameters<typeof createAppPermission>[0]['tag'];

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
  const addDraftTag = () => {
    const nextTag = draft.trim();
    if (!nextTag) return;
    onTagsChange(Array.from(new Set([...tags, nextTag])));
    onDraftChange('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addDraftTag();
      return;
    }

    if (event.key === 'Backspace' && !draft && tags.length > 0) {
      onTagsChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-12 w-full flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-8 items-center gap-1 rounded-full border bg-muted px-3 text-sm leading-none text-foreground"
        >
          {tag}
          <button
            type="button"
            className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            onClick={() => onTagsChange(tags.filter((candidate) => candidate !== tag))}
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addDraftTag}
        className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        placeholder={tags.length === 0 ? 'Add tag and press Enter' : 'Add tag'}
      />
    </div>
  );
}

export function PermissionPanel({ appId, initialPermissions }: Props) {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<AppPermission[]>(initialPermissions);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
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
  const getTagLabels = (value: AppPermission['tag']): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (value === null) return [];
    return [JSON.stringify(value)];
  };
  const serializeTags = (tags: string[]): PermissionTagInput | undefined => {
    const cleaned = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
    return cleaned.length > 0 ? cleaned : undefined;
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
    const nextTags = addTagDraft.trim() ? Array.from(new Set([...addTags, addTagDraft.trim()])) : addTags;
    setAddPending(true);
    const result = await createAppPermission({
      appId,
      name: trimmed,
      description: addDesc || undefined,
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
    setAddTags([]);
    setAddTagDraft('');
    setAddOpen(false);
    toast({ title: 'Permission created' });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    const nextTags = editTagDraft.trim() ? Array.from(new Set([...editTags, editTagDraft.trim()])) : editTags;
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
        {permissions.length > 0 ? (
          permissions.map((cap) => (
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
                {getTagLabels(cap.tag).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {getTagLabels(cap.tag).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
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
          if (!open) { setAddName(''); setAddDesc(''); setAddTags([]); setAddTagDraft(''); }
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
              disabled={addPending || !addName.trim() || !isValidName(addName)}
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
              Update the description or tag of this permission. Permission names cannot be changed after creation.
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
