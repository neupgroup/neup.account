'use client';

import { useTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/neup.core/hooks/use-toast';
import { saveAppConfig, addSilentSsoOrigin, removeSilentSsoOrigin, addServerIp, removeServerIp, saveAccountUpdateWebhookUrl, saveRoleUpdateWebhookUrl } from '@/services/applications/manage';
import {
  applicationResponseFields,
  applicationPartyMeta,
  applicationPartyValues,
  type ApplicationParty,
  type ApplicationAccessField,
  type ApplicationResponseField,
} from '@/services/applications/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Eye, EyeOff, Plus, Trash2, KeyRound, Database, Globe } from 'lucide-react';
import { AuthzDefinitionEditor } from './authz-definition-editor';
import type { ApplicationAuthzDefinitionTuple } from '@/services/applications/authz-config';

// ---------------------------------------------------------------------------
// Field labels
// ---------------------------------------------------------------------------

const fieldLabels: Record<ApplicationAccessField, { label: string; description: string }> = {
  connectionId:  { label: 'Connection ID',   description: 'Unique ID for this app–account connection.' },
  accountId:     { label: 'Account ID',      description: 'The user\'s internal account identifier.' },
  displayName:   { label: 'Display Name',    description: 'The user\'s public display name.' },
  displayImage:  { label: 'Display Image',   description: 'URL of the user\'s profile picture.' },
  accountType:   { label: 'Account Type',    description: 'Whether the account is individual or brand.' },
  role:          { label: 'Role',            description: 'Role assigned to this account for this application.' },
  lastActive:    { label: 'Last Active',     description: 'Timestamp of the user\'s last activity.' },
  neupid:        { label: 'NeupID',          description: 'The user\'s primary NeupID handle.' },
  firstName:     { label: 'First Name',      description: 'User\'s first name (individuals only).' },
  lastName:      { label: 'Last Name',       description: 'User\'s last name (individuals only).' },
  middleName:    { label: 'Middle Name',     description: 'User\'s middle name (individuals only).' },
  dateBirth:     { label: 'Date of Birth',   description: 'User\'s date of birth (individuals only).' },
  age:           { label: 'Age',             description: 'Computed age from date of birth.' },
  isMinor:       { label: 'Is Minor',        description: 'Whether the user is under 18.' },
  gender:        { label: 'Gender',          description: 'User\'s gender (if provided).' },
};
const fixedJwtFields = [
  { id: 'connectionId', label: 'Connection ID', description: 'Always included in token.', checked: true },
  { id: 'issuedAt', label: 'Issued At', description: 'Always included in token as iat.', checked: true },
  { id: 'expiresAt', label: 'Expired At', description: 'Always included in token as exp.', checked: true },
] as const;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  secretKey: z
    .string()
    .trim()
    .refine((val) => val === '' || val.length >= 16, {
      message: 'Secret must be at least 16 characters.',
    })
    .optional()
    .or(z.literal('')),
  access: z.array(z.enum(applicationResponseFields)).default([]),
  party: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(1),
  allowDevMode: z.boolean().default(false),
  allowDevIpMode: z.boolean().default(false),
  definedScopes: z.array(z.tuple([z.string(), z.string(), z.string()])).default([]),
  allowMultipleDefinedScopes: z.boolean().default(false),
  applicableForDefinitions: z.array(z.tuple([z.string(), z.string(), z.string()])).default([]),
});

type FormValues = z.infer<typeof schema>;

