'use client';

import { cn } from '#/core/utils';
import {
  ROLE_SCOPE_KEYS,
  normalizeRoleScopes,
  type RoleScope,
} from '@/services/role-scopes';

const ROLE_SCOPE_META: Record<RoleScope, { title: string; description: string }> = {
  'acMgmt.self': {
    title: 'acMgmt.self',
    description: "Self account management for an individual account.",
  },
  'acMgmt.brand': {
    title: 'acMgmt.brand',
    description: 'Manage a brand account by an individual account.',
  },
  'acMgmt.brandSubbrand': {
    title: 'acMgmt.brandSubbrand',
    description: 'Account manager scope that can be applied to both brand and subbrand.',
  },
  'acMgmt.subbrand': {
    title: 'acMgmt.subbrand',
    description: 'Manage a subbrand account by an individual account.',
  },
  'rootMgmt.self': {
    title: 'rootMgmt.self',
    description: 'System root management permissions for root managers.',
  },
};

export function RoleScopeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const selectedScopes = new Set(normalizeRoleScopes(value));

  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-medium">Role scope</p>
        <p className="text-xs text-muted-foreground">
          Choose one or more account-management scopes for this role.
        </p>
      </div>
      <div className="grid gap-2">
        {ROLE_SCOPE_KEYS.map((scope) => {
          const checked = selectedScopes.has(scope);
          const meta = ROLE_SCOPE_META[scope];

          return (
            <button
              key={scope}
              type="button"
              disabled={disabled}
              onClick={() => onChange(
                checked
                  ? Array.from(selectedScopes).filter((item) => item !== scope)
                  : [...Array.from(selectedScopes), scope],
              )}
              className={cn(
                'grid gap-1 rounded-xl border px-4 py-3 text-left transition-colors',
                checked
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background hover:bg-muted',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="text-sm font-medium">{meta.title}</span>
              <span className={cn('text-xs', checked ? 'text-background/80' : 'text-muted-foreground')}>
                {meta.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
