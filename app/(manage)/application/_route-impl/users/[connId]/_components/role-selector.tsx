'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Search } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { assignApplicationConnectionRole, type AppRoleOption } from '@/services/applications/manage';
import { normalizeRoleScopes } from '@/services/role-scopes';

type RoleSelectorProps = {
  appId: string;
  connectionId: string;
  roles: AppRoleOption[];
  currentRoleIds: string[];
  pendingRoleIds: string[];
  rootMode?: boolean;
};

const INITIAL_VISIBLE = 10;
const LOAD_MORE_COUNT = 10;

export function RoleSelector({ appId, connectionId, roles, currentRoleIds, pendingRoleIds, rootMode }: RoleSelectorProps) {
  const manageableRoleIdSet = useMemo(() => new Set(roles.map((role) => role.id)), [roles]);
  const assignableRoleIdSet = useMemo(() => new Set(roles.filter((role) => role.assignable).map((role) => role.id)), [roles]);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(() =>
    Array.from(new Set([...currentRoleIds, ...pendingRoleIds])).filter((roleId) => manageableRoleIdSet.has(roleId)),
  );
  const [pendingSelections, setPendingSelections] = useState<string[]>(() =>
    pendingRoleIds.filter((roleId) => manageableRoleIdSet.has(roleId)),
  );
  const [message, setMessage] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const hasUsableScope = (value: unknown) => normalizeRoleScopes(value).length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const assignableRoles = roles.filter((role) => hasUsableScope(role.scope));
    if (!q) return assignableRoles;

    return assignableRoles.filter((role) => {
      const haystacks = [role.name, role.id, role.description ?? ''];
      return haystacks.some((part) => part.toLowerCase().includes(q));
    });
  }, [roles, query]);

  const visibleRoles = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  useEffect(() => {
    if (!hasMore) return;

    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible((count) => Math.min(count + LOAD_MORE_COUNT, filtered.length));
      },
      { root: null, rootMargin: '160px 0px', threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length, hasMore]);

  const handleToggle = (roleId: string) => {
    if (!assignableRoleIdSet.has(roleId)) return;

    setMessage('');

    const nextSelectedRoleIds = selectedRoleIds.includes(roleId)
      ? selectedRoleIds.filter((id) => id !== roleId)
      : [...selectedRoleIds, roleId];
    const nextAssignableRoleIds = nextSelectedRoleIds.filter((id) => assignableRoleIdSet.has(id));

    startTransition(async () => {
      const result = await assignApplicationConnectionRole({ appId, connectionId, roleIds: nextAssignableRoleIds, rootMode });
      if (!result.success) {
        setMessage(result.error || 'Could not update roles.');
        return;
      }

      const assignedRoleIds = result.roleIds ?? nextSelectedRoleIds;
      const nextPendingRoleIds = result.pendingRoleIds ?? pendingSelections;
      setSelectedRoleIds(Array.from(new Set([...assignedRoleIds, ...nextPendingRoleIds])));
      setPendingSelections(nextPendingRoleIds);

      if (result.pendingApproval) {
        setMessage('Roles updated. Approval request created for approvable roles.');
        return;
      }

      setMessage('Roles updated.');
    });
  };

  return (
    <div className="grid gap-4">
      <div className="relative rounded-xl border bg-background">
        <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisible(INITIAL_VISIBLE);
          }}
          placeholder="Search roles by name or id"
          className="border-0 pl-10"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid gap-0">
          {visibleRoles.length > 0 ? visibleRoles.map((role) => {
            const isSelected = selectedRoleIds.includes(role.id);
            const isPendingSelection = pendingSelections.includes(role.id);
            const isAssignable = role.assignable;

            return (
              <button
                key={role.id}
                type="button"
                onClick={() => handleToggle(role.id)}
                disabled={pending || !isAssignable}
                className="rounded-none border-0 border-t bg-card p-4 text-left transition-colors first:border-t-0 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{role.name}</p>
                    {role.description ? <p className="mt-1 text-xs text-muted-foreground">{role.description}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {isPendingSelection ? <Badge variant="outline">Pending</Badge> : null}
                    {isSelected ? <Badge>Selected</Badge> : null}
                    {!isAssignable ? <Badge variant="secondary">Locked</Badge> : null}
                  </div>
                </div>
              </button>
            );
          }) : (
            <div className="bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No matching roles.
            </div>
          )}
        </div>

        {hasMore ? <div ref={loadMoreRef} className="border-t px-4 py-3 text-center text-sm text-muted-foreground">Loading more roles...</div> : null}
      </div>

      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
