"use client";

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X } from '@/components/icons';
import {
  decodeRoleScope,
  emptyScopeAudience,
  encodeRoleScope,
  expandRoleScope,
  formatScopeAudience,
  normalizeAccountTypeForRoleScope,
  type ScopeAudience,
  type ScopeAccountKey,
  type ScopeMode,
} from '@/services/role-scopes';

const MODE_OPTIONS: ScopeMode[] = ['managed', 'public', 'toApprove', 'root'];
const ACCOUNT_OPTIONS: Array<{ key: keyof ScopeAudience; label: string }> = [
  { key: 'individual', label: 'Individual' },
  { key: 'dependent', label: 'Dependent' },
  { key: 'brand', label: 'Brand' },
  { key: 'branch', label: 'Branch' },
];

function scopeAudienceForAccount(accountKey: ScopeAccountKey): ScopeAudience {
  return {
    individual: accountKey === 'individual',
    dependent: accountKey === 'dependent',
    brand: accountKey === 'brand',
    branch: accountKey === 'branch',
  };
}

function normalizeAudience(mode: ScopeMode, audience: ScopeAudience): ScopeAudience {
  if (mode === 'root') {
    return scopeAudienceForAccount('individual');
  }

  const activeAccount =
    ACCOUNT_OPTIONS.find((option) => audience[option.key])?.key ?? 'individual';
  return scopeAudienceForAccount(activeAccount);
}

function hasAudience(audience: ScopeAudience): boolean {
  return audience.individual || audience.dependent || audience.brand || audience.branch;
}

function ScopeBuilder({
  mode,
  audience,
  onModeChange,
  onAudienceChange,
}: {
  mode: ScopeMode;
  audience: ScopeAudience;
  onModeChange: (mode: ScopeMode) => void;
  onAudienceChange: (audience: ScopeAudience) => void;
}) {
  const normalizedAudience = normalizeAudience(mode, audience);
  const encodedScope = hasAudience(normalizedAudience)
    ? encodeRoleScope(mode, normalizedAudience)
    : '';

  return (
    <div className="grid gap-3 rounded-md border bg-background p-3">
      <div className="grid gap-2">
        <p className="text-sm font-medium">Mode</p>
        <div className="flex flex-wrap gap-2">
          {MODE_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={mode === option ? 'default' : 'outline'}
              onClick={() => onModeChange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Assignable to</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCOUNT_OPTIONS.map((option) => {
            const checked = normalizedAudience[option.key];
            const disabled = mode === 'root' && option.key !== 'individual';
            return (
              <label
                key={option.key}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  disabled ? 'opacity-60' : 'cursor-pointer'
                }`}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(nextChecked) => {
                    if (!nextChecked) return;
                    onAudienceChange(normalizeAudience(mode, scopeAudienceForAccount(option.key)));
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {encodedScope || 'Choose at least one account type.'}
      </div>
    </div>
  );
}

export function RoleScopeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const decoded = useMemo(() => decodeRoleScope(value), [value]);
  const [mode, setMode] = useState<ScopeMode>(decoded?.mode ?? 'managed');
  const [audience, setAudience] = useState<ScopeAudience>(
    decoded?.audience ?? emptyScopeAudience(),
  );

  useEffect(() => {
    setMode(decoded?.mode ?? 'managed');
    setAudience(decoded?.audience ?? emptyScopeAudience());
  }, [decoded]);

  const apply = (nextMode: ScopeMode, nextAudience: ScopeAudience) => {
    const normalizedAudience = normalizeAudience(nextMode, nextAudience);
    if (!hasAudience(normalizedAudience)) {
      onChange('');
      return;
    }
    onChange(encodeRoleScope(nextMode, normalizedAudience));
  };

  return (
    <ScopeBuilder
      mode={mode}
      audience={audience}
      onModeChange={(nextMode) => {
        setMode(nextMode);
        const nextAudience = normalizeAudience(nextMode, audience);
        setAudience(nextAudience);
        apply(nextMode, nextAudience);
      }}
      onAudienceChange={(nextAudience) => {
        setAudience(nextAudience);
        apply(mode, nextAudience);
      }}
    />
  );
}

export function PermissionScopeSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [mode, setMode] = useState<ScopeMode>('managed');
  const [audience, setAudience] = useState<ScopeAudience>(emptyScopeAudience());
  const normalizedScopes = useMemo(
    () =>
      value.flatMap((scope) => expandRoleScope(scope)).filter((scope, index, array) => array.indexOf(scope) === index),
    [value],
  );

  useEffect(() => {
    const decoded = decodeRoleScope(normalizedScopes[normalizedScopes.length - 1] ?? null);
    setMode(decoded?.mode ?? 'managed');
    setAudience(decoded?.audience ?? emptyScopeAudience());
  }, [normalizedScopes]);

  const currentScope = hasAudience(normalizeAudience(mode, audience))
    ? encodeRoleScope(mode, normalizeAudience(mode, audience))
    : '';

  const addScope = () => {
    if (!currentScope || normalizedScopes.includes(currentScope)) return;
    onChange([...normalizedScopes, currentScope]);
  };

  const removeScope = (scope: string) => {
    onChange(normalizedScopes.filter((item) => item !== scope));
  };

  return (
    <div className="space-y-3">
      <ScopeBuilder
        mode={mode}
        audience={audience}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setAudience(normalizeAudience(nextMode, audience));
        }}
        onAudienceChange={setAudience}
      />

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addScope}
          disabled={!currentScope || normalizedScopes.includes(currentScope)}
        >
          Add Scope
        </Button>
      </div>

      {normalizedScopes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {normalizedScopes.map((scope) => (
            <Badge key={scope} variant="secondary" className="gap-1 pr-1 text-xs">
              <span>{scope}</span>
              <span className="text-muted-foreground">({formatScopeAudience(scope)})</span>
              <button
                type="button"
                onClick={() => removeScope(scope)}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-background/70"
                aria-label={`Remove ${scope}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No scopes selected yet.</p>
      )}
    </div>
  );
}
