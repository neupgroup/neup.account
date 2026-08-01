'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2 } from '@/components/icons';
import { createManagedApplication, resolveAvailableApplicationId } from '@/services/applications/manage';
import { redirectInApp } from '@/core/helpers/link/navigation';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import {
  camelCaseApplicationIdSegment,
  normalizeApplicationIdPrefix,
  normalizeApplicationIdSegment,
} from '@/services/applications/identifiers';

type AvailabilityState =
  | { status: 'idle'; appId: string; suffix: string; error?: undefined }
  | { status: 'checking'; appId: string; suffix: string; error?: undefined }
  | { status: 'available'; appId: string; suffix: string; error?: undefined }
  | { status: 'error'; appId: string; suffix: string; error: string };

function Dots({ active }: { active: boolean }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }

    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % 3);
    }, 300);

    return () => window.clearInterval(timer);
  }, [active]);

  return <span>{['.', '..', '...'][frame]}</span>;
}

export function ApplicationCreateForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [idPrefix, setIdPrefix] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customSuffix, setCustomSuffix] = useState('');
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: 'idle',
    appId: '',
    suffix: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedName = name.trim();
  const normalizedIdPrefix = normalizeApplicationIdPrefix(idPrefix.trim());
  const generatedSuffix = useMemo(
    () => camelCaseApplicationIdSegment(trimmedName),
    [trimmedName],
  );
  const normalizedCustomSuffix = useMemo(
    () => normalizeApplicationIdSegment(customSuffix.trim()),
    [customSuffix],
  );
  const requestedSuffix = customMode ? normalizedCustomSuffix : generatedSuffix;

  useEffect(() => {
    if (!normalizedIdPrefix || !requestedSuffix) {
      setAvailability({ status: 'idle', appId: '', suffix: '' });
      return;
    }

    let cancelled = false;
    setAvailability({
      status: 'checking',
      appId: `${normalizedIdPrefix}.${requestedSuffix}`,
      suffix: requestedSuffix,
    });

    const timer = window.setTimeout(async () => {
      const result = await resolveAvailableApplicationId({
        idPrefix: normalizedIdPrefix,
        name: customMode ? undefined : trimmedName,
        customSuffix: customMode ? normalizedCustomSuffix : undefined,
      });

      if (cancelled) return;

      if (!result.success || !result.appId || !result.resolvedSuffix) {
        setAvailability({
          status: 'error',
          appId: `${normalizedIdPrefix}.${requestedSuffix}`,
          suffix: requestedSuffix,
          error: result.error || 'Could not check application ID.',
        });
        return;
      }

      setAvailability({
        status: 'available',
        appId: result.appId,
        suffix: result.resolvedSuffix,
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customMode, normalizedCustomSuffix, normalizedIdPrefix, requestedSuffix, trimmedName]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!trimmedName) {
      toast({ variant: 'destructive', title: 'Missing name', description: 'Enter an application name.' });
      return;
    }
    if (!normalizedIdPrefix) {
      toast({ variant: 'destructive', title: 'Missing identifier', description: 'Enter an application identifier.' });
      return;
    }
    if (availability.status !== 'available' || !availability.suffix) {
      toast({ variant: 'destructive', title: 'ID not ready', description: 'Wait until the application ID is available.' });
      return;
    }

    setIsSubmitting(true);
    const result = await createManagedApplication({
      name: trimmedName,
      idPrefix: normalizedIdPrefix,
      idSuffix: availability.suffix,
    });
    setIsSubmitting(false);

    if (!result.success || !result.appId) {
      toast({ variant: 'destructive', title: 'Create failed', description: result.error || 'Could not create the application.' });
      return;
    }

    redirectInApp(router, applicationHref('/application', result.appId));
    router.refresh();
  };

  const showResolvedId =
    availability.status === 'available' || availability.status === 'checking' || availability.status === 'error';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Input
          value={idPrefix}
          onChange={(event) => setIdPrefix(normalizeApplicationIdPrefix(event.target.value))}
          placeholder="App ID, e.g. AcmePortal"
          disabled={isSubmitting}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          This is the fixed first part of the application ID. Only letters and numbers are allowed.
        </p>
      </div>

      <div className="space-y-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Application title"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-foreground">Application ID</span>
          {!customMode ? (
            <>
              <span className="rounded bg-background px-2 py-1 font-mono text-xs">
                {normalizedIdPrefix ? `${normalizedIdPrefix}.${generatedSuffix || 'generatedCamelCase'}` : 'appid.generatedCamelCase'}
              </span>
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className="text-xs text-primary underline underline-offset-4"
                disabled={isSubmitting}
              >
                Choose custom text
              </button>
            </>
          ) : (
            <>
              <span className="rounded bg-background px-2 py-1 font-mono text-xs">
                {normalizedIdPrefix || 'appid'}.
              </span>
              <Input
                value={customSuffix}
                onChange={(event) => setCustomSuffix(normalizeApplicationIdSegment(event.target.value))}
                placeholder="Custom suffix"
                disabled={isSubmitting}
                className="max-w-xs"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomMode(false);
                  setCustomSuffix('');
                }}
                className="text-xs text-primary underline underline-offset-4"
                disabled={isSubmitting}
              >
                Use generated text
              </button>
            </>
          )}
        </div>

        {showResolvedId ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {availability.status === 'available' ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-700">Available</span>
                <span className="rounded bg-background px-2 py-1 font-mono text-xs">{availability.appId}</span>
              </>
            ) : availability.status === 'checking' ? (
              <>
                <span className="font-medium text-muted-foreground">
                  Checking<Dots active />
                </span>
                <span className="rounded bg-background px-2 py-1 font-mono text-xs">{availability.appId}</span>
              </>
            ) : (
              <span className="text-sm text-destructive">{availability.error}</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {customMode
              ? 'Enter a custom suffix for the second part of the application ID.'
              : 'The second part is generated from the title in camelCase without special characters.'}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting || availability.status !== 'available' || !trimmedName || !normalizedIdPrefix}
        >
          {isSubmitting ? 'Creating...' : 'Create Application'}
        </Button>
      </div>
    </form>
  );
}
