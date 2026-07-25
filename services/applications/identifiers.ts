import crypto from 'node:crypto';

const APPLICATION_ID_PREFIX_PATTERN = /^[0-9a-z]+$/;
const APPLICATION_ID_SEGMENT_PATTERN = /^[0-9a-z]+$/;

/**
 * ::neup.documentation::application-identifiers-module
 * ::title Application Identifier Helpers
 *
 * Normalizes, validates, and generates application-related identifiers.
 *
 * ::public
 *
 * Use this module to build app IDs, authz entity IDs, and human-readable labels from identifier fragments.
 *
 * ::public end
 *
 * ::private
 *
 * The helpers enforce a conservative ASCII alphanumeric identifier format for application prefixes and segments.
 *
 * ::private end
 *
 * ::end
 */
export function normalizeApplicationIdPrefix(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toLowerCase();
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
  /**
   * ::neup.documentation::application-identifiers-build-application-id
   * ::function buildApplicationId(prefix, suffix)
   *
   * Builds a full application ID from a prefix and suffix.
   *
   * ::public
   *
   * The generated ID uses the format `<prefix>.<suffix>`.
   *
   * ::public end
   *
   * ::private
   *
   * When no suffix is supplied, a random one is generated with `generateApplicationIdSuffix()`.
   *
   * ::private end
   *
   * ::end
   */
  return `${normalizeApplicationIdPrefix(prefix)}.${normalizeApplicationIdSegment(suffix)}`;
}

export function normalizeApplicationIdSegment(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toLowerCase();
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

  return parts.map((part) => part.toLowerCase()).join('');
}

export function normalizeApplicationId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
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
  /**
   * ::neup.documentation::application-identifiers-build-authz-entity-id
   * ::function buildAuthzEntityId(appId, title)
   *
   * Builds a stable authz entity identifier for an application-scoped title.
   *
   * ::public
   *
   * The title is slugified and appended to the application ID.
   *
   * ::public end
   *
   * ::private
   *
   * Empty or fully invalid titles are rejected with an error instead of producing a blank identifier suffix.
   *
   * ::private end
   *
   * ::end
   */
  const slug = slugifyAuthzTitle(title);
  if (!slug) {
    throw new Error('Identifier title is required.');
  }
  return `${normalizeApplicationId(appId)}.${slug}`;
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
