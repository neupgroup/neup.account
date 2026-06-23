'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TokenField } from '@/components/ui/token-field';
import {
  deleteAppPermission,
  updateAppPermission,
  type AppPermission,
} from '@/services/applications/authz-manage';
import type { ApplicationAuthzDefinitionOption } from '@/services/applications/authz-config';
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
  definedScopeOptions?: ApplicationAuthzDefinitionOption[];
  allowMultipleDefinedScopes?: boolean;
};

export function PermissionDetailEditor({
  appId,
  permission,
  canManage,
  mode,
  definedScopeOptions = [],
  allowMultipleDefinedScopes = false,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [description, setDescription] = useState(permission.description ?? '');
  const [scopeTokens, setScopeTokens] = useState<string[]>(() => toScopeTokens(permission.scope));
  const [scopeInput, setScopeInput] = useState('');
  const [acquisitionType, setAcquisitionType] = useState(permission.acquisitionType ?? 'assignment');
  const [approvalPolicy, setApprovalPolicy] = useState(permission.approvalPolicy ?? 'none');
  const [rules, setRules] = useState(permission.rules ?? '');
  const [status, setStatus] = useState(permission.status ?? '');
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const allowedScopeKeys = useMemo(
    () => new Set(definedScopeOptions.map((option) => option.key)),
    [definedScopeOptions],
  );
  const goBack = () => {
    redirectInApp(router, applicationHref('/application/permissions', appId, { mode }));
  };

  const buildScopeTokens = (rawInput: string, currentTokens: string[]) => {
    const nextTokens = rawInput
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0 && SCOPE_TOKEN_PATTERN.test(token) && allowedScopeKeys.has(token));
    if (nextTokens.length === 0) return currentTokens;

    if (!allowMultipleDefinedScopes) {
      return currentTokens.length > 0 ? currentTokens : [nextTokens[0]];
    }

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

  const showDefinedScopeSuggestions = allowMultipleDefinedScopes || scopeTokens.length === 0;
  const filteredDefinedScopeOptions = useMemo(() => {
    if (!showDefinedScopeSuggestions) return [];

    const query = scopeInput.trim().toLowerCase();

    return definedScopeOptions.filter((option) => {
      if (scopeTokens.includes(option.key)) return false;
      if (!query) return true;

      return [option.key, option.name, option.description]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [definedScopeOptions, scopeInput, scopeTokens, showDefinedScopeSuggestions]);

  const addDefinedScopeToken = (token: string) => {
    setScopeTokens((current) => {
      if (current.includes(token)) return current;
      if (!allowMultipleDefinedScopes) return [token];
      return [...current, token];
    });
    setScopeInput('');
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
      acquisitionType,
      approvalPolicy,
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
        <Textarea
          value={description}
          disabled={!canManage}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
        />
        <div className="grid gap-2">
          <TokenField
            label="Scope (optional)"
            values={scopeTokens}
            inputValue={scopeInput}
            disabled={!canManage}
            onInputValueChange={(value) => setScopeInput(sanitizeScopeInput(value))}
            onCommitInput={commitScopeInput}
            onRemoveValue={removeScopeToken}
          />
          {filteredDefinedScopeOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {filteredDefinedScopeOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={!canManage}
                  title={option.description || option.name || option.key}
                  onClick={() => addDefinedScopeToken(option.key)}
                  className="inline-flex h-7 items-center rounded-full border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {option.key}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={acquisitionType} onValueChange={setAcquisitionType} disabled={!canManage}>
            <SelectTrigger>
              <SelectValue placeholder="Acquisition type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="assignment">assignment</SelectItem>
              <SelectItem value="public_request">public_request</SelectItem>
              <SelectItem value="invitation">invitation</SelectItem>
              <SelectItem value="system_generated">system_generated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={approvalPolicy} onValueChange={setApprovalPolicy} disabled={!canManage}>
            <SelectTrigger>
              <SelectValue placeholder="Approval policy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">none</SelectItem>
              <SelectItem value="approval_required">approval_required</SelectItem>
            </SelectContent>
          </Select>
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
