'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
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
        <RadioGroup value={value[0] ?? ''} onValueChange={(nextValue) => onChange(nextValue ? [nextValue] : [])}>
          {options.map((option) => (
            <div key={option.key} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem id={`${label}-${option.key}`} value={option.key} disabled={disabled} className="mt-0.5" />
              <Label htmlFor={`${label}-${option.key}`} className="grid gap-1">
                <span className="font-medium">{option.name}</span>
                <span className="text-xs text-muted-foreground">{option.key}</span>
                {option.description ? <span className="text-xs text-muted-foreground">{option.description}</span> : null}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3">
        {options.map((option) => {
          const checked = value.includes(option.key);

          return (
            <label key={option.key} className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(nextChecked) => {
                  onChange(
                    nextChecked
                      ? [...value, option.key]
                      : value.filter((selectedValue) => selectedValue !== option.key),
                  );
                }}
                className="mt-0.5"
              />
              <span className="grid gap-1">
                <span className="font-medium">{option.name}</span>
                <span className="text-xs text-muted-foreground">{option.key}</span>
                {option.description ? <span className="text-xs text-muted-foreground">{option.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
