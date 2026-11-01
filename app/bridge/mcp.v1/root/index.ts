import { checkPermissions } from '@/services/user';
import { getUserStats } from '@/services/manage/accounts';
import { getAllAccountsPaginated } from '@/services/manage/accounts';
import { getAllRequests } from '@/services/manage/requests/all';
import { getExpiredGuestAccounts, deleteAllExpiredGuestAccounts } from '@/services/manage/accounts/cleanup';
import { getPaymentSettings } from '@/services/manage/site/payments';
import { getSocialLinks } from '@/services/manage/site/socials';
import { createMcpToolResult, type McpToolModule } from '../basics/types';

const ROOT_CONFIG_PERMISSIONS = ['root.payment_config.view', 'site.socials.read', 'site.socials.update'];

/** Returns the total account count after checking root dashboard access. */
async function executeGetTotalUsers() {
  if (!(await checkPermissions(['root.dashboard.view']))) {
    return createMcpToolResult({ success: false, error: 'Permission denied.' }, true);
  }
  const stats = await getUserStats();
  return createMcpToolResult({ success: true, totalUsers: stats.totalUsers });
}

/** Searches accounts using the root account service and its root.account.view gate. */
async function executeSearchAccounts(args: Record<string, unknown>) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (query.length < 2) {
    return createMcpToolResult({ success: false, error: 'query must contain at least two characters.' }, true);
  }

  const pageSize = typeof args.pageSize === 'number' && Number.isInteger(args.pageSize)
    ? Math.min(Math.max(args.pageSize, 1), 25)
    : 10;
  if (!(await checkPermissions(['root.account.view']))) {
    return createMcpToolResult({ success: false, error: 'Permission denied.' }, true);
  }

  const result = await getAllAccountsPaginated({ page: 1, pageSize, search: query });
  return createMcpToolResult({ success: true, ...result });
}

/** Returns pending requests visible to root request approvers. */
async function executeGetPendingRequests() {
  if (!(await checkPermissions(['requests.root_approval.view']))) {
    return createMcpToolResult({ success: false, error: 'Permission denied.' }, true);
  }
  const allPendingRequests = (await getAllRequests()).filter((request) => request.status === 'pending');
  return createMcpToolResult({ success: true, total: allPendingRequests.length, requests: allPendingRequests.slice(0, 100) });
}

/** Counts expired guest accounts without returning the full account list. */
async function executeGetTemporaryCleanupAccountCount() {
  if (!(await checkPermissions(['root.account.view']))) {
    return createMcpToolResult({ success: false, error: 'Permission denied.' }, true);
  }
  const result = await getExpiredGuestAccounts();
  if (result.error) return createMcpToolResult({ success: false, error: result.error }, true);
  return createMcpToolResult({ success: true, total: result.accounts.length });
}

/** Deletes all expired guest accounts only after an explicit confirmation argument. */
async function executeCleanupTemporaryAccounts(args: Record<string, unknown>) {
  if (args.confirm !== true) {
    return createMcpToolResult({ success: false, error: 'Set confirm to true to delete all expired guest accounts.' }, true);
  }
  const result = await deleteAllExpiredGuestAccounts();
  return createMcpToolResult(result, !result.success);
}

/** Reads site payment and social configuration only for accounts with matching view access. */
async function executeGetSiteConfig() {
  const [canViewPayments, canViewSocials, canUpdateSocials] = await Promise.all([
    checkPermissions(['root.payment_config.view']),
    checkPermissions(['site.socials.read']),
    checkPermissions(['site.socials.update']),
  ]);
  if (!canViewPayments && !canViewSocials && !canUpdateSocials) {
    return createMcpToolResult({ success: false, error: 'Permission denied.' }, true);
  }

  const [payments, socials] = await Promise.all([
    canViewPayments ? getPaymentSettings() : Promise.resolve(undefined),
    canViewSocials || canUpdateSocials ? getSocialLinks() : Promise.resolve(undefined),
  ]);
  return createMcpToolResult({ success: true, ...(payments ? { payments } : {}), ...(socials ? { socials } : {}) });
}

export const rootTools: McpToolModule[] = [
  {
    definition: {
      name: 'get_total_users',
      description: 'Get the total number of accounts in the system. Requires root dashboard access.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeGetTotalUsers,
  },
  {
    definition: {
      name: 'search_accounts',
      description: 'Search system accounts by display name, account ID, NeupID, or supported account search filters. Requires root account view access.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2 },
          pageSize: { type: 'integer', minimum: 1, maximum: 25 },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    execute: executeSearchAccounts,
  },
  {
    definition: {
      name: 'get_pending_requests',
      description: 'List pending account, verification, and application requests for root approvers.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeGetPendingRequests,
  },
  {
    definition: {
      name: 'get_temporary_cleanup_account_count',
      description: 'Get the number of expired temporary guest accounts eligible for cleanup. Requires root account view access.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeGetTemporaryCleanupAccountCount,
  },
  {
    definition: {
      name: 'cleanup_temporary_accounts',
      description: 'Permanently delete all expired guest accounts and their associated records. Requires root account delete access and confirm=true.',
      annotations: { destructiveHint: true },
      inputSchema: {
        type: 'object',
        properties: { confirm: { type: 'boolean', const: true } },
        required: ['confirm'],
        additionalProperties: false,
      },
    },
    execute: executeCleanupTemporaryAccounts,
  },
  {
    definition: {
      name: 'get_site_config',
      description: 'View permitted site payment settings and social links.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeGetSiteConfig,
  },
];
