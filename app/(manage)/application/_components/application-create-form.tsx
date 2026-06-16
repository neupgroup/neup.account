'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createManagedApplication } from '@/services/applications/manage';
import { redirectInApp } from '@/core/helper/navigation';

export function ApplicationCreateForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: 'destructive', title: 'Missing name', description: 'Enter an application name.' });
      return;
    }

    setIsSubmitting(true);
    const result = await createManagedApplication({ name: trimmedName });
    setIsSubmitting(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Create failed', description: result.error || 'Could not create the application.' });
      return;
    }

    redirectInApp(router, `/application/${result.appId}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Application name"
          disabled={isSubmitting}
          autoFocus
        />
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Creating...' : 'Continue'}
      </Button>
    </form>
  );
}
