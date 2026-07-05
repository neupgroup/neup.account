'use server';

import { headers } from 'next/headers';

function normalizeParamValue(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getParamHeaderCandidates(name: string): string[] {
  const normalizedName = name.trim();

  if (!normalizedName) {
    return [];
  }

  const kebabName = normalizedName.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

  return [
    `x-${kebabName}`,
    `x-url-param-${kebabName}`,
    `x-query-${kebabName}`,
  ];
}

export async function getUrlParam(
  name: string,
  explicitValue?: string | null,
): Promise<string | null> {
  const normalizedExplicitValue = normalizeParamValue(explicitValue);
  if (normalizedExplicitValue) {
    return normalizedExplicitValue;
  }

  const requestHeaders = await headers();

  for (const headerName of getParamHeaderCandidates(name)) {
    const headerValue = normalizeParamValue(requestHeaders.get(headerName));
    if (headerValue) {
      return headerValue;
    }
  }

  return null;
}

export async function getUrlParams(
  definitions: Record<string, string | null | undefined> = {},
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    Object.entries(definitions).map(async ([key, value]) => [
      key,
      await getUrlParam(key, value),
    ] as const),
  );

  return Object.fromEntries(entries);
}

export async function getRequestProtocol(): Promise<'http' | 'https'> {
  const requestHeaders = await headers();
  const forwardedProto = normalizeParamValue(requestHeaders.get('x-forwarded-proto'));

  if (forwardedProto?.toLowerCase() === 'http') {
    return 'http';
  }

  return 'https';
}

export async function isHttpsRequest(): Promise<boolean> {
  return (await getRequestProtocol()) === 'https';
}

export async function isHttpRequest(): Promise<boolean> {
  return (await getRequestProtocol()) === 'http';
}
