'use client';

import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import type { ApplicationAuthzDefinitionTuple } from '@/services/applications/authz-config';

type Props = {
  label: string;
  description: string;
  value: ApplicationAuthzDefinitionTuple[];
  onChange: (value: ApplicationAuthzDefinitionTuple[]) => void;
  disabled?: boolean;
  emptyLabel: string;
};

export function AuthzDefinitionEditor({
  label,
  description,
  value,
  onChange,
  disabled,
  emptyLabel,
}: Props) {
  const updateRow = (index: number, fieldIndex: 0 | 1 | 2, nextValue: string) => {
    const nextRows = value.map((row, rowIndex) =>
      rowIndex === index ? ([...row] as ApplicationAuthzDefinitionTuple) : row,
    );
    nextRows[index][fieldIndex] = nextValue;
    onChange(nextRows);
  };

  const addRow = () => {
    onChange([...value, ['', '', '']]);
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid gap-3">
          {value.map((row, index) => (
            <div key={`${label}-${index}`} className="grid gap-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={row[0]}
                  onChange={(event) => updateRow(index, 0, event.target.value)}
                  placeholder="Name"
                  disabled={disabled}
                />
                <Input
                  value={row[1]}
                  onChange={(event) => updateRow(index, 1, event.target.value)}
                  placeholder="Key"
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center gap-3">
                <Input
                  value={row[2]}
                  onChange={(event) => updateRow(index, 2, event.target.value)}
                  placeholder="Description"
                  disabled={disabled}
                />
                <Button htmlType="button" type="plain" size="sm" onClick={() => removeRow(index)} disabled={disabled}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <Button htmlType="button" type="outlined" onClick={addRow} disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Add Row
        </Button>
      </div>
    </div>
  );
}
