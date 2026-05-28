'use client';

import { useTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/core/hooks/use-toast';
import { saveAppConfig, addSilentSsoOrigin, removeSilentSsoOrigin, addServerIp, removeServerIp } from '@/services/applications/manage';
import {
  applicationResponseFields,
  applicationTokenFields,
  type ApplicationAccessField,
  type ApplicationResponseField,
  type ApplicationTokenField,
} from '@/services/applications/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Eye, EyeOff, Plus, Trash2, KeyRound, Database, Globe, Variable } from 'lucide-react';

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
  tokenFields: z.array(z.enum(applicationTokenFields)).default([]),
  allowDevMode: z.boolean().default(false),
  allowDevIpMode: z.boolean().default(false),
});

type FormValues = z.infer<typeof schema>;

const responseFieldSet = new Set<ApplicationAccessField>(applicationResponseFields);
const isResponseField = (field: ApplicationAccessField): field is ApplicationResponseField => responseFieldSet.has(field);

const tokenFieldSet = new Set<ApplicationAccessField>(applicationTokenFields);
const isTokenField = (field: ApplicationAccessField): field is ApplicationTokenField => tokenFieldSet.has(field);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  appId: string;
  hasSecretKey: boolean;
  initialAccess: ApplicationAccessField[];
  initialTokenFields: ApplicationAccessField[];
  initialOrigins: Array<{ id: string; value: string }>;
  initialServerIps: Array<{ id: string; value: string }>;
  initialAllowDevMode: boolean;
  initialAllowDevIpMode: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppConfigForm({
  appId,
  hasSecretKey,
  initialAccess,
  initialTokenFields,
  initialOrigins,
  initialServerIps,
  initialAllowDevMode,
  initialAllowDevIpMode,
}: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isOriginPending, startOriginTransition] = useTransition();
  const [showSecret, setShowSecret] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [newServerIp, setNewServerIp] = useState('');
  const [origins, setOrigins] = useState(initialOrigins);
  const [serverIps, setServerIps] = useState(initialServerIps);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretKey: '',
      access: initialAccess.filter(isResponseField),
      tokenFields: initialTokenFields.filter(isTokenField),
      allowDevMode: initialAllowDevMode,
      allowDevIpMode: initialAllowDevIpMode,
    },
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await saveAppConfig({
        appId,
        secretKey: values.secretKey || undefined,
        access: values.access,
        tokenFields: values.tokenFields,
        allowDevMode: values.allowDevMode,
        allowDevIpMode: values.allowDevIpMode,
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

  return (
    <div className="grid gap-6">
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

          {/* Access Fields */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <CardTitle>API Response Fields</CardTitle>
              </div>
              <CardDescription>
                Select which fields the API will include in its response. Only checked fields are returned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="access"
                render={() => (
                  <FormItem>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(applicationResponseFields as readonly ApplicationResponseField[]).map((field) => {
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
                                        checked
                                          ? [...current, field]
                                          : current.filter((v) => v !== field),
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

          {/* Token fields (JWT only) */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Variable className="h-4 w-4 text-muted-foreground" />
                <CardTitle>JWT Token Fields</CardTitle>
              </div>
              <CardDescription>
                Select which fields are embedded in the issued JWT. These fields are not included in the API response payload.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="tokenFields"
                render={() => (
                  <FormItem>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(applicationTokenFields as readonly ApplicationTokenField[]).map((tokenField) => {
                        const meta = fieldLabels[tokenField];
                        return (
                          <FormField
                            key={tokenField}
                            control={form.control}
                            name="tokenFields"
                            render={({ field: formField }) => (
                              <FormItem className="flex items-start gap-3 rounded-lg border p-3">
                                <FormControl>
                                  <Checkbox
                                    checked={formField.value?.includes(tokenField)}
                                    onCheckedChange={(checked) => {
                                      const current = formField.value ?? [];
                                      formField.onChange(
                                        checked
                                          ? [...current, tokenField]
                                          : current.filter((v) => v !== tokenField),
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

                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <Checkbox checked disabled aria-label="Issued On is always included in JWT" />
                        <div className="space-y-0.5 leading-none">
                          <p className="text-sm font-medium">Issued On</p>
                          <p className="text-xs text-muted-foreground">JWT issued-at timestamp (<code className="text-xs">iat</code>).</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <Checkbox checked disabled aria-label="Expires On is always included in JWT" />
                        <div className="space-y-0.5 leading-none">
                          <p className="text-sm font-medium">Expires On</p>
                          <p className="text-xs text-muted-foreground">JWT expiry timestamp (<code className="text-xs">exp</code>).</p>
                        </div>
                      </div>
                    </div>
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
