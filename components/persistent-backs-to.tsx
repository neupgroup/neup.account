'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { recordCurrentInAppPath } from '@/neup.core/helpers/back-navigation';

const PARAM_KEY = 'backsTo';
const STORAGE_KEY = `persistent-query-param:${PARAM_KEY}`;

function storeParamValue(value: string | null) {
  if (!value) return;
  window.sessionStorage.setItem(STORAGE_KEY, value);
}

function getStoredParamValue() {
  return window.sessionStorage.getItem(STORAGE_KEY);
}

function getCurrentParamValue() {
  return new URL(window.location.href).searchParams.get(PARAM_KEY);
}

function getPersistedParamValue() {
  const currentValue = getCurrentParamValue();

  if (currentValue) {
    storeParamValue(currentValue);
    return currentValue;
  }

  return getStoredParamValue();
}

function normalizeUrlWithBacksTo(target: string | URL | null | undefined) {
  if (!target) return target;

  const url = new URL(target.toString(), window.location.href);

  if (url.origin !== window.location.origin) {
    return target;
  }

  const targetParamValue = url.searchParams.get(PARAM_KEY);

  if (targetParamValue) {
    storeParamValue(targetParamValue);
    return url.toString();
  }

  const persistedParamValue = getPersistedParamValue();

  if (!persistedParamValue) {
    return url.toString();
  }

  url.searchParams.set(PARAM_KEY, persistedParamValue);
  return url.toString();
}

export function PersistentBacksTo() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams?.toString();
    const currentPath = `${pathname || '/'}${query ? `?${query}` : ''}`;
    recordCurrentInAppPath(currentPath);
  }, [pathname, searchParams]);

  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    const syncCurrentUrl = () => {
      const currentUrl = new URL(window.location.href);
      const currentParamValue = currentUrl.searchParams.get(PARAM_KEY);

      if (currentParamValue) {
        storeParamValue(currentParamValue);
        return;
      }

      const storedParamValue = getStoredParamValue();

      if (!storedParamValue) return;

      currentUrl.searchParams.set(PARAM_KEY, storedParamValue);
      originalReplaceState(window.history.state, '', currentUrl.toString());
    };

    const wrapHistoryMethod = (method: History['pushState']): History['pushState'] => {
      return (state, unused, url) => {
        const normalizedUrl = normalizeUrlWithBacksTo(url);
        return method(state, unused, normalizedUrl);
      };
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const normalizedHref = normalizeUrlWithBacksTo(anchor.href);
      if (typeof normalizedHref === 'string' && normalizedHref !== anchor.href) {
        anchor.href = normalizedHref;
      }
    };

    syncCurrentUrl();

    window.history.pushState = wrapHistoryMethod(originalPushState);
    window.history.replaceState = wrapHistoryMethod(originalReplaceState);
    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', syncCurrentUrl);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', syncCurrentUrl);
    };
  }, []);

  return null;
}
