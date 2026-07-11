'use client';

import { cn } from '@/core/utils';
import type { ApplicationAuthzDefinitionOption } from '@/services/applications/authz-config';

type Props = {
  label: string;
  description: string;
  options: ApplicationAuthzDefinitionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  allowMultiple?: boolean;
  disabled?: boolean;
  emptyLabel: string;
};

export function AuthzDefinitionSelector({
  label,
  description,
  options,
  value,
  onChange,
  allowMultiple = true,
  disabled,
  emptyLabel,
}: Props) {
  if (options.length === 0) {
    return (
      <div className="grid gap-2 rounded-lg border border-dashed px-4 py-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  if (!allowMultiple) {
    return (
      <div className="grid gap-3 rounded-lg border p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              title={option.description || option.name || option.key}
              aria-pressed={value[0] === option.key}
              onClick={() => onChange(value[0] === option.key ? [] : [option.key])}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                value[0] === option.key
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:bg-muted',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              )}
            >
              {option.key}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = value.includes(option.key);

          return (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              title={option.description || option.name || option.key}
              aria-pressed={checked}
              onClick={() => {
                onChange(
                  checked
                    ? value.filter((selectedValue) => selectedValue !== option.key)
                    : [...value, option.key],
                );
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                checked
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:bg-muted',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              )}
            >
              {option.key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
