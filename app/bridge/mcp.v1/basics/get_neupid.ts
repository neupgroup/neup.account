import { getActiveAccountId } from '@/services/account/verify';
import { getUserNeupIdDetails } from '@/services/user';
import { createMcpToolResult, type McpToolModule } from './types';

/** Returns NeupIDs attached to the signed-in user's active account. */
async function executeGetNeupId() {
  const accountId = await getActiveAccountId();
  if (!accountId) return createMcpToolResult({ success: false, error: 'A signed-in account is required.' }, true);

  const neupIds = await getUserNeupIdDetails(accountId);
  return createMcpToolResult({ success: true, accountId, neupIds });
}

export const getNeupIdTool: McpToolModule = {
  definition: {
    name: 'get_neupid',
    description: 'List NeupIDs for the signed-in user’s active account, including the primary flag.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  execute: executeGetNeupId,
};
