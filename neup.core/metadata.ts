import type { Metadata } from 'next';

export const APP_NAME = 'NeupID';

function compact(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
}

export function formatAppTitle(...parts: Array<string | null | undefined>) {
  const titleParts = compact(parts);
  titleParts.push(APP_NAME);
  return titleParts.join(', ');
}

export function createPageMetadata(
  ...parts: Array<string | null | undefined>
): Metadata {
  return {
    title: formatAppTitle(...parts),
  };
}

