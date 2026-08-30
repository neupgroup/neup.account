"use client";

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { Checkbox } from '#/components/ui/checkbox';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Badge } from '#/components/ui/badge';
import { Loader2, UserPlus } from '@/components/icons';
import { useToast } from '#/core/hooks/useToast';
import {
  getAccountByNeupId,
  updateManagedAccountAccess,
  type ManagedAccountAccessAssignableRole,
} from '@/services/manage/users';

type ResolvedMember = {
  accountId: string;
  displayName: string;
  accountPhoto?: string;
};

export function ManagedAccountAccessForm({
  accountId,
  roles,
  canEdit,
}: {
  accountId: string;
  roles: ManagedAccountAccessAssignableRole[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [lookupValue, setLookupValue] = useState('');
  const [resolvedMember, setResolvedMember] = useState<ResolvedMember | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, startLookup] = useTransition();
  const [isSaving, startSave] = useTransition();

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
      setSelectedRoleIds(new Set());
      setLookupError(null);
    });
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((current) => {
      const next = new Set(current);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const handleGrant = () => {
    if (!resolvedMember) return;

    startSave(async () => {
      const result = await updateManagedAccountAccess({
        accountId,
        memberId: resolvedMember.accountId,
        roleIds: Array.from(selectedRoleIds),
      });

      if (result.success) {
        toast({
          title: 'Access updated',
          description: `Direct access roles were updated for ${resolvedMember.displayName}.`,
          className: 'bg-accent text-accent-foreground',
        });
        setResolvedMember(null);
        setLookupValue('');
        setSelectedRoleIds(new Set());
        router.refresh();
      } else {
        toast({
          variant: 'destructive',
          title: 'Could not update access',
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
              htmlType="button"
              size="icon"
              type="plain"
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
            <Badge type="tinted">Selected</Badge>
          </div>
        )}

        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Role assignment</h3>
              <p className="text-sm text-muted-foreground">
                Choose the direct roles this account should get immediately.
              </p>
            </div>
            <Badge type="outlined">{selectedRoleIds.size} selected</Badge>
          </div>

          <div className="rounded-lg border">
            {roles.length > 0 ? (
              roles.map((role) => {
                const checked = selectedRoleIds.has(role.id);

                return (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-start gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleRole(role.id)}
                      disabled={!canEdit || isSaving}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{role.name}</p>
                      {role.description && (
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      )}
                    </div>
                    {checked && <Badge type="tinted">Selected</Badge>}
                  </label>
                );
              })
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No assignable roles are available.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Saving replaces direct role assignments for this account immediately, without sending an invitation.
          </p>
          <Button
            htmlType="button"
            onClick={handleGrant}
            disabled={!canEdit || !resolvedMember || selectedRoleIds.size === 0 || isSaving}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Access
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
