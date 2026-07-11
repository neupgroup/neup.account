'use client';

import { useState, type ReactNode } from 'react';
import { X } from '@/components/icons';
import { cn } from '@/core/utils';

const fieldOutlineClassName =
  'rounded-xl border border-input bg-background transition-colors hover:border-foreground/30';

type TokenFieldProps = {
  label: string;
  values: string[];
  inputValue: string;
  onInputValueChange: (value: string) => void;
  onCommitInput: () => void;
  onRemoveValue: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  inputAriaLabel?: string;
  renderValue?: (value: string) => ReactNode;
  className?: string;
};

export function TokenField({
  label,
  values,
  inputValue,
  onInputValueChange,
  onCommitInput,
  onRemoveValue,
  disabled = false,
  emptyLabel,
  inputAriaLabel,
  renderValue,
  className,
}: TokenFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const shouldFloatLabel = isFocused || values.length > 0 || inputValue.length > 0;

  return (
    <div
      className={cn(
        'relative w-full px-4 pb-2 pt-3 text-base ring-offset-background transition-all',
        fieldOutlineClassName,
        isFocused
          ? 'border-ring ring-1 ring-ring/20 ring-offset-0'
          : '',
        disabled && 'cursor-not-allowed opacity-70',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute left-4 bg-background px-1 text-muted-foreground transition-all duration-200 ease-out',
          shouldFloatLabel
            ? 'top-0 -translate-y-1/2 text-xs font-medium text-ring'
            : 'top-1/2 -translate-y-1/2 text-base'
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-2',
          shouldFloatLabel ? 'pt-1' : 'pt-4'
        )}
      >
        {values.length > 0 ? (
          values.map((value) => (
            <div
              key={value}
              className="group inline-flex h-7 cursor-default items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-primary/15"
            >
              <span>{renderValue ? renderValue(value) : value}</span>
              <button
                type="button"
                onClick={() => onRemoveValue(value)}
                disabled={disabled}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:text-foreground hover:bg-background/70 disabled:pointer-events-none disabled:opacity-50"
                aria-label={`Remove ${value}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        ) : emptyLabel && !isFocused && !inputValue ? (
          <span className="text-sm text-muted-foreground">{emptyLabel}</span>
        ) : null}

        <input
          value={inputValue}
          disabled={disabled}
          onChange={(event) => onInputValueChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            onCommitInput();
            setIsFocused(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              onCommitInput();
              return;
            }

            if (event.key === 'Backspace' && !inputValue && values.length > 0) {
              event.preventDefault();
              onRemoveValue(values[values.length - 1]);
            }
          }}
          className="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-sm leading-6 outline-none disabled:cursor-not-allowed"
          aria-label={inputAriaLabel ?? label}
        />
      </div>
    </div>
  );
}
