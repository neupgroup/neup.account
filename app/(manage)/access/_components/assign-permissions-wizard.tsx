"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import {
  UserCircle,
  Database,
  Check,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "@/components/icons";
import { getSelectableAssets, type AssetType, type SelectableAsset } from "./actions";
import {
  getRolesForAssetType,
  getMemberAssetGrants,
  type AssetRole,
  type MemberAssetGrant,
} from "@/services/manage/access/assets";

type Member = { id: string; accountId: string; displayName: string };

const ASSET_TYPES: { type: AssetType; label: string }[] = [
  { type: "brand_account", label: "Brand Account" },
  { type: "subbrand_account", label: "Subbrand Account" },
  { type: "application", label: "Application" },
];

type Step = "member" | "asset-type" | "assets" | "roles" | "confirm";

// ─── Asset row ────────────────────────────────────────────────────────────────

function AssetRow({
  asset,
  isSelected,
  existingRoleIds,
  onToggle,
}: {
  asset: SelectableAsset;
  isSelected: boolean;
  existingRoleIds: string[];
  onToggle: () => void;
}) {
  const hasExisting = existingRoleIds.length > 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          isSelected ? "bg-foreground border-foreground" : "border-border"
        }`}
      >
        {isSelected && <Check className="h-3 w-3 text-background" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{asset.name}</p>
        {asset.subtitle && (
          <p className="text-xs text-muted-foreground truncate">{asset.subtitle}</p>
        )}
      </div>
      {hasExisting && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {existingRoleIds.length} role{existingRoleIds.length !== 1 ? "s" : ""} assigned
        </span>
      )}
    </button>
  );
}

// ─── Role row ─────────────────────────────────────────────────────────────────

function RoleRow({
  role,
  isSelected,
  onToggle,
}: {
  role: AssetRole;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          isSelected ? "bg-foreground border-foreground" : "border-border"
        }`}
      >
        {isSelected && <Check className="h-3 w-3 text-background" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{role.name}</p>
        {role.description && (
          <p className="text-xs text-muted-foreground">{role.description}</p>
        )}
      </div>
    </button>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function AssignPermissionsWizard({
  action,
  members,
  existingAssetIds,
  groupId,
  initialMemberAccountId,
}: {
  action: (formData: FormData) => Promise<void>;
  members: Member[];
  /** assetIds already in the portfolio (used to exclude from "add" picker) */
  existingAssetIds: string[];
  groupId: string;
  initialMemberAccountId?: string;
}) {
  const [step, setStep] = useState<Step>("member");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);

  // All assets available for the chosen type (already-in-portfolio ones included via existingGrants)
  const [availableAssets, setAvailableAssets] = useState<SelectableAsset[]>([]);
  // Assets the member already has grants on (for this portfolio)
  const [existingGrants, setExistingGrants] = useState<MemberAssetGrant[]>([]);
  // Available roles for the chosen asset type
  const [availableRoles, setAvailableRoles] = useState<AssetRole[]>([]);

  // Selected asset IDs (assetId, not portfolioAssetId)
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  // Selected role IDs
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());

  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!initialMemberAccountId) return;
    const preset = members.find((m) => m.accountId === initialMemberAccountId);
    if (!preset) return;
    setSelectedMember(preset);
    setStep("asset-type");
  }, [initialMemberAccountId, members]);

  // ── helpers ──────────────────────────────────────────────────────────────

  const existingGrantMap = new Map<string, string[]>(
    existingGrants.map((g) => [g.assetId, g.roleIds])
  );

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member);
    setStep("asset-type");
  };

  const handleAssetTypeSelect = (type: AssetType) => {
    setSelectedAssetType(type);
    setIsLoading(true);
    setSelectedAssetIds(new Set());
    setSelectedRoleIds(new Set());

    startTransition(async () => {
      // Load assets NOT yet in portfolio + roles + existing grants for this member
      const [newAssets, roles, grants] = await Promise.all([
        getSelectableAssets(type, existingAssetIds),
        getRolesForAssetType(type),
        getMemberAssetGrants(groupId, selectedMember!.id),
      ]);

      // Filter grants to only those matching this asset type
      const typeGrants = grants.filter(
        (g) => g.assetType.toLowerCase() === type.toLowerCase()
      );

      // Build the full asset list:
      // 1. Assets already in portfolio that the member has grants on (show first)
      // 2. Assets already in portfolio but no grants yet
      // 3. New assets not yet in portfolio
      //
      // We represent "already in portfolio" assets as SelectableAsset using grant data.
      const alreadyGrantedAssets: SelectableAsset[] = typeGrants.map((g) => ({
        assetId: g.assetId,
        name: g.assetName,
        assetType: g.assetType,
        subtitle: `${g.roleIds.length} role${g.roleIds.length !== 1 ? "s" : ""} assigned`,
      }));

      // Deduplicate: don't show an asset twice if it's in both lists
      const grantedAssetIds = new Set(typeGrants.map((g) => g.assetId));
      const freshAssets = newAssets.filter((a) => !grantedAssetIds.has(a.assetId));

      setAvailableAssets([...alreadyGrantedAssets, ...freshAssets]);
      setAvailableRoles(roles);
      setExistingGrants(typeGrants);
      setIsLoading(false);
      setStep("assets");
    });
  };

  const handleAssetToggle = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleRoleToggle = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const handleReset = () => {
    setStep("member");
    setSelectedMember(null);
    setSelectedAssetType(null);
    setAvailableAssets([]);
    setExistingGrants([]);
    setAvailableRoles([]);
    setSelectedAssetIds(new Set());
    setSelectedRoleIds(new Set());
  };

  // Pre-populate roles when moving to roles step if only one asset is selected
  // and it already has grants — pre-check those roles
  const handleProceedToRoles = () => {
    if (selectedAssetIds.size === 1) {
      const [assetId] = Array.from(selectedAssetIds);
      const existing = existingGrantMap.get(assetId);
      if (existing && existing.length > 0) {
        setSelectedRoleIds(new Set(existing));
      }
    }
    setStep("roles");
  };

  const selectedAssets = availableAssets.filter((a) =>
    selectedAssetIds.has(a.assetId)
  );

  const canProceedFromAssets = selectedAssetIds.size > 0;
  const canProceedFromRoles = selectedRoleIds.size > 0;

  // ── steps ────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-3 grid gap-4">
      {/* Progress */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
        {(["member", "asset-type", "assets", "roles", "confirm"] as Step[]).map(
          (s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span className={step === s ? "text-foreground font-medium" : ""}>
                {i + 1}.{" "}
                {s === "member"
                  ? "Member"
                  : s === "asset-type"
                  ? "Type"
                  : s === "assets"
                  ? "Assets"
                  : s === "roles"
                  ? "Roles"
                  : "Confirm"}
              </span>
            </span>
          )
        )}
      </div>

      {/* ── Step 1: Member ── */}
      {step === "member" && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Select a member</p>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No members in this portfolio yet.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleMemberSelect(m)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <UserCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm">{m.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Asset Type ── */}
      {step === "asset-type" && selectedMember && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{selectedMember.displayName}</span>
            </div>
            <Button htmlType="button" type="plain" size="sm" onClick={() => setStep("member")}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
          </div>
          <p className="text-sm font-medium">Select asset type</p>
          <div className="grid gap-2">
            {ASSET_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => handleAssetTypeSelect(t.type)}
                disabled={isLoading}
                className="flex items-center gap-3 rounded-md border px-4 py-3 text-left hover:bg-muted/40 transition-colors disabled:opacity-50"
              >
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t.label}</span>
                {isLoading && <Loader2 className="h-3.5 w-3.5 ml-auto animate-spin" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3: Assets ── */}
      {step === "assets" && selectedAssetType && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline">
              {ASSET_TYPES.find((t) => t.type === selectedAssetType)?.label}
            </Badge>
            <Button
              htmlType="button"
              type="plain"
              size="sm"
              onClick={() => {
                setStep("asset-type");
                setSelectedAssetIds(new Set());
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
          </div>

          <p className="text-sm font-medium">
            Select assets
            <span className="ml-1.5 text-muted-foreground font-normal">
              ({selectedAssetIds.size} selected)
            </span>
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : availableAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No assets available.</p>
          ) : (
            <>
              {/* Already-granted section */}
              {existingGrants.filter((g) => g.assetType.toLowerCase() === selectedAssetType.toLowerCase()).length > 0 && (
                <p className="text-xs text-muted-foreground -mb-1">
                  Assets with existing permissions are shown first.
                </p>
              )}
              <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                {availableAssets.map((asset) => (
                  <AssetRow
                    key={asset.assetId}
                    asset={asset}
                    isSelected={selectedAssetIds.has(asset.assetId)}
                    existingRoleIds={existingGrantMap.get(asset.assetId) ?? []}
                    onToggle={() => handleAssetToggle(asset.assetId)}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button
              htmlType="button"
              size="sm"
              onClick={handleProceedToRoles}
              disabled={!canProceedFromAssets}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Roles ── */}
      {step === "roles" && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline">{selectedAssetIds.size} asset{selectedAssetIds.size !== 1 ? "s" : ""}</Badge>
            <Button
              htmlType="button"
              type="plain"
              size="sm"
              onClick={() => setStep("assets")}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
          </div>

          <p className="text-sm font-medium">
            Select roles
            <span className="ml-1.5 text-muted-foreground font-normal">
              ({selectedRoleIds.size} selected)
            </span>
          </p>

          {availableRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No roles available for this asset type.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {availableRoles.map((role) => (
                <RoleRow
                  key={role.id}
                  role={role}
                  isSelected={selectedRoleIds.has(role.id)}
                  onToggle={() => handleRoleToggle(role.id)}
                />
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              htmlType="button"
              size="sm"
              onClick={() => setStep("confirm")}
              disabled={!canProceedFromRoles}
            >
              Review
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 5: Confirm ── */}
      {step === "confirm" && selectedMember && (
        <form action={action} className="grid gap-4">
          <input type="hidden" name="memberId" value={selectedMember.id} />
          <input type="hidden" name="assetIds" value={Array.from(selectedAssetIds).join(",")} />
          <input type="hidden" name="assetType" value={selectedAssetType || ""} />
          <input type="hidden" name="roleIds" value={Array.from(selectedRoleIds).join(",")} />

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Review and confirm</p>
            <Button htmlType="button" type="plain" size="sm" onClick={() => setStep("roles")}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
          </div>

          <div className="rounded-md border divide-y text-sm">
            {/* Member */}
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Member</p>
              <div className="flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedMember.displayName}</span>
              </div>
            </div>

            {/* Assets */}
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Assets ({selectedAssets.length})
              </p>
              <div className="grid gap-2">
                {selectedAssets.map((a) => {
                  const existing = existingGrantMap.get(a.assetId) ?? [];
                  const isUpdate = existing.length > 0;
                  return (
                    <div key={a.assetId} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.name}</span>
                      </div>
                      {isUpdate && (
                        <Badge variant="outline" className="text-xs shrink-0">update</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Roles */}
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Roles ({selectedRoleIds.size})
              </p>
              <div className="flex flex-wrap gap-1">
                {Array.from(selectedRoleIds).map((roleId) => {
                  const role = availableRoles.find((r) => r.id === roleId);
                  return (
                    <Badge key={roleId} variant="secondary" className="text-xs">
                      {role?.name ?? roleId}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Note about updates */}
          {selectedAssets.some((a) => (existingGrantMap.get(a.assetId) ?? []).length > 0) && (
            <p className="text-xs text-muted-foreground">
              Assets marked "update" will have their existing roles replaced with the selected roles.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button htmlType="button" type="outlined" size="sm" onClick={handleReset}>
              Cancel
            </Button>
            <Button htmlType="submit" size="sm" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Save Permissions
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
