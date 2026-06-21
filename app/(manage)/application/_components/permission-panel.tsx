'use client';

import { useMemo, useState } from 'react';
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
import { normalizeRoleScope } from '@/services/role-scopes';
import { PermissionScopeSelector } from './scope-selectors';

type Props = {
  appId: string;
  initialPermissions: AppPermission[];
  canManage: boolean;
};

type PermissionSearchFilters = {
  nameTerms: string[];
  plainTerms: string[];
  scopes: string[];
  sort: 'asc' | 'desc';
};

function normalizeScopeFilter(value: string): string | null {
  return normalizeRoleScope(value);
}

function parsePermissionSearch(input: string): PermissionSearchFilters {
  const filters: PermissionSearchFilters = {
    nameTerms: [],
    plainTerms: [],
    scopes: [],
    sort: 'asc',
  };

  const segments = input
    .split('&')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0 && input.trim()) {
    filters.plainTerms.push(input.trim().toLowerCase());
    return filters;
  }

  for (const segment of segments) {
    const separatorIndex = segment.indexOf(':');
    if (separatorIndex === -1) {
      filters.plainTerms.push(segment.toLowerCase());
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = segment.slice(separatorIndex + 1).trim();
    if (!rawValue) continue;

    if (key === 'sort') {
      const normalizedSort = rawValue.toLowerCase();
      if (normalizedSort === 'asc' || normalizedSort === 'desc') {
        filters.sort = normalizedSort;
      }
      continue;
    }

    if (key === 'scope') {
      for (const part of rawValue.split('||')) {
        const normalizedScope = normalizeScopeFilter(part);
        if (normalizedScope && !filters.scopes.includes(normalizedScope)) {
          filters.scopes.push(normalizedScope);
        }
      }
      continue;
    }

    if (key === 'name') {
      filters.nameTerms.push(rawValue.toLowerCase());
      continue;
    }

    filters.plainTerms.push(segment.toLowerCase());
  }

  return filters;
}

export function PermissionPanel({ appId, initialPermissions, canManage }: Props) {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<AppPermission[]>(initialPermissions);
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addScope, setAddScope] = useState<string[]>([]);
  const [addPending, setAddPending] = useState(false);

  const [editTarget, setEditTarget] = useState<AppPermission | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editScope, setEditScope] = useState<string[]>([]);
  const [editPending, setEditPending] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<AppPermission | null>(null);
  const [removePending, setRemovePending] = useState(false);

  const filteredPermissions = useMemo(() => {
    const filters = parsePermissionSearch(search);

    return [...permissions]
      .filter((permission) => {
        const nameHaystack = permission.name.toLowerCase();
        const plainHaystack = `${permission.name} ${permission.description ?? ''}`.toLowerCase();
        const matchesName = filters.nameTerms.every((term) => nameHaystack.includes(term));
        const matchesPlain = filters.plainTerms.every((term) => plainHaystack.includes(term));
        const matchesScope =
          filters.scopes.length === 0 || permission.scope.some((scope) => filters.scopes.includes(scope));

        return matchesName && matchesPlain && matchesScope;
      })
      .sort((a, b) => {
        const result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        return filters.sort === 'asc' ? result : -result;
      });
  }, [permissions, search]);

  const isValidName = (value: string) => /^[a-zA-Z0-9._]+$/.test(value.trim());

  const openEdit = (permission: AppPermission) => {
    if (!canManage) return;
    setEditTarget(permission);
    setEditDesc(permission.description ?? '');
    setEditScope(permission.scope);
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditDesc('');
    setEditScope([]);
  };

  const handleAdd = async () => {
    if (!canManage) return;
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
    if (addScope.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Missing scope',
        description: 'Select at least one scope.',
      });
      return;
    }

    setAddPending(true);
    const result = await createAppPermission({
      appId,
      name: trimmed,
      description: addDesc || undefined,
      scope: addScope,
    });
    setAddPending(false);

    if (!result.success || !result.permission) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not create permission.' });
      return;
    }

    const createdPermission = result.permission;
    setPermissions((prev) => [...prev, createdPermission]);
    setAddName('');
    setAddDesc('');
    setAddScope([]);
    setAddOpen(false);
    toast({ title: 'Permission created' });
  };

  const handleEdit = async () => {
    if (!canManage) return;
    if (!editTarget) return;
    if (editScope.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Missing scope',
        description: 'Select at least one scope.',
      });
      return;
    }

    setEditPending(true);
    const result = await updateAppPermission({
      appId,
      permissionId: editTarget.id,
      description: editDesc || undefined,
      scope: editScope,
    });
    setEditPending(false);

    if (!result.success || !result.permission) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update permission.' });
      return;
    }

    const updatedPermission = result.permission;
    setPermissions((prev) => prev.map((permission) => (permission.id === editTarget.id ? updatedPermission : permission)));
    closeEdit();
    toast({ title: 'Permission updated' });
  };

  const handleRemoveConfirm = async () => {
    if (!canManage) return;
    if (!removeTarget) return;

    setRemovePending(true);
    const result = await deleteAppPermission({ appId, permissionId: removeTarget.id });
    setRemovePending(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not delete permission.' });
      return;
    }

    setPermissions((prev) => prev.filter((permission) => permission.id !== removeTarget.id));
    setRemoveTarget(null);
    toast({ title: 'Permission removed' });
  };

  return (
    <>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search permissions... e.g. sort:asc&scope:public&name:access"
      />

      <div className="overflow-hidden rounded-2xl border bg-card">
        {canManage ? (
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
        ) : null}

        {filteredPermissions.length > 0 ? (
          filteredPermissions.map((permission) => (
            <div
              key={permission.id}
              className="group flex items-center justify-between gap-4 border-b px-4 py-4 last:border-b-0 transition-colors hover:bg-muted/40 sm:px-5"
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(permission)}>
                <p className="truncate text-base font-medium leading-6">{permission.name}</p>
                {permission.description ? (
                  <p className="truncate text-sm text-muted-foreground">{permission.description}</p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-1">
                  {permission.scope.map((scope) => (
                    <Badge key={`${permission.id}-${scope}`} variant="secondary" className="text-xs">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </button>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => setRemoveTarget(permission)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
            {permissions.length === 0 ? 'No permissions defined yet.' : 'No permissions match your search.'}
          </div>
        )}
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setAddName('');
            setAddDesc('');
            setAddScope([]);
          }
        }}
      >
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>New Permission</DialogTitle>
            <DialogDescription>
              Use letters, numbers, dots, or underscores for the permission name and choose the role scope levels that can use it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={addName} onChange={(event) => setAddName(event.target.value)} placeholder="Name, e.g. orders.read" autoFocus />
            <Input value={addDesc} onChange={(event) => setAddDesc(event.target.value)} placeholder="Description (optional)" />
            <PermissionScopeSelector key={`add-${addOpen ? 'open' : 'closed'}`} value={addScope} onChange={setAddScope} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleAdd} disabled={addPending || !addName.trim() || !isValidName(addName) || addScope.length === 0}>
              {addPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Permission</DialogTitle>
            <DialogDescription>
              Update the description and scope list for this permission. The name stays fixed after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editTarget?.name ?? ''} disabled aria-label="Permission name" />
            <Input value={editDesc} onChange={(event) => setEditDesc(event.target.value)} placeholder="Description (optional)" autoFocus />
            <PermissionScopeSelector key={editTarget?.id ?? 'edit-closed'} value={editScope} onChange={setEditScope} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleEdit} disabled={editPending || editScope.length === 0}>
              {editPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
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
