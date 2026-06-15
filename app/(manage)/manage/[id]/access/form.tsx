"use client";

import { useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus } from '@/components/icons';
import { useToast } from '@/core/hooks/use-toast';
import {
  getAccountByNeupId,
  grantManagedAccountAccess,
  type ManagedAccountAccessPermission,
} from '@/services/manage/users';

type ResolvedMember = {
  accountId: string;
  displayName: string;
  accountPhoto?: string;
};

type PermissionGroup = {
  title: string;
  match: (name: string) => boolean;
};

const PERMISSION_GROUPS: PermissionGroup[] = [
  { title: 'Account', match: (name) => name.startsWith('root.account.') },
  { title: 'Permissions', match: (name) => name.startsWith('root.permission.') },
  { title: 'Applications', match: (name) => name.startsWith('root.application.') },
  { title: 'Profile', match: (name) => name.startsWith('profile.') },
  { title: 'Security', match: (name) => name.startsWith('security.') },
  { title: 'Notifications', match: (name) => name.startsWith('notification.') },
  { title: 'Linked Accounts', match: (name) => name.startsWith('linked_accounts.') },
  { title: 'Data & Privacy', match: (name) => name.startsWith('data.') },
  { title: 'People', match: (name) => name.startsWith('people.') },
  { title: 'Payment', match: (name) => name.startsWith('payment.') },
];

function groupPermissions(permissions: ManagedAccountAccessPermission[]) {
  const grouped = new Map<string, ManagedAccountAccessPermission[]>();
  const used = new Set<string>();

  for (const group of PERMISSION_GROUPS) {
    const items = permissions.filter((permission) => group.match(permission.name));
    if (items.length > 0) {
      grouped.set(group.title, items);
      items.forEach((permission) => used.add(permission.id));
    }
  }

  const remaining = permissions.filter((permission) => !used.has(permission.id));
  if (remaining.length > 0) {
    grouped.set('Other', remaining);
  }

  return Array.from(grouped.entries());
}

export function ManagedAccountAccessForm({
  accountId,
  permissions,
  canEdit,
}: {
  accountId: string;
  permissions: ManagedAccountAccessPermission[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [lookupValue, setLookupValue] = useState('');
  const [resolvedMember, setResolvedMember] = useState<ResolvedMember | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, startLookup] = useTransition();
  const [isSaving, startSave] = useTransition();

  const groupedPermissions = useMemo(() => groupPermissions(permissions), [permissions]);

  const handleLookup = () => {
    const nextLookup = lookupValue.trim().toLowerCase();
    if (!nextLookup) return;

    setLookupError(null);
    startLookup(async () => {
      const result = await getAccountByNeupId(nextLookup);
      if (!result) {
        setResolvedMember(null);
        setLookupError('No account found for that NeupID.');
        return;
      }

      if (result.accountId === accountId) {
        setResolvedMember(null);
        setLookupError('Use the permissions page to manage the account owner itself.');
        return;
      }

      setResolvedMember(result);
      setSelectedPermissionIds(new Set());
      setLookupError(null);
    });
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissionIds((current) => {
      const next = new Set(current);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const handleGrant = () => {
    if (!resolvedMember) return;

    startSave(async () => {
      const result = await grantManagedAccountAccess({
        accountId,
        memberId: resolvedMember.accountId,
        permissions: Array.from(selectedPermissionIds),
      });

      if (result.success) {
        toast({
          title: 'Access granted',
          description: `Direct access was assigned to ${resolvedMember.displayName}.`,
          className: 'bg-accent text-accent-foreground',
        });
        setResolvedMember(null);
        setLookupValue('');
        setSelectedPermissionIds(new Set());
        router.refresh();
      } else {
        toast({
          variant: 'destructive',
          title: 'Could not grant access',
          description: result.error ?? 'An unexpected error occurred.',
        });
      }
    });
  };

  return (
    <Card>
      <CardContent className="grid gap-6 p-6">
        <div className="grid gap-2">
          <Label htmlFor="neupId">Add account by NeupID</Label>
          <div className="relative">
            <Input
              id="neupId"
              value={lookupValue}
              onChange={(event) => {
                setLookupValue(event.target.value.toLowerCase());
                if (lookupError) setLookupError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleLookup();
                }
              }}
              placeholder="Enter NeupID"
              disabled={!canEdit || isLookingUp || isSaving}
              aria-invalid={!!lookupError}
              className={lookupError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handleLookup}
              disabled={!canEdit || isLookingUp || isSaving || !lookupValue.trim()}
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent"
            >
              {isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span className="sr-only">Look up account</span>
            </Button>
          </div>
          {lookupError && <p className="text-xs text-destructive">{lookupError}</p>}
        </div>

        {resolvedMember && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
            <span className="flex h-12 w-12 overflow-hidden rounded-full bg-muted">
              {resolvedMember.accountPhoto ? (
                <Image
                  src={resolvedMember.accountPhoto}
                  alt={resolvedMember.displayName}
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{resolvedMember.displayName}</p>
              <p className="text-sm text-muted-foreground font-mono">{resolvedMember.accountId}</p>
            </div>
            <Badge variant="secondary">Selected</Badge>
          </div>
        )}

        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Permission set</h3>
              <p className="text-sm text-muted-foreground">
                Choose the permissions this account should get immediately.
              </p>
            </div>
            <Badge variant="outline">{selectedPermissionIds.size} selected</Badge>
          </div>

          <div className="grid gap-4">
            {groupedPermissions.map(([groupTitle, items]) => (
              <div key={groupTitle} className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {groupTitle}
                </p>
                <div className="rounded-lg border">
                  {items.map((permission, index) => {
                    const checked = selectedPermissionIds.has(permission.id);
                    const rounded =
                      items.length === 1
                        ? 'rounded-lg'
                        : index === 0
                          ? 'rounded-t-lg'
                          : index === items.length - 1
                            ? 'rounded-b-lg'
                            : '';

                    return (
                      <label
                        key={permission.id}
                        className={[
                          'flex cursor-pointer items-start gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40',
                          rounded,
                        ].join(' ')}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => togglePermission(permission.id)}
                          disabled={!canEdit || isSaving}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{permission.name}</p>
                          {permission.description && (
                            <p className="text-xs text-muted-foreground">{permission.description}</p>
                          )}
                        </div>
                        {checked && <Badge variant="secondary">Selected</Badge>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Direct access is granted immediately without sending an invitation.
          </p>
          <Button
            type="button"
            onClick={handleGrant}
            disabled={!canEdit || !resolvedMember || selectedPermissionIds.size === 0 || isSaving}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Grant Access
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
