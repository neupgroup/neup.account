"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AppWindow, Building, Database, Loader2, Plus, X } from "@/components/icons";
import { getSelectableAssets, type AssetType, type SelectableAsset } from "./actions";

const ASSET_TYPES: { type: AssetType; label: string; icon: React.ReactNode }[] = [
  {
    type: "brand_account",
    label: "Brand Account",
    icon: <Building className="h-4 w-4" />,
  },
  {
    type: "subbrand_account",
    label: "Subbrand Account",
    icon: <Building className="h-4 w-4" />,
  },
  {
    type: "application",
    label: "Application",
    icon: <AppWindow className="h-4 w-4" />,
  },
];

export function AddAssetForm({
  action,
  existingAssetIds = [],
  mode,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Asset IDs already in this portfolio — used to filter the picker list. */
  existingAssetIds?: string[];
  mode?: string;
}) {
  const [step, setStep] = useState<"type" | "pick">("type");
  const [selectedType, setSelectedType] = useState<AssetType | null>(null);
  const [assets, setAssets] = useState<SelectableAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<SelectableAsset | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSelectType = (type: AssetType) => {
    setSelectedType(type);
    setLoadError(null);
    setAssets([]);
    startTransition(async () => {
      const result = await getSelectableAssets(type, existingAssetIds);
      if (result.length === 0) {
        setLoadError("No assets available for this type.");
      }
      setAssets(result);
      setStep("pick");
    });
  };

  const handleReset = () => {
    setStep("type");
    setSelectedType(null);
    setAssets([]);
    setSelectedAsset(null);
    setLoadError(null);
  };

  const typeLabel = ASSET_TYPES.find((t) => t.type === selectedType)?.label;

  return (
    <div className="px-4 py-3 grid gap-3">
      {/* Step 1 — choose type */}
      {step === "type" && (
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => handleSelectType(t.type)}
              disabled={isPending}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors disabled:opacity-50"
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Step 2 — pick asset */}
      {step === "pick" && (
        <>
          {/* Back / type label */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {typeLabel}
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              Change type
            </button>
          </div>

          {isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : loadError ? (
            <p className="text-sm text-muted-foreground py-1">{loadError}</p>
          ) : selectedAsset ? (
            /* Confirmed selection — show chip + submit */
            <form action={action} className="grid gap-3">
              <input type="hidden" name="asset" value={selectedAsset.assetId} />
              <input type="hidden" name="type" value={selectedAsset.assetType} />
              {mode === 'root' && <input type="hidden" name="mode" value="root" />}

              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{selectedAsset.name}</p>
                    {selectedAsset.subtitle && (
                      <p className="text-xs text-muted-foreground truncate">{selectedAsset.subtitle}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear selection"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Add Asset
                </Button>
              </div>
            </form>
          ) : (
            /* Asset list */
            <div className="overflow-hidden rounded-md border divide-y">
              {assets.map((asset) => (
                <button
                  key={asset.assetId}
                  type="button"
                  onClick={() => setSelectedAsset(asset)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{asset.name}</p>
                    {asset.subtitle && (
                      <p className="text-xs text-muted-foreground truncate">{asset.subtitle}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
