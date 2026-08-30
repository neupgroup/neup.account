'use client';

import { useRef, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Checkbox } from '#/components/ui/checkbox';
import { Check, Loader2, UserCircle, X } from '@/components/icons';
import { resolveNeupIdForApp, assignAppAccessToAccount, type ResolvedAccount } from './actions';
import { inviteDirectMember } from '../_components/actions';

type Role = { id: string; name: string; description: string | null };

/**
 * ::neup.documentation::assign-app-access-form
 * ::title Assign App Access Form
 *
 * Client form for granting application access to another already-connected account.
 *
 * ::public
 *
 * The form looks up a NeupID, confirms the target account has an active connection for the application, requires active direct-team membership, and then lets the user assign one or more roles.
 *
 * ::public end
 *
 * ::private
 *
 * Lookup and team-membership failures intentionally block the role picker and submit button so callers cannot assign access before the person is on the team and actively connected to the app.
 *
 * ::private end
 *
 * ::end
 */
export function AssignAppAccessForm({
  appId,
  connectionId,
  appName,
  availableRoles,
  initialAccount,
  initialRoleIds,
}: {
  appId: string;
  connectionId?: string;
  appName?: string;
  availableRoles: Role[];
  initialAccount?: ResolvedAccount | null;
  initialRoleIds?: string[];
}) {
  const searchParams = useSearchParams();
  const [neupIdInput, setNeupIdInput] = useState('');
  const [resolved, setResolved] = useState<ResolvedAccount | null>(initialAccount ?? null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(initialRoleIds ?? []));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [teamActionSuccess, setTeamActionSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleLookup = () => {
    if (!neupIdInput.trim()) return;
    setLookupError(null);
    startTransition(async () => {
      const result = await resolveNeupIdForApp(
        appId,
        neupIdInput.trim(),
        searchParams.get('workingProfile'),
      );
      if (result.success) {
        setResolved(result.account);
        setTeamActionSuccess(null);
      } else {
        setResolved(null);
        setLookupError(result.error);
        inputRef.current?.focus();
      }
    });
  };

  const handleRoleToggle = (roleId: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const handleAssign = () => {
    if (!resolved || resolved.teamMembershipStatus !== 'active' || selectedRoles.size === 0) return;
    setSubmitError(null);
    startTransition(async () => {
      const result = await assignAppAccessToAccount({
        appId,
        connectionId,
        memberId: resolved.accountId,
        roleIds: Array.from(selectedRoles),
        selectedAccountId: searchParams.get('workingProfile'),
      });
      if (result.success) {
        setSuccess(true);
        setResolved(null);
        setNeupIdInput('');
        setSelectedRoles(new Set());
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setSubmitError(result.error ?? 'Something went wrong.');
      }
    });
  };

  const handleClear = () => {
    setResolved(null);
    setNeupIdInput('');
    setLookupError(null);
    setSelectedRoles(new Set());
    setSubmitError(null);
    setTeamActionSuccess(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleAddToTeam = () => {
    if (!resolved || resolved.teamMembershipStatus !== 'none') return;
    setSubmitError(null);
    setTeamActionSuccess(null);
    startTransition(async () => {
      const result = await inviteDirectMember(
        resolved.accountId,
        searchParams.get('workingProfile'),
      );
      if (!result.success) {
        setSubmitError(result.error ?? 'Failed to add this person to your team.');
        return;
      }

      setResolved((current) => (
        current
          ? { ...current, teamMembershipStatus: 'invited' }
          : current
      ));
      setTeamActionSuccess('Team invitation sent. They must accept it before you can assign application permissions.');
    });
  };

  if (success) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-green-500 shrink-0" />
        Access granted successfully.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 grid gap-3">
      <p className="text-xs text-muted-foreground">
        Enter a NeupID first. The account must already be on your team and have an active {appName ?? 'application'} connection before you can grant direct access.
      </p>
      {/* Step 1 — NeupID lookup */}
      {!resolved ? (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={neupIdInput}
              onChange={(e) => {
                setNeupIdInput(e.target.value.toLowerCase());
                if (lookupError) setLookupError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleLookup())}
              placeholder="Enter NeupID"
              className={`h-8 text-sm flex-1 ${lookupError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={isPending}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleLookup}
              disabled={isPending || !neupIdInput.trim()}
              className="shrink-0"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Look up'}
            </Button>
          </div>
          {lookupError && (
            <p className="text-xs text-destructive px-0.5">{lookupError}</p>
          )}
        </div>
      ) : (
        /* Step 2 — resolved account + role selection */
        <div className="grid gap-3">
          {/* Account chip */}
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <UserCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{resolved.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {neupIdInput || resolved.accountId}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {resolved.teamMembershipStatus !== 'active' ? (
            <div className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="grid gap-1">
                <p className="text-sm font-medium text-foreground">
                  {resolved.teamMembershipStatus === 'none' ? 'Add to team first' : 'Waiting for team acceptance'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {resolved.teamMembershipStatus === 'none'
                    ? 'This person has an active application connection, but they are not part of your team yet.'
                    : 'This person has already been invited to your team. They must accept the invitation before application permissions can be assigned.'}
                </p>
              </div>
              {resolved.teamMembershipStatus === 'none' && (
                <div className="flex justify-start">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddToTeam}
                    disabled={isPending}
                  >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add to Team'}
                  </Button>
                </div>
              )}
              {teamActionSuccess && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">{teamActionSuccess}</p>
              )}
            </div>
          ) : (
            <>
              {availableRoles.length > 0 ? (
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Select roles
                  </p>
                  <div className="overflow-hidden rounded-md border divide-y">
                    {availableRoles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <Checkbox
                          id={`role-${appId}-${role.id}`}
                          checked={selectedRoles.has(role.id)}
                          onCheckedChange={() => handleRoleToggle(role.id)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{role.name}</p>
                          {role.description && (
                            <p className="text-xs text-muted-foreground">{role.description}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No roles defined for this application yet.
                </p>
              )}
            </>
          )}

          {submitError && (
            <p className="text-xs text-destructive">{submitError}</p>
          )}

          {resolved.teamMembershipStatus === 'active' && (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={handleAssign}
                disabled={isPending || selectedRoles.size === 0}
                className="gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Grant Access
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
