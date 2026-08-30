"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Loader2, UserPlus } from "@/components/icons";
import { resolveNeupId } from "./_components/actions";
import { redirectInApp } from "@/.neup/core/helpers/link/navigation";

/**
 * ::neup.documentation::add-user-form
 * ::title Add User Form
 *
 * Resolves a NeupID and redirects into the direct-account access assignment flow.
 *
 * ::public
 *
 * The redirect keeps `selectedProfile` or legacy `selectedAccount` plus `workingProfile` when present, so the assign page resolves the same selected account context as the team page.
 *
 * ::public end
 *
 * ::end
 */
export function AddUserForm() {
  const [neupIdInput, setNeupIdInput] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLookup = () => {
    if (!neupIdInput.trim()) return;
    setLookupError(null);
    startTransition(async () => {
      const result = await resolveNeupId(neupIdInput);
      if (result.success) {
        const params = new URLSearchParams({
          account: result.account.accountId,
        });
        const selectedProfile = searchParams.get("selectedProfile") ?? searchParams.get("selectedAccount");
        const workingProfile = searchParams.get("workingProfile");
        if (selectedProfile) params.set("selectedProfile", selectedProfile);
        if (workingProfile) params.set("workingProfile", workingProfile);
        redirectInApp(router, `/access/assign?${params.toString()}`);
      } else {
        setLookupError(result.error);
        inputRef.current?.focus();
      }
    });
  };

  return (
    <div className="grid gap-1.5">
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
          disabled={isPending}
          aria-invalid={!!lookupError}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleLookup}
          disabled={isPending || !neupIdInput.trim()}
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          <span className="sr-only">Look up</span>
        </Button>
      </div>
      {lookupError && (
        <p className="text-xs text-destructive px-0.5">{lookupError}</p>
      )}
    </div>
  );
}
