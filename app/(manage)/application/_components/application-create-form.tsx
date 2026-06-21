'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createManagedApplication } from '@/services/applications/manage';
import { redirectInApp } from '@/core/helper/navigation';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { normalizeApplicationIdPrefix } from '@/services/applications/identifiers';

export function ApplicationCreateForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [idPrefix, setIdPrefix] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const normalizedIdPrefix = normalizeApplicationIdPrefix(idPrefix.trim());
    if (!trimmedName) {
      toast({ variant: 'destructive', title: 'Missing name', description: 'Enter an application name.' });
      return;
    }
    if (!normalizedIdPrefix) {
      toast({ variant: 'destructive', title: 'Missing identifier', description: 'Enter an application identifier.' });
      return;
    }

    setIsSubmitting(true);
    const result = await createManagedApplication({ name: trimmedName, idPrefix: normalizedIdPrefix });
    setIsSubmitting(false);

    if (!result.success || !result.appId) {
      toast({ variant: 'destructive', title: 'Create failed', description: result.error || 'Could not create the application.' });
      return;
    }

    redirectInApp(router, applicationHref('/application', result.appId));
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Input
          value={idPrefix}
          onChange={(event) => setIdPrefix(normalizeApplicationIdPrefix(event.target.value))}
          placeholder="Application identifier, e.g. AcmePortal"
          disabled={isSubmitting}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Final ID format: <code className="rounded bg-muted px-1 py-0.5">identifier.random9</code>. The identifier cannot be changed later.
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

      <Button type="submit" disabled={isSubmitting || !name.trim() || !idPrefix.trim()} className="w-full">
        {isSubmitting ? 'Creating...' : 'Continue'}
      </Button>
    </form>
  );
}
