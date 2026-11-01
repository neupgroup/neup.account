import { getActiveAccountId } from '@/services/account/verify';
import { getUserProfile } from '@/services/user';
import { updateUserProfile } from '@/services/profile';
import { createMcpToolResult, type McpToolModule } from './types';

const profileFieldNames = [
  'nameDisplay',
  'accountPhoto',
  'nameFirst',
  'nameMiddle',
  'nameLast',
  'gender',
  'dateBirth',
  'nationality',
  'primaryPhone',
  'secondaryPhone',
  'permanentLocation',
  'currentLocation',
  'workLocation',
  'otherLocation',
] as const;

type ProfileFieldName = (typeof profileFieldNames)[number];

/** Filters user-supplied profile data to fields supported by the profile service. */
function pickProfileUpdates(value: unknown): Partial<Record<ProfileFieldName, string>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const updateEntries = Object.entries(input);
  if (updateEntries.length === 0) return null;
  if (updateEntries.some(([key, fieldValue]) =>
    !profileFieldNames.includes(key as ProfileFieldName) || typeof fieldValue !== 'string'
  )) return null;

  return Object.fromEntries(updateEntries) as Partial<Record<ProfileFieldName, string>>;
}

/** MCP tool that updates fields on the authenticated user's active profile. */
async function executeUpdateProfile(args: Record<string, unknown>) {
  const updates = pickProfileUpdates(args.updates);
  if (!updates) {
    return createMcpToolResult({
      success: false,
      error: 'Provide a non-empty updates object containing supported string profile fields.',
    }, true);
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return createMcpToolResult({ success: false, error: 'A signed-in account is required.' }, true);
  }

  const result = await updateUserProfile(accountId, updates);
  if (!result.success) {
    return createMcpToolResult({ success: false, error: result.error || 'The profile could not be updated.' }, true);
  }

  const profile = await getUserProfile(accountId);
  return createMcpToolResult({ success: true, accountId, profile });
}

export const updateProfileTool: McpToolModule = {
  definition: {
    name: 'update_profile',
    description: 'Update supported fields on the signed-in user’s active account profile. Existing profile permissions are enforced.',
    inputSchema: {
      type: 'object',
      properties: {
        updates: {
          type: 'object',
          description: 'Fields to update. Only string values are accepted.',
          properties: {
            nameDisplay: { type: 'string' },
            accountPhoto: { type: 'string', format: 'uri' },
            nameFirst: { type: 'string' },
            nameMiddle: { type: 'string' },
            nameLast: { type: 'string' },
            gender: { type: 'string' },
            dateBirth: { type: 'string', format: 'date' },
            nationality: { type: 'string' },
            primaryPhone: { type: 'string' },
            secondaryPhone: { type: 'string' },
            permanentLocation: { type: 'string' },
            currentLocation: { type: 'string' },
            workLocation: { type: 'string' },
            otherLocation: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      required: ['updates'],
      additionalProperties: false,
    },
  },
  execute: executeUpdateProfile,
};
