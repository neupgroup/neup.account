'use client';

import { useState } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  saveApplicationAccess,
  saveApplicationEndpoints,
  saveApplicationPolicies,
  saveApplicationSecret,
} from '@/services/applications/manage';
import { saveAuthzWebhookUrl } from '@/services/applications/authz-webhook';
import {
  applicationAccessFields,
  type ApplicationAccessField,
  type ApplicationEndpointConfig,
  type ApplicationPolicyEntry,
  type ManagedApplication,
} from '@/services/applications/types';

function generateSecretKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toggleValue(values: ApplicationAccessField[], value: ApplicationAccessField): ApplicationAccessField[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

const accessLabels: Record<ApplicationAccessField, string> = {
  connectionId: 'Connection ID',
  accountId: 'Account ID',
  displayName: 'Display name',
  displayImage: 'Display image',
  accountType: 'Account type',
  role: 'Role',
  lastActive: 'Last active',
  neupid: 'NeupID',
  firstName: 'First name',
  lastName: 'Last name',
  middleName: 'Middle name',
  dateBirth: 'Date of birth',
  age: 'Age',
  isMinor: 'Is minor',
  gender: 'Gender',
};

function toTextareaValue(value?: string) {
  return value ?? '';
}

/**
 * ::neup.documentation::application-management-panel-component
 * ::title Application Management Panel
 *
 * Client-side management panel for application secrets, access subscriptions, policies, endpoints, and authz webhook settings.
 *
 * ::public
 *
 * The panel lets managers generate a secret key, choose subscribed account fields, edit policy text, configure public/API endpoints, and maintain the authz webhook URL.
 *
 * ::public end
 *
 * ::private
 *
 * Each section persists independently through dedicated server actions and uses local pending state to avoid cross-section save collisions.
 *
 * ::private end
 *
 * ::end
 */
export function ApplicationManagementPanel({ application }: { application: ManagedApplication }) {
  const { toast } = useToast();
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [access, setAccess] = useState<ApplicationAccessField[]>(application.access);
  const [policies, setPolicies] = useState<ApplicationPolicyEntry[]>(
    application.policies.length > 0
      ? application.policies
      : [
          { name: 'privacy-policy', policy: '' },
          { name: 'cookies-policy', policy: '' },
          { name: 'terms-of-service', policy: '' },
        ]
  );
  const [endpoints, setEndpoints] = useState<ApplicationEndpointConfig>({
    dataDeletionApi: application.endpoints.dataDeletionApi,
    dataDeletionPage: application.endpoints.dataDeletionPage,
    accountBlock: application.endpoints.accountBlock,
    accountBlockApi: application.endpoints.accountBlockApi,
    logoutPage: application.endpoints.logoutPage,
    logoutApi: application.endpoints.logoutApi,
  });
  const [authzWebhookUrl, setAuthzWebhookUrl] = useState(application.authzWebhookUrl ?? '');

  const handleGenerateSecret = async () => {
    const secretKey = generateSecretKey();
    setPendingSection('secret');
    const result = await saveApplicationSecret({ appId: application.id, secretKey });
    setPendingSection(null);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Secret not saved', description: result.error || 'Could not save the secret key.' });
      return;
    }

    setRevealedSecret(secretKey);
    toast({ title: 'Secret key saved', description: 'Copy it now. It will not be shown again after refresh.' });
  };

  const handleCopySecret = async () => {
    if (!revealedSecret) return;
    await navigator.clipboard.writeText(revealedSecret);
    toast({ title: 'Copied', description: 'Secret key copied to clipboard.' });
  };

  const handleSaveAccess = async () => {
    setPendingSection('access');
    const result = await saveApplicationAccess({ appId: application.id, access });
    setPendingSection(null);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Access not saved', description: result.error || 'Could not save access settings.' });
      return;
    }

    toast({ title: 'Access saved', description: 'Subscribed account data was updated.' });
  };

  const handleSavePolicies = async () => {
    setPendingSection('policies');
    const result = await saveApplicationPolicies({
      appId: application.id,
      policies: policies
        .map((entry) => ({ name: entry.name.trim(), policy: entry.policy.trim() }))
        .filter((entry) => entry.name.length > 0 && entry.policy.length > 0),
    });
    setPendingSection(null);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Policies not saved', description: result.error || 'Could not save policies.' });
      return;
    }

    toast({ title: 'Policies saved', description: 'Policy entries were updated.' });
  };

  const handleSaveEndpoints = async () => {
    setPendingSection('endpoints');
    const result = await saveApplicationEndpoints({ appId: application.id, ...endpoints });
    setPendingSection(null);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Endpoints not saved', description: result.error || 'Could not save endpoint information.' });
      return;
    }

    toast({ title: 'Endpoints saved', description: 'Public links and API endpoints were updated.' });
  };

  const handleSaveAuthzWebhook = async () => {
    setPendingSection('authzWebhook');
    const result = await saveAuthzWebhookUrl({ appId: application.id, url: authzWebhookUrl });
    setPendingSection(null);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Webhook not saved', description: result.error || 'Could not save webhook URL.' });
      return;
    }

    toast({ title: 'Webhook saved', description: authzWebhookUrl ? 'Role and permission changes will be pushed to this URL.' : 'Webhook removed.' });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
          <CardDescription>Created application record and management console.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Name:</span>
            <span className="font-medium">{application.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">App ID:</span>
            <code className="rounded bg-muted px-2 py-1 text-xs">{application.id}</code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Secret key:</span>
            <Badge variant={application.hasSecretKey ? 'secondary' : 'outline'}>
              {application.hasSecretKey ? 'Configured' : 'Not generated'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Secret Key</CardTitle>
          <CardDescription>
            Generate a device-side random secret. It is saved once and only shown after generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {revealedSecret ? (
            <Alert>
              <AlertTitle>Secret key generated</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>This is the only time the full key is shown.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 text-xs break-all">{revealedSecret}</code>
                  <Button type="button" variant="outline" size="sm" onClick={handleCopySecret}>
                    Copy
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <Button type="button" onClick={handleGenerateSecret} disabled={pendingSection === 'secret'}>
            {pendingSection === 'secret' ? 'Saving...' : application.hasSecretKey ? 'Generate New Secret Key' : 'Generate Secret Key'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Access</CardTitle>
          <CardDescription>Select the account data this application can subscribe to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {applicationAccessFields.map((field) => (
              <label key={field} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={access.includes(field)}
                  onChange={() => setAccess((current) => toggleValue(current, field))}
                />
                <span>{accessLabels[field]}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveAccess} disabled={pendingSection === 'access'}>
              {pendingSection === 'access' ? 'Saving...' : 'Save Access'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policies</CardTitle>
          <CardDescription>Add privacy, cookies, terms, or any other policy you need.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {policies.map((entry, index) => (
              <div key={`${entry.name}-${index}`} className="rounded-md border p-4 space-y-3">
                <Input
                  value={entry.name}
                  onChange={(event) => {
                    const next = [...policies];
                    next[index] = { ...next[index], name: event.target.value };
                    setPolicies(next);
                  }}
                  placeholder="Policy name"
                />
                <Textarea
                  value={entry.policy}
                  onChange={(event) => {
                    const next = [...policies];
                    next[index] = { ...next[index], policy: event.target.value };
                    setPolicies(next);
                  }}
                  placeholder="Paste the rich text or policy content"
                  rows={6}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPolicies((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setPolicies((current) => [...current, { name: '', policy: '' }])}>
              Add Policy
            </Button>
            <Button type="button" onClick={handleSavePolicies} disabled={pendingSection === 'policies'}>
              {pendingSection === 'policies' ? 'Saving...' : 'Save Policies'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endpoints and Actions</CardTitle>
          <CardDescription>Add the URLs and actions users should see for deletion, blocking, and logout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data deletion API</label>
              <Input
                value={toTextareaValue(endpoints.dataDeletionApi)}
                onChange={(event) => setEndpoints((current) => ({ ...current, dataDeletionApi: event.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Data deletion page</label>
              <Input
                value={toTextareaValue(endpoints.dataDeletionPage)}
                onChange={(event) => setEndpoints((current) => ({ ...current, dataDeletionPage: event.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Account block rules</label>
              <Textarea
                value={toTextareaValue(endpoints.accountBlock)}
                onChange={(event) => setEndpoints((current) => ({ ...current, accountBlock: event.target.value }))}
                placeholder="Describe how the account should be restricted or blocked."
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account block API</label>
              <Input
                value={toTextareaValue(endpoints.accountBlockApi)}
                onChange={(event) => setEndpoints((current) => ({ ...current, accountBlockApi: event.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Logout page</label>
              <Input
                value={toTextareaValue(endpoints.logoutPage)}
                onChange={(event) => setEndpoints((current) => ({ ...current, logoutPage: event.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Logout API</label>
              <Input
                value={toTextareaValue(endpoints.logoutApi)}
                onChange={(event) => setEndpoints((current) => ({ ...current, logoutApi: event.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveEndpoints} disabled={pendingSection === 'endpoints'}>
              {pendingSection === 'endpoints' ? 'Saving...' : 'Save Endpoints'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook — Roles &amp; Permissions</CardTitle>
          <CardDescription>
            When roles, permissions, or access grants change for this application, the change is
            pushed to this URL via POST. Leave blank to disable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Webhook URL</label>
            <Input
              value={authzWebhookUrl}
              onChange={(event) => setAuthzWebhookUrl(event.target.value)}
              placeholder="https://..."
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Must be HTTPS. Requests are signed with <code className="rounded bg-muted px-1 py-0.5">x-bridge-secret</code>.
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveAuthzWebhook} disabled={pendingSection === 'authzWebhook'}>
              {pendingSection === 'authzWebhook' ? 'Saving...' : 'Save Webhook'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
