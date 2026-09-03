'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '#/core/hooks/useToast';

/** Shows errors returned through a redirect URL using the app-wide toast UI. */
export function UrlErrorToast() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const shownUrl = useRef<string | null>(null);

  const error = searchParams.get('error');
  const description = searchParams.get('error_description');
  const urlKey = searchParams.toString();

  useEffect(() => {
    if (!error || shownUrl.current === urlKey) {
      return;
    }

    shownUrl.current = urlKey;
    toast({
      name: 'url-error',
      state: 'error',
      title: error.replace(/[_-]+/g, ' '),
      description: description || 'Something went wrong. Please try again.',
      dismissesOn: 8,
    });
  }, [description, error, toast, urlKey]);

  return null;
}
