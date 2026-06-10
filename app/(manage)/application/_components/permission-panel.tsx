'use client';

import { useState } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronRight } from '@/components/icons';
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

export function PermissionPanel({ appId, initialPermissions }: Props) {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<AppPermission[]>(initialPermissions);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addScope, setAddScope] = useState('');
  const [addPending, setAddPending] = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<AppPermission | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editScope, setEditScope] = useState('');
  const [editPending, setEditPending] = useState(false);

  // Remove dialog
  const [removeTarget, setRemoveTarget] = useState<AppPermission | null>(null);
  const [removePending, setRemovePending] = useState(false);

  const isValidName = (value: string) => /^[a-zA-Z0-9._]+$/.test(value.trim());

  const openEdit = (cap: AppPermission) => {
    setEditTarget(cap);
    setEditName(cap.name);
    setEditDesc(cap.description ?? '');
    setEditScope(cap.scope ?? '');
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditName('');
    setEditDesc('');
    setEditScope('');
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
    setAddPending(true);
    const result = await createAppPermission({
      appId,
      name: trimmed,
      description: addDesc || undefined,
      scope: addScope || undefined,
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
    setAddOpen(false);
    toast({ title: 'Permission created' });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    if (!isValidName(trimmed)) {
      toast({
        variant: 'destructive',
        title: 'Invalid name',
        description: 'Permission name may only contain letters, numbers, dots (.), and underscores (_).',
      });
      return;
    }
    setEditPending(true);
    const result = await updateAppPermission({
      appId,
      permissionId: editTarget.id,
      name: trimmed,
      description: editDesc || undefined,
      scope: editScope || undefined,
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
                {cap.scope && (
                  <Badge variant="outline" className="mt-1 text-xs">{cap.scope}</Badge>
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
          if (!open) { setAddName(''); setAddDesc(''); setAddScope(''); }
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
            <Input
              value={addScope}
              onChange={(e) => setAddScope(e.target.value)}
              placeholder="Scope (optional), e.g. portfolio"
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
              Update the name, description, or scope of this permission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Name, e.g. orders.read"
              autoFocus
            />
            <Input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
            />
            <Input
              value={editScope}
              onChange={(e) => setEditScope(e.target.value)}
              placeholder="Scope (optional), e.g. portfolio"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleEdit}
              disabled={editPending || !editName.trim() || !isValidName(editName)}
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
