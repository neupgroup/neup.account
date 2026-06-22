'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from '@/components/icons';
import {
  deleteAppPermission,
  updateAppPermission,
  type AppPermission,
} from '@/services/applications/authz-manage';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { redirectInApp } from '@/core/helper/navigation';
import { toScopeTokens } from './permission-scope-badges';

const SCOPE_TOKEN_PATTERN = /^[A-Za-z0-9_.-]+$/;

function sanitizeScopeInput(value: string): string {
  return value.replace(/[^A-Za-z0-9_.\-,]/g, '');
}

type Props = {
  appId: string;
  permission: AppPermission;
  canManage: boolean;
  mode?: string;
};

export function PermissionDetailEditor({
  appId,
  permission,
  canManage,
  mode,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [description, setDescription] = useState(permission.description ?? '');
  const [scopeTokens, setScopeTokens] = useState<string[]>(() => toScopeTokens(permission.scope));
  const [scopeInput, setScopeInput] = useState('');
  const [rules, setRules] = useState(permission.rules ?? '');
  const [status, setStatus] = useState(permission.status ?? '');
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const goBack = () => {
    redirectInApp(router, applicationHref('/application/permissions', appId, { mode }));
  };

  const buildScopeTokens = (rawInput: string, currentTokens: string[]) => {
    const nextTokens = rawInput
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0 && SCOPE_TOKEN_PATTERN.test(token));
    if (nextTokens.length === 0) return currentTokens;

    const seen = new Set(currentTokens);
    const merged = [...currentTokens];
    for (const token of nextTokens) {
      if (seen.has(token)) continue;
      seen.add(token);
      merged.push(token);
    }
    return merged;
  };

  const commitScopeInput = () => {
    setScopeTokens((current) => buildScopeTokens(scopeInput, current));
    setScopeInput('');
  };

  const removeScopeToken = (tokenToRemove: string) => {
    setScopeTokens((current) => current.filter((token) => token !== tokenToRemove));
  };

  const handleSave = async () => {
    const finalScopeTokens = buildScopeTokens(scopeInput, scopeTokens);
    setScopeTokens(finalScopeTokens);
    setScopeInput('');
    setSavePending(true);
    const result = await updateAppPermission({
      appId,
      permissionId: permission.id,
      description: description || undefined,
      scope: finalScopeTokens.length > 0 ? JSON.stringify(finalScopeTokens) : undefined,
      rules: rules || undefined,
      status: status || undefined,
    });
    setSavePending(false);

    if (!result.success || !result.permission) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not update permission.' });
      return;
    }

    toast({ title: 'Permission updated' });
    router.refresh();
  };

  const handleDelete = async () => {
    setDeletePending(true);
    const result = await deleteAppPermission({ appId, permissionId: permission.id });
    setDeletePending(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Failed', description: result.error || 'Could not delete permission.' });
      return;
    }

    toast({ title: 'Permission removed' });
    goBack();
  };

  return (
    <>
      <div className="grid gap-4">
        <Input
          value={description}
          disabled={!canManage}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
        />
        <div className="flex min-h-12 w-full flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 lg:text-sm">
          {scopeTokens.map((token) => (
            <Badge key={token} variant="outline" className="flex items-center gap-1 px-3 py-1 text-xs">
              <span>{token}</span>
              <button
                type="button"
                onClick={() => removeScopeToken(token)}
                disabled={!canManage}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Remove ${token}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <input
            value={scopeInput}
            disabled={!canManage}
            onChange={(event) => setScopeInput(sanitizeScopeInput(event.target.value))}
            onBlur={commitScopeInput}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                commitScopeInput();
                return;
              }

              if (event.key === 'Backspace' && !scopeInput && scopeTokens.length > 0) {
                event.preventDefault();
                setScopeTokens((current) => current.slice(0, -1));
              }
            }}
            placeholder={scopeTokens.length === 0 ? 'Scope (optional)' : 'Add scope'}
            className="min-w-32 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
        </div>
        <Input
          value={rules}
          disabled={!canManage}
          onChange={(event) => setRules(event.target.value)}
          placeholder="Rules (optional)"
        />
        <Input
          value={status}
          disabled={!canManage}
          onChange={(event) => setStatus(event.target.value)}
          placeholder="Status (optional)"
        />

        {showDeleteSection ? (
          <div className="grid gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <div>
              <p className="text-sm font-medium text-destructive">Delete permission</p>
              <p className="text-xs text-muted-foreground">
                Remove this permission from the application. Any roles using it will lose it.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteSection(false)}
                disabled={deletePending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deletePending}
              >
                {deletePending ? 'Deleting...' : 'Delete Permission'}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={goBack}>
            Back
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDeleteSection(true)}
            disabled={!canManage || deletePending}
          >
            Delete
          </Button>
          <Button type="button" onClick={handleSave} disabled={savePending || !canManage}>
            {savePending ? 'Saving...' : 'Save Permission'}
          </Button>
        </div>
      </div>
    </>
  );
}
