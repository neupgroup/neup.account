'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { PermissionScopeBadges } from './permission-scope-badges';

type Props = {
  appId: string;
  initialPermissions: AppPermission[];
  canManage: boolean;
  mode?: string;
  scopeHint?: string;
};

type PermissionSearchFilters = {
  nameTerms: string[];
  plainTerms: string[];
  scopes: string[];
  sort: 'asc' | 'desc';
};

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
        const normalizedScope = part.trim().toLowerCase();
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

export function PermissionPanel({
  appId,
  initialPermissions,
  canManage,
  mode,
  scopeHint,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<AppPermission[]>(initialPermissions);
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addScope, setAddScope] = useState('');
  const [addAcquisitionType, setAddAcquisitionType] = useState<'assignment' | 'public_request' | 'invitation' | 'system_generated'>('assignment');
  const [addApprovalPolicy, setAddApprovalPolicy] = useState<'none' | 'approval_required'>('none');
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
        const matchesScope =
          filters.scopes.length === 0 ||
          filters.scopes.includes((permission.scope ?? '').trim().toLowerCase());

        return matchesName && matchesPlain && matchesScope;
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
      scope: addScope || undefined,
      acquisitionType: addAcquisitionType,
      approvalPolicy: addApprovalPolicy,
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
    setAddScope('');
    setAddAcquisitionType('assignment');
    setAddApprovalPolicy('none');
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
                    <PermissionScopeBadges scope={permission.scope} />
                    {permission.acquisitionType ? (
                      <Badge variant="outline" className="text-xs">
                        acquisition:{permission.acquisitionType}
                      </Badge>
                    ) : null}
                    {permission.approvalPolicy ? (
                      <Badge variant="outline" className="text-xs">
                        approval:{permission.approvalPolicy}
                      </Badge>
                    ) : null}
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
            setAddScope('');
            setAddAcquisitionType('assignment');
            setAddApprovalPolicy('none');
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
            <Input value={addScope} onChange={(event) => setAddScope(event.target.value)} placeholder="Scope (optional)" />
            {scopeHint ? (
              <p className="text-xs text-muted-foreground">{scopeHint}</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={addAcquisitionType} onValueChange={(value) => setAddAcquisitionType(value as typeof addAcquisitionType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Acquisition type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assignment">assignment</SelectItem>
                  <SelectItem value="public_request">public_request</SelectItem>
                  <SelectItem value="invitation">invitation</SelectItem>
                  <SelectItem value="system_generated">system_generated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={addApprovalPolicy} onValueChange={(value) => setAddApprovalPolicy(value as typeof addApprovalPolicy)}>
                <SelectTrigger>
                  <SelectValue placeholder="Approval policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="approval_required">approval_required</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
