import { getManagedApplications } from '@/services/applications/manage';
import { createMcpToolResult, type McpToolModule } from '../basics/types';

/** Lists applications the current account can access through application management. */
async function executeListApplications() {
  const applications = await getManagedApplications();
  return createMcpToolResult({ success: true, applications });
}

export const listApplicationsTool: McpToolModule = {
  definition: {
    name: 'list_applications',
    description: 'List applications visible to the signed-in account under its current application access grants.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  execute: executeListApplications,
};
