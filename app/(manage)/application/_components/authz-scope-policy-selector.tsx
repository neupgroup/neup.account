'use client';

/*
::neup.documentation::application-authz-scope-policy-selector
::title Application Authz Scope Policy Selectors

Reusable UI controls for editing `scope_for` and `scope_level` on application roles and permissions.

::public

These selectors present the allowed scope-policy values from `services/applications/authz-scope-policy.ts` as chip-style toggle groups.

::public end

::end
*/

import { cn } from '@/neup.core/helpers/utils';
import {
  AUTHZ_SCOPE_FOR_META,
  AUTHZ_SCOPE_FOR_VALUES,
  AUTHZ_SCOPE_LEVEL_META,
  AUTHZ_SCOPE_LEVEL_VALUES,
  type AuthzScopeFor,
  type AuthzScopeLevel,
} from '@/services/applications/authz-scope-policy';

function PolicyGroup<T extends string>({
  title,
  description,
  values,
  selected,
  allowMultiple,
  disabled,
  onChange,
  meta,
}: {
  title: string;
  description: string;
  values: readonly T[];
  selected: T[];
  allowMultiple: boolean;
  disabled?: boolean;
  onChange: (value: T[]) => void;
  meta: Record<T, { label: string; description: string }>;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const checked = selected.includes(value);

          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              title={meta[value].description}
              aria-pressed={checked}
              onClick={() => {
                if (allowMultiple) {
                  onChange(
                    checked
                      ? selected.filter((item) => item !== value)
                      : [...selected, value],
                  );
                  return;
                }

                onChange(checked ? [] : [value]);
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                checked
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:bg-muted',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              )}
            >
              {meta[value].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ScopeForSelector({
  value,
  onChange,
  allowMultiple = true,
  disabled,
  title = 'scope_for',
  description = 'Choose the account types this entry applies to.',
}: {
  value: AuthzScopeFor[];
  onChange: (value: AuthzScopeFor[]) => void;
  allowMultiple?: boolean;
  disabled?: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <PolicyGroup
      title={title}
      description={description}
      values={AUTHZ_SCOPE_FOR_VALUES}
      selected={value}
      allowMultiple={allowMultiple}
      disabled={disabled}
      onChange={onChange}
      meta={AUTHZ_SCOPE_FOR_META}
    />
  );
}

export function ScopeLevelSelector({
  value,
  onChange,
  allowMultiple = true,
  disabled,
  title = 'scope_level',
  description = 'Choose how the role or permission can be acquired.',
}: {
  value: AuthzScopeLevel[];
  onChange: (value: AuthzScopeLevel[]) => void;
  allowMultiple?: boolean;
  disabled?: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <PolicyGroup
      title={title}
      description={description}
      values={AUTHZ_SCOPE_LEVEL_VALUES}
      selected={value}
      allowMultiple={allowMultiple}
      disabled={disabled}
      onChange={onChange}
      meta={AUTHZ_SCOPE_LEVEL_META}
    />
  );
}
