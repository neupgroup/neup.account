"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus, UserCircle } from "@/components/icons";
import { assignOrInviteAssetMember, resolveNeupId } from "./actions";

type ResolvedAccount = {
  accountId: string;
  displayName: string;
};

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
  const [isLookupPending, startLookupTransition] = useTransition();
  const [isActionPending, startActionTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

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
    setActionError(null);
    setSuccessMessage(null);
    startActionTransition(async () => {
      const result = await assignOrInviteAssetMember({
        assetRef: assetId,
        targetAccountId: resolved.accountId,
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
      {actionError && <p className="text-xs text-destructive px-0.5">{actionError}</p>}
      {successMessage && <p className="text-xs text-emerald-600 px-0.5">{successMessage}</p>}

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
            disabled={isLookupPending || isActionPending}
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
