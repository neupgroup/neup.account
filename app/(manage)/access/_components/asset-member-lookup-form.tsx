"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Loader2, UserPlus, UserCircle } from "@/components/icons";
import { assignOrInviteAssetMember, getAssignableRolesForAsset, resolveNeupId } from "./actions";

type ResolvedAccount = {
  accountId: string;
  displayName: string;
};

type AssetRole = {
  id: string;
  name: string;
  description?: string;
};

/**
 * ::neup.documentation::asset-member-lookup-form-component
 * ::title Asset Member Lookup Form
 *
 * Client-side lookup and assignment form for inviting or assigning a member to an asset.
 *
 * ::public
 *
 * The form resolves a NeupID to an account, optionally loads assignable roles in root mode, and then either assigns or invites the member to the target asset.
 *
 * ::public end
 *
 * ::private
 *
 * Root mode requires a selected role before assignment, while non-root mode keeps the flow as an invitation-only action.
 *
 * ::private end
 *
 * ::end
 */
export function AssetMemberLookupForm({
  assetId,
  rootMode,
}: {
  assetId: string;
  rootMode: boolean;
}) {
  const [neupIdInput, setNeupIdInput] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedAccount | null>(null);
  const [roles, setRoles] = useState<AssetRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [isLookupPending, startLookupTransition] = useTransition();
  const [isActionPending, startActionTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!rootMode) return;

    let cancelled = false;
    const loadRoles = async () => {
      setRolesLoading(true);
      setRolesError(null);
      const result = await getAssignableRolesForAsset(assetId);
      if (cancelled) return;

      if (!result.success) {
        setRoles([]);
        setSelectedRoleId("");
        setRolesError(result.error || "Failed to load roles.");
      } else {
        const nextRoles = result.roles || [];
        setRoles(nextRoles);
        setSelectedRoleId(nextRoles[0]?.id || "");
      }
      setRolesLoading(false);
    };

    void loadRoles();
    return () => {
      cancelled = true;
    };
  }, [assetId, rootMode]);

  const handleLookup = () => {
    if (!neupIdInput.trim()) return;
    setLookupError(null);
    setActionError(null);
    setSuccessMessage(null);
    startLookupTransition(async () => {
      const result = await resolveNeupId(neupIdInput);
      if (result.success) {
        setResolved(result.account);
      } else {
        setResolved(null);
        setLookupError(result.error);
        inputRef.current?.focus();
      }
    });
  };

  const handleAction = () => {
    if (!resolved) return;
    if (rootMode && !selectedRoleId) {
      setActionError("Please select a role before assigning access.");
      return;
    }
    setActionError(null);
    setSuccessMessage(null);
    startActionTransition(async () => {
      const result = await assignOrInviteAssetMember({
        assetRef: assetId,
        memberId: resolved.accountId,
        roleId: rootMode ? selectedRoleId : undefined,
        rootMode,
      });
      if (!result.success) {
        setActionError(result.error || "Failed to process request.");
        return;
      }

      setSuccessMessage(
        result.mode === "assigned"
          ? `${resolved.displayName} was assigned to this asset.`
          : `${resolved.displayName} was invited to this asset.`
      );
    });
  };

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Input
          ref={inputRef}
          value={neupIdInput}
          onChange={(e) => {
            setNeupIdInput(e.target.value.toLowerCase());
            if (lookupError) setLookupError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleLookup())}
          placeholder="Enter NeupID"
          className={`pr-10 ${lookupError ? "border-destructive focus-visible:ring-destructive" : ""}`}
          disabled={isLookupPending || isActionPending}
          aria-invalid={!!lookupError}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleLookup}
          disabled={isLookupPending || isActionPending || !neupIdInput.trim()}
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent"
        >
          {isLookupPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          <span className="sr-only">Look up</span>
        </Button>
      </div>

      {lookupError && <p className="text-xs text-destructive px-0.5">{lookupError}</p>}
      {rolesError && <p className="text-xs text-destructive px-0.5">{rolesError}</p>}
      {actionError && <p className="text-xs text-destructive px-0.5">{actionError}</p>}
      {successMessage && <p className="text-xs text-emerald-600 px-0.5">{successMessage}</p>}

      {rootMode && (
        <div className="grid gap-1.5">
          <label htmlFor="asset-role" className="text-xs text-muted-foreground px-0.5">
            Access Role
          </label>
          <select
            id="asset-role"
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            disabled={rolesLoading || isLookupPending || isActionPending || roles.length === 0}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {rolesLoading ? (
              <option value="">Loading roles…</option>
            ) : roles.length === 0 ? (
              <option value="">No roles available</option>
            ) : (
              roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      {resolved && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{resolved.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{resolved.accountId}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleAction}
            disabled={
              isLookupPending ||
              isActionPending ||
              (rootMode && (rolesLoading || roles.length === 0 || !selectedRoleId))
            }
          >
            {isActionPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Processing
              </>
            ) : rootMode ? (
              "Assign Asset"
            ) : (
              "Invite to Asset"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