const responseFieldSet = new Set<ApplicationAccessField>(applicationResponseFields);
const isResponseField = (field: ApplicationAccessField): field is ApplicationResponseField => responseFieldSet.has(field);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  appId: string;
  canUpdate: boolean;
  hasSecretKey: boolean;
  initialAccess: ApplicationAccessField[];
  initialTokenFields: ApplicationAccessField[];
  initialParty: ApplicationParty;
  initialOrigins: Array<{ id: string; value: string }>;
  initialServerIps: Array<{ id: string; value: string }>;
  initialAccountUpdateWebhookUrl: string | null;
  initialRoleUpdateWebhookUrl: string | null;
  initialAllowDevMode: boolean;
  initialAllowDevIpMode: boolean;
  initialDefinedScopes: ApplicationAuthzDefinitionTuple[];
  initialAllowMultipleDefinedScopes: boolean;
  initialApplicableForDefinitions: ApplicationAuthzDefinitionTuple[];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppConfigForm({
  appId,
  canUpdate,
  hasSecretKey,
  initialAccess,
  initialTokenFields,
  initialParty,
  initialOrigins,
  initialServerIps,
  initialAccountUpdateWebhookUrl,
  initialRoleUpdateWebhookUrl,
  initialAllowDevMode,
  initialAllowDevIpMode,
  initialDefinedScopes,
  initialAllowMultipleDefinedScopes,
  initialApplicableForDefinitions,
}: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isOriginPending, startOriginTransition] = useTransition();
  const [showSecret, setShowSecret] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [newServerIp, setNewServerIp] = useState('');
  const [accountUpdateWebhookUrl, setAccountUpdateWebhookUrl] = useState(initialAccountUpdateWebhookUrl ?? '');
  const [roleUpdateWebhookUrl, setRoleUpdateWebhookUrl] = useState(initialRoleUpdateWebhookUrl ?? '');
  const [showExampleResponse, setShowExampleResponse] = useState(false);
  const [origins, setOrigins] = useState(initialOrigins);
  const [serverIps, setServerIps] = useState(initialServerIps);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretKey: '',
      access: initialAccess.filter(isResponseField),
      party: initialParty,
      allowDevMode: initialAllowDevMode,
      allowDevIpMode: initialAllowDevIpMode,
      definedScopes: initialDefinedScopes,
      allowMultipleDefinedScopes: initialAllowMultipleDefinedScopes,
      applicableForDefinitions: initialApplicableForDefinitions,
    },
  });

  const selectedParty = form.watch('party');
  const selectedResponseFields = form.watch('access');
  const visibleResponseFields = (applicationResponseFields as readonly ApplicationResponseField[]).filter((field) => {
    if (field === 'accountId') return selectedParty === 0 || selectedParty === 1;
    if (field === 'neupid') return selectedParty !== 3;
    return true;
  });
  const exampleValueByField: Record<ApplicationAccessField, string | number | boolean> = {
    connectionId: 'conn_01HXYZABC',
    accountId: 'acc_01HXYZABC',
    displayName: 'Jane Smith',
    displayImage: 'https://cdn.example.com/avatar.jpg',
    accountType: 'individual',
    role: 'member',
    lastActive: '2026-05-30T10:12:00.000Z',
    neupid: 'janesmith',
    firstName: 'Jane',
    lastName: 'Smith',
    middleName: 'K',
    dateBirth: '1998-04-18',
    age: 28,
    isMinor: false,
    gender: 'female',
  };
  const selectedFieldSet = new Set(selectedResponseFields);
  const exampleAccount: Record<string, string | boolean> = {
    connectionId: String(exampleValueByField.connectionId),
  };
  if (selectedFieldSet.has('accountId')) exampleAccount.id = String(exampleValueByField.accountId);
  if (selectedFieldSet.has('isMinor')) exampleAccount.isMinor = Boolean(exampleValueByField.isMinor);
  if (selectedFieldSet.has('neupid')) exampleAccount.neupid = String(exampleValueByField.neupid);

  const exampleProfile: Record<string, string> = {};
  if (selectedFieldSet.has('displayName')) exampleProfile.displayName = String(exampleValueByField.displayName);
  if (selectedFieldSet.has('displayImage')) exampleProfile.displayImage = String(exampleValueByField.displayImage);
  if (selectedFieldSet.has('gender')) exampleProfile.gender = String(exampleValueByField.gender);
  if (selectedFieldSet.has('dateBirth')) exampleProfile.birthDate = String(exampleValueByField.dateBirth);
  if (selectedFieldSet.has('lastActive')) exampleProfile.lastActive = String(exampleValueByField.lastActive);

  const exampleRole = selectedFieldSet.has('role')
    ? { id: 'application.member', name: 'Application Member' }
    : null;

  const exampleResponse: Record<string, unknown> = {
    success: true,
    appId,
    occurredAt: '2026-05-30T10:12:00.000Z',
    account: exampleAccount,
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  };

  if (Object.keys(exampleProfile).length > 0) {
    exampleResponse.profile = exampleProfile;
  }
  if (exampleRole) {
    exampleResponse.role = exampleRole;
  }

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await saveAppConfig({
        appId,
        secretKey: values.secretKey || undefined,
        access: values.access,
        party: values.party,
        allowDevMode: values.allowDevMode,
        allowDevIpMode: values.allowDevIpMode,
        definedScopes: values.definedScopes,
        allowMultipleDefinedScopes: values.allowMultipleDefinedScopes,
        applicableForDefinitions: values.applicableForDefinitions,
      });
      if (result.success) {
        toast({ title: 'Saved', description: 'Configuration updated.' });
        form.setValue('secretKey', '');
      } else if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof FormValues, { message });
        }
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  const handleAddOrigin = () => {
    const origin = newOrigin.trim();
    if (!origin) return;
    startOriginTransition(async () => {
      const result = await addSilentSsoOrigin({ appId, origin });
      if (result.success) {
        // Optimistically add — page will revalidate on next load
        try {
          const parsed = new URL(origin);
          setOrigins((prev) => [...prev, { id: crypto.randomUUID(), value: parsed.origin }]);
        } catch {
          setOrigins((prev) => [...prev, { id: crypto.randomUUID(), value: origin }]);
        }
        setNewOrigin('');
        toast({ title: 'Origin added' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  const handleRemoveOrigin = (bridgeId: string) => {
    startOriginTransition(async () => {
      const result = await removeSilentSsoOrigin({ appId, bridgeId });
      if (result.success) {
        setOrigins((prev) => prev.filter((o) => o.id !== bridgeId));
        toast({ title: 'Origin removed' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  const handleAddServerIp = () => {
    const ip = newServerIp.trim();
    if (!ip) return;
    startOriginTransition(async () => {
      const result = await addServerIp({ appId, ip });
      if (result.success) {
        setServerIps((prev) => [...prev, { id: crypto.randomUUID(), value: ip.toLowerCase() }]);
        setNewServerIp('');
        toast({ title: 'Server IP added' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  const handleRemoveServerIp = (bridgeId: string) => {
    startOriginTransition(async () => {
      const result = await removeServerIp({ appId, bridgeId });
      if (result.success) {
        setServerIps((prev) => prev.filter((entry) => entry.id !== bridgeId));
        toast({ title: 'Server IP removed' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  const handleSaveAccountUpdateWebhook = () => {
    startTransition(async () => {
      const result = await saveAccountUpdateWebhookUrl({
        appId,
        url: accountUpdateWebhookUrl,
      });

      if (result.success) {
        toast({ title: 'Saved', description: 'Account update webhook URL saved.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  const handleSaveRoleUpdateWebhook = () => {
    startTransition(async () => {
      const result = await saveRoleUpdateWebhookUrl({
        appId,
        url: roleUpdateWebhookUrl,
      });

      if (result.success) {
        toast({ title: 'Saved', description: 'Role update webhook URL saved.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  return (
    <div className={`grid gap-6 ${!canUpdate ? 'pointer-events-none opacity-70' : ''}`}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">

          {/* Secret Key */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <CardTitle>API Secret</CardTitle>
              </div>
              <CardDescription>
                This secret must be passed in every API request. The server only responds when the secret matches.
                {hasSecretKey && (
                  <span className="ml-1 text-green-600 dark:text-green-400 font-medium">A secret is currently set.</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="secretKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{hasSecretKey ? 'Replace secret' : 'Set secret'}</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showSecret ? 'text' : 'password'}
                          placeholder="Minimum 16 characters"
                          className="pr-10"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Party */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Application Party</CardTitle>
              </div>
              <CardDescription>
                Set the party level for this application.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="party"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Application Party</FormLabel>
                    <FormControl>
                      <Select
                        value={String(field.value)}
                        onValueChange={(value) => {
                          const nextParty = Number(value) as ApplicationParty;
                          field.onChange(nextParty);
                          const nextAccess = (form.getValues('access') ?? []).filter((entry) => {
                            if (entry === 'accountId') return nextParty === 0 || nextParty === 1;
                            if (entry === 'neupid') return nextParty !== 3;
                            return true;
                          });
                          form.setValue('access', nextAccess, { shouldDirty: true });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select party level" />
                        </SelectTrigger>
                        <SelectContent>
                          {applicationPartyValues.map((partyValue) => (
                            <SelectItem key={partyValue} value={String(partyValue)}>
                              {applicationPartyMeta[partyValue].label} ({partyValue})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{applicationPartyMeta[selectedParty].description}</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Configuration
              </Button>
            </CardFooter>
          </Card>

          {/* Field Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Field Settings</CardTitle>
              </div>
              <CardDescription>
                Tick the fields you need. Unchecked or unavailable fields are removed automatically from the response.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="grid gap-3 sm:grid-cols-2">
                {fixedJwtFields.map((field) => (
                  <div key={field.id} className="flex items-start gap-3 rounded-lg border p-3 opacity-90">
                    <Checkbox checked={field.checked} disabled aria-label={`${field.label} always included`} />
                    <div className="space-y-0.5 leading-none">
                      <p className="text-sm font-medium">{field.label}</p>
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    </div>
                  </div>
                ))}
                {visibleResponseFields.map((field) => {
                  const meta = fieldLabels[field];
                  return (
                    <FormField
                      key={field}
                      control={form.control}
                      name="access"
                      render={({ field: formField }) => (
                        <FormItem className="flex items-start gap-3 rounded-lg border p-3">
                          <FormControl>
                            <Checkbox
                              checked={formField.value?.includes(field)}
                              onCheckedChange={(checked) => {
                                const current = formField.value ?? [];
                                formField.onChange(
                                  checked ? [...current, field] : current.filter((v) => v !== field),
                                );
                              }}
                            />
                          </FormControl>
                          <div className="space-y-0.5 leading-none">
                            <FormLabel className="font-medium cursor-pointer">{meta.label}</FormLabel>
                            <p className="text-xs text-muted-foreground">{meta.description}</p>
                          </div>
                        </FormItem>
                      )}
                    />
                  );
                })}
              </div>
              <div className="rounded-lg border p-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowExampleResponse((v) => !v)}
                >
                  Get an example response
                </Button>
                {showExampleResponse ? (
                  <pre className="mt-3 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
{JSON.stringify(exampleResponse, null, 2)}
                  </pre>
                ) : null}
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Configuration
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Authorization Definitions</CardTitle>
              </div>
              <CardDescription>
                Define reusable scope and applicable-for options for permission and role setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <AuthzDefinitionEditor
                label="Defined scopes"
                description='Saved as JSON rows in the format `["name", "key", "description"]`.'
                value={form.watch('definedScopes')}
                onChange={(value) => form.setValue('definedScopes', value, { shouldDirty: true })}
                disabled={!canUpdate}
                emptyLabel="No scope definitions configured yet."
              />
              <FormField
                control={form.control}
                name="allowMultipleDefinedScopes"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 rounded-lg border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        disabled={!canUpdate}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Allow multiple defined scopes per permission</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        If disabled, permission creation can select only one of the configured defined scopes.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              <AuthzDefinitionEditor
                label="Applicable for"
                description='Saved as JSON rows in the format `["name", "key", "description"]`.'
                value={form.watch('applicableForDefinitions')}
                onChange={(value) => form.setValue('applicableForDefinitions', value, { shouldDirty: true })}
                disabled={!canUpdate}
                emptyLabel="No applicable-for definitions configured yet."
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Configuration
              </Button>
            </CardFooter>
          </Card>

          {/* Server IPs */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Server IPs</CardTitle>
              </div>
              <CardDescription>
                Allowed server IP addresses for requests that do not include an Origin header.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {serverIps.length > 0 ? (
                <ul className="space-y-2">
                  {serverIps.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
                      <code className="text-sm break-all">{entry.value}</code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isOriginPending}
                        onClick={() => handleRemoveServerIp(entry.id)}
                        aria-label={`Remove ${entry.value}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No server IPs registered yet.</p>
              )}

              <div className="flex flex-wrap items-end gap-3 pt-2">
                <div className="flex-1 min-w-[240px] space-y-1.5">
                  <label htmlFor="new-server-ip" className="text-sm font-medium">
                    Add server IP
                  </label>
                  <Input
                    id="new-server-ip"
                    placeholder="203.0.113.10"
                    value={newServerIp}
                    onChange={(e) => setNewServerIp(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddServerIp();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isOriginPending || !newServerIp.trim()}
                  onClick={handleAddServerIp}
                >
                  {isOriginPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>

              <FormField
                control={form.control}
                name="allowDevIpMode"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 rounded-lg border p-3">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                    </FormControl>
                    <div className="space-y-0.5 leading-none">
                      <FormLabel className="font-medium cursor-pointer">Allow dev IP mode</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        If enabled, server IP validation is skipped when Origin is missing.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Configuration
              </Button>
            </CardFooter>
          </Card>

          {/* Account Update Webhook */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Account Update Webhook</CardTitle>
              </div>
              <CardDescription>
                Optional endpoint to receive encrypted <code className="text-xs">account.updated</code> events.
                Leave empty to disable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="account-update-webhook" className="text-sm font-medium">
                  Webhook URL
                </label>
                <Input
                  id="account-update-webhook"
                  type="url"
                  placeholder="https://example.com/webhooks/account-updated"
                  value={accountUpdateWebhookUrl}
                  onChange={(e) => setAccountUpdateWebhookUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must be HTTPS. If unset, no account update events are sent to this application.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={handleSaveAccountUpdateWebhook} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Webhook
              </Button>
            </CardFooter>
          </Card>

          {/* Role Update Webhook */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Role Update Webhook</CardTitle>
              </div>
              <CardDescription>
                Optional endpoint to receive encrypted <code className="text-xs">role.created</code>, <code className="text-xs">role.updated</code>, and <code className="text-xs">role.deleted</code> events.
                Leave empty to disable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="role-update-webhook" className="text-sm font-medium">
                  Webhook URL
                </label>
                <Input
                  id="role-update-webhook"
                  type="url"
                  placeholder="https://example.com/webhooks/role-updated"
                  value={roleUpdateWebhookUrl}
                  onChange={(e) => setRoleUpdateWebhookUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must be HTTPS. If unset, no role update events are sent to this application.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={handleSaveRoleUpdateWebhook} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Webhook
              </Button>
            </CardFooter>
          </Card>

          {/* Silent SSO Origins */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Silent SSO Origins</CardTitle>
              </div>
              <CardDescription>
                Trusted HTTPS origins allowed to silently authenticate users via the NeupID iframe bridge.
                Only the scheme and host are stored — e.g. <code className="text-xs">https://example.com</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {origins.length > 0 ? (
                <ul className="space-y-2">
                  {origins.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-4 rounded-md border px-4 py-3"
                    >
                      <code className="text-sm break-all">{entry.value}</code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isOriginPending}
                        onClick={() => handleRemoveOrigin(entry.id)}
                        aria-label={`Remove ${entry.value}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No origins registered yet.</p>
              )}

              <div className="flex flex-wrap items-end gap-3 pt-2">
                <div className="flex-1 min-w-[240px] space-y-1.5">
                  <label htmlFor="new-origin" className="text-sm font-medium">
                    Add origin
                  </label>
                  <Input
                    id="new-origin"
                    type="url"
                    placeholder="https://example.com"
                    value={newOrigin}
                    onChange={(e) => setNewOrigin(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddOrigin();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isOriginPending || !newOrigin.trim()}
                  onClick={handleAddOrigin}
                >
                  {isOriginPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>

              <FormField
                control={form.control}
                name="allowDevMode"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 rounded-lg border p-3">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                    </FormControl>
                    <div className="space-y-0.5 leading-none">
                      <FormLabel className="font-medium cursor-pointer">Allow dev mode</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        If enabled, silent SSO origin validation is skipped for this app.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Configuration
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
