import crypto from 'node:crypto';

const APPLICATION_ID_PREFIX_PATTERN = /^[0-9A-Za-z]+$/;
const APPLICATION_ID_SEGMENT_PATTERN = /^[0-9A-Za-z]+$/;

export function normalizeApplicationIdPrefix(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '');
}

export function isValidApplicationIdPrefix(value: string): boolean {
  return APPLICATION_ID_PREFIX_PATTERN.test(value);
}

export function generateApplicationIdSuffix(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(9);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function buildApplicationId(prefix: string, suffix = generateApplicationIdSuffix()): string {
  return `${prefix}.${suffix}`;
}

export function normalizeApplicationIdSegment(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '');
}

export function isValidApplicationIdSegment(value: string): boolean {
  return APPLICATION_ID_SEGMENT_PATTERN.test(value);
}

export function camelCaseApplicationIdSegment(value: string): string {
  const parts = value
    .trim()
    .split(/[^0-9A-Za-z]+/)
    .map((part) => part.replace(/[^0-9A-Za-z]/g, ''))
    .filter(Boolean);

  if (parts.length === 0) return '';

  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

export function slugifyAuthzTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildAuthzEntityId(appId: string, title: string): string {
  const slug = slugifyAuthzTitle(title);
  if (!slug) {
    throw new Error('Identifier title is required.');
  }
  return `${appId}.${slug}`;
}

export function humanizeIdentifier(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
