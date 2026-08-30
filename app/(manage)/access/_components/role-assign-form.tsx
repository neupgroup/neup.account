"use client";

import { useState, useTransition } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Key, Loader2 } from "@/components/icons";
import { getRolesForAsset, type AssetRole } from "@/services/manage/access/assets";

type Member = { id: string; accountId: string; displayName: string };
type Asset = { id: string; label: string };

export function RoleAssignForm({
  action,
  members,
  assets,
}: {
  action: (formData: FormData) => Promise<void>;
  members: Member[];
  assets: Asset[];
}) {
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [roles, setRoles] = useState<AssetRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleAssetChange = (assetId: string) => {
    setSelectedAssetId(assetId);
    setRoles([]);

    if (!assetId) return;

    setRolesLoading(true);
    startTransition(async () => {
      const result = await getRolesForAsset(assetId);
      setRoles(result);
      setRolesLoading(false);
    });
  };

  const hasRoles = roles.length > 0;

  return (
    <form action={action} className="px-4 py-3 grid gap-3 sm:grid-cols-3">
      {/* Account picker */}
      <div>
        <Label htmlFor="assetMember" className="sr-only">Account</Label>
        <select
          id="assetMember"
          name="assetMember"
          aria-label="Select account"
          className="h-8 w-full rounded-md border bg-background px-3 text-sm"
          required
        >
          <option value="">Account</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* Asset picker — triggers role load on change */}
      <div>
        <Label htmlFor="asset" className="sr-only">Asset</Label>
        <select
          id="asset"
          name="asset"
          aria-label="Select asset"
          className="h-8 w-full rounded-md border bg-background px-3 text-sm"
          required
          value={selectedAssetId}
          onChange={(e) => handleAssetChange(e.target.value)}
        >
          <option value="">Asset</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      {/* Role — dropdown when roles exist, free-text fallback otherwise */}
      <div className="flex gap-2">
        {rolesLoading ? (
          <div className="flex h-8 flex-1 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            Loading roles…
          </div>
        ) : hasRoles ? (
          <select
            id="role"
            name="role"
            aria-label="Select role"
            className="h-8 flex-1 rounded-md border bg-background px-3 text-sm"
            required
            defaultValue=""
          >
            <option value="" disabled>Role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id} title={r.description}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id="role"
            name="role"
            placeholder={selectedAssetId ? "No roles found — enter manually" : "Role (e.g. manager.read)"}
            required
            className="h-8 flex-1 text-sm"
          />
        )}

        <Button
          type="submit"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Key className="h-3.5 w-3.5" />
          )}
          Set
        </Button>
      </div>
    </form>
  );
}
