'use client';

import { Badge } from '@/components/ui/badge';

type Props = {
  scope: string | null | undefined;
  className?: string;
};

export function toScopeTokens(scope: string | null | undefined): string[] {
  const trimmed = scope?.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
        .filter(Boolean);
    }

    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, unknown>).map(([key, value]) =>
        value === null ? key : `${key}:${typeof value === 'string' ? value : JSON.stringify(value)}`,
      );
    }

    if (parsed === null) return ['null'];
    return [String(parsed)];
  } catch {
    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
}

export function PermissionScopeBadges({ scope, className }: Props) {
  const tokens = toScopeTokens(scope);
  if (tokens.length === 0) return null;

  return (
    <div className={className ?? 'flex flex-wrap gap-1'}>
      {tokens.map((token, index) => (
        <Badge key={`${token}-${index}`} variant="outline" className="text-xs">
          {token}
        </Badge>
      ))}
    </div>
  );
}
