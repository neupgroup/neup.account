'use client';

/*
::neup.documentation::application-permission-panel
::title Application Permission Panel

Lists application permissions and provides the inline creation dialog for new permissions.

::public

This panel powers the top-level permissions page, including search and creation of permissions with `scope_for` and `scope_level`.

::public end

::end
*/

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  createAppPermission,
  type AppPermission,
} from '@/services/applications/authz-manage';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { redirectInApp } from '@/core/helper/navigation';
import { FlowLink } from '@/components/ui/flow-link';
import { ScopeForSelector, ScopeLevelSelector } from './authz-scope-policy-selector';

type Props = {
  appId: string;
  initialPermissions: AppPermission[];
  canManage: boolean;
  mode?: string;
};

type PermissionSearchFilters = {
  nameTerms: string[];
  plainTerms: string[];
  sort: 'asc' | 'desc';
};

function parsePermissionSearch(input: string): PermissionSearchFilters {
  const filters: PermissionSearchFilters = {
    nameTerms: [],
    plainTerms: [],
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

    if (key === 'name') {
      filters.nameTerms.push(rawValue.toLowerCase());
      continue;
    }

    filters.plainTerms.push(segment.toLowerCase());
  }

  return filters;
}

export function PermissionPanel({
  appId,
  initialPermissions,
  canManage,
  mode,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<AppPermission[]>(initialPermissions);
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addScopeFor, setAddScopeFor] = useState<AppPermission['scopeFor']>(['for_individual']);
  const [addScopeLevel, setAddScopeLevel] = useState<AppPermission['scopeLevel']>(['assignable']);
  const [addRules, setAddRules] = useState('');
  const [addStatus, setAddStatus] = useState('');
  const [addPending, setAddPending] = useState(false);

  const filteredPermissions = useMemo(() => {
    const filters = parsePermissionSearch(search);

    return [...permissions]
      .filter((permission) => {
        const nameHaystack = permission.name.toLowerCase();
        const plainHaystack = `${permission.name} ${permission.description ?? ''}`.toLowerCase();
        const matchesName = filters.nameTerms.every((term) => nameHaystack.includes(term));
        const matchesPlain = filters.plainTerms.every((term) => plainHaystack.includes(term));

        return matchesName && matchesPlain;
      })
      .sort((a, b) => {
        const result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        return filters.sort === 'asc' ? result : -result;
      });
  }, [permissions, search]);

  const isValidName = (value: string) => value.trim().length > 0;

  const handleAdd = async () => {
    if (!canManage) return;
    const trimmed = addName.trim();
    if (!trimmed) return;
    if (!isValidName(trimmed)) {
      toast({
        variant: 'destructive',
        title: 'Invalid title',
        description: 'Permission title must include at least one visible character.',
      });
      return;
    }
    setAddPending(true);
    const result = await createAppPermission({
      appId,
      name: trimmed,
      description: addDesc || undefined,
      scopeFor: addScopeFor,
      scopeLevel: addScopeLevel,
      rules: addRules || undefined,
      status: addStatus || undefined,
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
    setAddScopeFor(['for_individual']);
    setAddScopeLevel(['assignable']);
    setAddRules('');
    setAddStatus('');
    setAddOpen(false);
    toast({ title: 'Permission created' });
    redirectInApp(router, applicationHref('/application/permissions', appId, { permission: createdPermission.id, mode }));
  };

  return (
    <>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search permissions... e.g. sort:asc&name:access"
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
          filteredPermissions.map((permission) => {
            return (
              <FlowLink
                key={permission.id}
                href={applicationHref('/application/permissions', appId, { permission: permission.id, mode })}
                className="group flex items-center justify-between gap-4 border-b px-4 py-4 last:border-b-0 transition-colors hover:bg-muted/40 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium leading-6">{permission.name}</p>
                  {permission.description ? (
                    <p className="truncate text-sm text-muted-foreground">{permission.description}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {permission.scopeFor.map((label) => (
                      <Badge key={label} variant="outline" className="text-xs">
                        {label}
                      </Badge>
                    ))}
                    {permission.scopeLevel.map((label) => (
                      <Badge key={label} variant="outline" className="text-xs">
                        {label}
                      </Badge>
                    ))}
                    {permission.status ? (
                      <Badge variant="outline" className="text-xs">
                        status:{permission.status}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>
            );
          })
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
            setAddScopeFor(['for_individual']);
            setAddScopeLevel(['assignable']);
            setAddRules('');
            setAddStatus('');
          }
        }}
      >
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>New Permission</DialogTitle>
            <DialogDescription>
              Enter a readable permission title. The technical permission ID is generated automatically from the application ID and title.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={addName} onChange={(event) => setAddName(event.target.value)} placeholder="Title, e.g. Orders Read" autoFocus />
            <Textarea value={addDesc} onChange={(event) => setAddDesc(event.target.value)} placeholder="Description (optional)" />
            <ScopeForSelector value={addScopeFor} onChange={setAddScopeFor} />
            <ScopeLevelSelector value={addScopeLevel} onChange={setAddScopeLevel} />
            <Input value={addRules} onChange={(event) => setAddRules(event.target.value)} placeholder="Rules (optional)" />
            <Input value={addStatus} onChange={(event) => setAddStatus(event.target.value)} placeholder="Status (optional)" />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleAdd} disabled={addPending || !addName.trim() || !isValidName(addName)}>
              {addPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
