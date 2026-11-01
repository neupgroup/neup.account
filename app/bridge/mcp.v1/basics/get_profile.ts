import { getActiveAccountId } from '@/services/account/verify';
import { getUserProfile } from '@/services/user';
import { createMcpToolResult, type McpToolModule } from './types';

/** MCP tool that reads the authenticated user's currently active profile. */
async function executeGetProfile() {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return createMcpToolResult({ success: false, error: 'A signed-in account is required.' }, true);
  }

  const profile = await getUserProfile(accountId);
  if (!profile) {
    return createMcpToolResult({ success: false, error: 'The active profile could not be found.' }, true);
  }

  return createMcpToolResult({ success: true, accountId, profile });
}

export const getProfileTool: McpToolModule = {
  definition: {
    name: 'get_profile',
    description: 'Get the signed-in user’s active account profile.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  execute: executeGetProfile,
};
