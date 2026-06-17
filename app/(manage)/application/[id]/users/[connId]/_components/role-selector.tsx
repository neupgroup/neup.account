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
  currentRoleId: string | null;
};

const INITIAL_VISIBLE = 5;
const LOAD_MORE_COUNT = 10;

export function RoleSelector({ appId, connectionId, roles, currentRoleId }: RoleSelectorProps) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(currentRoleId);
  const [message, setMessage] = useState<string>('');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;

    return roles.filter((role) => {
      const haystacks = [role.name, role.id, role.description ?? ''];
      return haystacks.some((part) => part.toLowerCase().includes(q));
    });
  }, [roles, query]);

  const visibleRoles = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  const handleSelect = (roleId: string) => {
    setMessage('');

    startTransition(async () => {
      const result = await assignApplicationConnectionRole({ appId, connectionId, roleId });
      if (!result.success) {
        setMessage(result.error || 'Could not assign role.');
        return;
      }

      if (result.pendingApproval) {
        setMessage('Approval request created.');
        return;
      }

      setSelectedRoleId(roleId);
      setMessage('Role updated.');
    });
  };

  return (
    <div className="grid gap-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(INITIAL_VISIBLE);
          }}
          placeholder="Search roles by name or id"
          className="pl-10"
        />
      </div>

      <div className="grid gap-2">
        {visibleRoles.map((role) => {
          const isActive = selectedRoleId === role.id;

          return (
            <button
              key={role.id}
              type="button"
              onClick={() => handleSelect(role.id)}
              disabled={pending}
              className="rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{role.name}</p>
                </div>
                {isActive ? <Badge>Current</Badge> : null}
              </div>
              {role.description ? <p className="mt-1 text-xs text-muted-foreground">{role.description}</p> : null}
            </button>
          );
        })}
      </div>

      {hasMore ? (
        <Button variant="outline" className="mt-3" onClick={() => setVisible((v) => v + LOAD_MORE_COUNT)}>
          Show more
        </Button>
      ) : null}

      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
