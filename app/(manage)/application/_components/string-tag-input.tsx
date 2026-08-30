'use client';

import { useState } from 'react';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { X } from '@/components/icons';

type Props = {
  label: string;
  placeholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  hint?: string;
};

function normalizeTag(value: string): string {
  return value.trim();
}

export function StringTagInput({
  label,
  placeholder,
  value,
  onChange,
  disabled = false,
  hint,
}: Props) {
  const [draft, setDraft] = useState('');

  const addTag = (rawValue: string) => {
    const normalized = normalizeTag(rawValue);
    if (!normalized) return;
    if (value.includes(normalized)) return;
    onChange([...value, normalized]);
    setDraft('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((item) => item !== tag));
  };

  return (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1 text-xs">
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={disabled}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-background/70 disabled:pointer-events-none disabled:opacity-50"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No values added yet.</p>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addTag(draft);
            }
          }}
        />
        <Button type="button" variant="outline" disabled={disabled || !draft.trim()} onClick={() => addTag(draft)}>
          Add
        </Button>
      </div>
    </div>
  );
}
