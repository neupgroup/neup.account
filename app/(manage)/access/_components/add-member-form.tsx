"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus } from "@/components/icons";
import { resolveNeupId } from "./actions";

export function AddMemberForm({
  parentPortfolioId,
  assetId,
  mode,
}: {
  /** Present when on a portfolio page — appended to the redirect URL. */
  parentPortfolioId?: string;
  /** Present when on an asset page — appended to the redirect URL. */
  assetId?: string;
  /** Optional mode, e.g. root. */
  mode?: string;
  /** Kept for backwards compat but no longer used — redirect handles submission. */
  action?: (formData: FormData) => Promise<void>;
}) {
  const [neupIdInput, setNeupIdInput] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleLookup = () => {
    if (!neupIdInput.trim()) return;
    setLookupError(null);
    startTransition(async () => {
      const result = await resolveNeupId(neupIdInput);
      if (result.success) {
        const params = new URLSearchParams({ member: result.account.accountId });
        if (parentPortfolioId) params.set("portfolio", parentPortfolioId);
        if (assetId) params.set("asset", assetId);
        if (mode === "root") params.set("mode", "root");
        router.push(`/access/role?${params.toString()}`);
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
