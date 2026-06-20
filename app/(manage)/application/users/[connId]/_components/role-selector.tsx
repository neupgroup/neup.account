'use client';

import { useMemo, useState, useTransition } from 'react';
import { Search } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { assignApplicationConnectionRole, type AppRoleOption } from '@/services/applications/manage';

type RoleSelectorProps = {
  appId: string;
  connectionId: string;
  roles: AppRoleOption[];
  currentRoleIds: string[];
  pendingRoleIds: string[];
};

const INITIAL_VISIBLE = 5;
const LOAD_MORE_COUNT = 10;

export function RoleSelector({ appId, connectionId, roles, currentRoleIds, pendingRoleIds }: RoleSelectorProps) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(() => Array.from(new Set([...currentRoleIds, ...pendingRoleIds])));
  const [pendingSelections, setPendingSelections] = useState<string[]>(pendingRoleIds);
  const [message, setMessage] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const hasUsableScope = (value: string | null | undefined) => typeof value === 'string' && value.trim().length > 0;

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

  const handleToggle = (roleId: string) => {
    setMessage('');

    const nextSelectedRoleIds = selectedRoleIds.includes(roleId)
      ? selectedRoleIds.filter((id) => id !== roleId)
      : [...selectedRoleIds, roleId];

    startTransition(async () => {
      const result = await assignApplicationConnectionRole({ appId, connectionId, roleIds: nextSelectedRoleIds });
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
    <div className="grid gap-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisible(INITIAL_VISIBLE);
          }}
          placeholder="Search roles by name or id"
          className="pl-10"
        />
      </div>

      <div className="grid gap-2">
        {visibleRoles.map((role) => {
          const isSelected = selectedRoleIds.includes(role.id);
          const isPendingSelection = pendingSelections.includes(role.id);

          return (
            <button
              key={role.id}
              type="button"
              onClick={() => handleToggle(role.id)}
              disabled={pending}
              className="rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{role.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isPendingSelection ? <Badge variant="outline">Pending</Badge> : null}
                  {isSelected ? <Badge>Selected</Badge> : null}
                </div>
              </div>
              {role.description ? <p className="mt-1 text-xs text-muted-foreground">{role.description}</p> : null}
            </button>
          );
        })}
      </div>

      {hasMore ? (
        <Button variant="outline" className="mt-3" onClick={() => setVisible((count) => count + LOAD_MORE_COUNT)}>
          Show more
        </Button>
      ) : null}

      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
