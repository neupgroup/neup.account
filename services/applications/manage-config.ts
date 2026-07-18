import { isIP } from 'node:net';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { permission } from '@/logica/permission';
import { Prisma } from '@/core/database/prisma';
import prisma from '@/core/database/prisma';
import { getAccountSelectorContext } from '@/services/account/accountSelector';
import { getActiveAccountId, getPersonalAccountId } from '@/services/account/verify';
import { ACCESS_APPLICATION_VIEW_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';
import { checkPermissions } from '@/services/user';
import { logError } from '@/logica/logger/files';
import { dispatchAccountUpdatedEvent } from '@/services/applications/account-update-events';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { activeAccessWhere, cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import {
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS,
  APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS,
  ROOT_APPLICATION_BASICS_EDIT_PERMISSION,
  ROOT_APPLICATION_CONFIG_UPDATE_PERMISSION,
  ROOT_APPLICATION_CONFIG_VIEW_PERMISSION,
  ROOT_APPLICATION_CREATE_PERMISSION,
  ROOT_APPLICATION_DELETE_PERMISSION,
  ROOT_APPLICATION_DEVLOGS_CLEAR_PERMISSION,
  ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION,
  ROOT_APPLICATION_LOGS_VIEW_PERMISSION,
  ROOT_APPLICATION_ROLES_MANAGE_PERMISSION,
  ROOT_APPLICATION_ROLES_RESET_PUSH_PERMISSION,
  ROOT_APPLICATION_ROLES_VIEW_PERMISSION,
  ROOT_APPLICATION_ACCOUNT_DELETE_PERMISSION,
  ROOT_APPLICATION_ACCOUNT_ROLE_UPDATE_PERMISSION,
  ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
  ROOT_APPLICATION_USER_REMOVE_PERMISSION,
  ROOT_APPLICATION_USER_UPDATE_ROLE_PERMISSION,
  ROOT_APPLICATION_USER_VIEW_PERMISSION,
  ROOT_APPLICATION_VIEW_PERMISSION,
  getApplicationPermissionNames,
  type ApplicationPermissionBase,
  type ApplicationPermissionAudience,
} from '@/services/applications/permission-definitions';
import {
  getRoleAccessFlags,
  isRoleDirectlyAssignable,
  roleRequestTarget,
} from '@/services/role-scopes';
import {
  deriveLegacyRoleScopesFromPolicy,
  normalizeAuthzScopeFor,
  normalizeSingleAuthzScopeLevel,
  roleMatchesAssignmentModesPolicy,
} from '@/services/applications/authz-scope-policy';
import {
  revalidateApplicationConfigRoutes,
  revalidateApplicationDetailRoutes,
  revalidateApplicationEditRoutes,
  revalidateApplicationLogsRoutes,
  revalidateApplicationRequestsRoutes,
  revalidateApplicationUsersRoutes,
} from '@/services/applications/revalidate-routes';
import {
  applicationAccessFields,
  applicationResponseFields,
  applicationTokenFields,
  type Application,
  type ApplicationAccessField,
  type ApplicationEndpointConfig,
  type ApplicationPolicyEntry,
  type ManagedApplication,
  type ApplicationDetailsV2,
  applicationPartyValues,
  type ApplicationParty,
} from '@/services/applications/types';
import {
  buildApplicationId,
  camelCaseApplicationIdSegment,
  generateApplicationIdSuffix,
  isValidApplicationIdPrefix,
  isValidApplicationIdSegment,
  normalizeApplicationIdSegment,
  normalizeApplicationIdPrefix,
} from '@/services/applications/identifiers';
import {
  extractApplicationAuthzConfig,
  normalizeApplicationAuthzDefinitions,
  type ApplicationAuthzConfig,
} from '@/services/applications/authz-config';
import { extractGenderFromDetails, resolveDisplayImage } from '@/logica/display-image';
import {
  APPLICATION_MUTATION_BASES,
  APPLICATION_VIEW_BASES,
  applicationAuthzDefinitionTupleSchema,
  canAccessRootApplicationMode,
  canCurrentAccountAccessApplicationByBase,
  getApplicationAuthorization,
  getApplicationRoleGrantsForAccount,
  getCurrentScopedApplicationPermissionNames,
  hasAnyRootApplicationPermission,
  hasAnyPermissionName,
  hasApplicationPermission,
  hasRootApplicationPermission,
  normalizeAccess,
  normalizeEndpoints,
  normalizePolicies,
  normalizeText,
  ownerRoleKeys,
  reserveAvailableApplicationId,
  resolveApplicationAccessForAccount,
  responseAccessSet,
  tokenFieldSet,
  type ApplicationRootModeOption,
} from '@/services/applications/manage-shared';
import {
  canCurrentAccountClearApplicationDevLogs,
  canCurrentAccountDeleteApplication,
  canCurrentAccountEditApplicationBasics,
  canCurrentAccountManageApplicationRoles,
  canCurrentAccountRemoveApplicationUser,
  canCurrentAccountResetApplicationRolePush,
  canCurrentAccountUpdateApplicationConfig,
  canCurrentAccountUpdateApplicationUserRole,
  canCurrentAccountViewApplication,
  canCurrentAccountViewApplicationConfig,
  canCurrentAccountViewApplicationDevLogs,
  canCurrentAccountViewApplicationLogs,
  canCurrentAccountViewApplicationRoles,
  canCurrentAccountViewApplicationUsers,
} from '@/services/applications/manage-permissions';

const updateAppEditSchema = z.object({
  appId: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
  description: z.string().trim().max(1000, 'Description must be 1000 characters or fewer.').optional().or(z.literal('')),
  icon: z.string().trim().max(50).optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .max(500, 'Website must be 500 characters or fewer.')
    .refine(
      (val) => !val || val === '' || (() => { try { new URL(val); return true; } catch { return false; } })(),
      { message: 'Website must be a valid URL.' },
    )
    .optional()
    .or(z.literal('')),
  status: z.enum(['development', 'active', 'hold', 'blocked']),
});

/**
 * Function updateAppEdit.
 *
 * Allows the application owner to update name, description, icon, website, and status.
 */
export async function updateAppEdit(
  input: z.infer<typeof updateAppEditSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const parsed = updateAppEditSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = messages?.[0] ?? 'Invalid value.';
    }
    return { success: false, fieldErrors };
  }

  const { appId, name, description, icon, website, status } = parsed.data;

  const canEdit = await canCurrentAccountEditApplicationBasics(appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to edit this application.' };

  try {
    await prisma.application.update({
      where: { id: appId },
      data: {
        name,
        description: description || null,
        icon: icon || null,
        website: website || null,
        status,
      },
    });
    revalidateApplicationEditRoutes(appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updateAppEdit:${appId}`);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Config page — save secret, access fields, and silent SSO origins together
// ---------------------------------------------------------------------------

const saveAppConfigSchema = z.object({
  appId: z.string().min(1),
  secretKey: z.string().min(16, 'Secret must be at least 16 characters.').optional().or(z.literal('')),
  access: z.array(z.enum(applicationAccessFields)).default([]),
  party: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(1),
  allowDevMode: z.boolean().optional().default(false),
  allowDevIpMode: z.boolean().optional().default(false),
  definedScopes: z.array(applicationAuthzDefinitionTupleSchema).default([]),
  allowMultipleDefinedScopes: z.boolean().optional().default(false),
  applicableForDefinitions: z.array(applicationAuthzDefinitionTupleSchema).default([]),
});

function enforcePartyFieldRules(
  party: ApplicationParty,
  fields: ApplicationAccessField[],
): ApplicationAccessField[] {
  const normalized = fields.filter((field, idx) => fields.indexOf(field) === idx);
  if (party === 0 || party === 1) {
    return normalized;
  }
  if (party === 2) {
    return normalized.filter((field) => field !== 'accountId');
  }
  return normalized.filter((field) => field !== 'accountId' && field !== 'neupid');
}

/**
 * Function saveAppConfig.
 *
 * Saves the application secret (if provided) and the accessTo field list.
 * Silent SSO origins are managed separately via addSilentSsoOrigin / removeSilentSsoOrigin.
 */
export async function saveAppConfig(
  input: z.infer<typeof saveAppConfigSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const parsed = saveAppConfigSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = messages?.[0] ?? 'Invalid value.';
    }
    return { success: false, fieldErrors };
  }

  const {
    appId,
    secretKey,
    access,
    party,
    allowDevMode,
    allowDevIpMode,
    definedScopes,
    allowMultipleDefinedScopes,
    applicableForDefinitions,
  } = parsed.data;
  const sanitizedAccess = enforcePartyFieldRules(
    party,
    access.filter((field) => responseAccessSet.has(field)),
  );
  const fixedTokenFields: ApplicationAccessField[] = [];
  const normalizedDefinedScopes = normalizeApplicationAuthzDefinitions(definedScopes);
  const normalizedApplicableForDefinitions = normalizeApplicationAuthzDefinitions(applicableForDefinitions);

  const canEdit = await canCurrentAccountUpdateApplicationConfig(appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to configure this application.' };

  try {
    const existing = await prisma.application.findUnique({
      where: { id: appId },
      select: { details: true },
    });

    const existingDetails =
      existing?.details && typeof existing.details === 'object'
        ? (existing.details as Record<string, unknown>)
        : {};

    const updateData: Record<string, unknown> = {
      responseFields: sanitizedAccess,
      tokenFields: fixedTokenFields,
      party,
      // Backward-compat: keep legacy JSON in sync until all callers are migrated.
      details: {
        ...existingDetails,
        access: sanitizedAccess,
        token_fields: fixedTokenFields,
        allowDevMode,
        allowDevIpMode,
        definedScopes: normalizedDefinedScopes,
        allowMultipleDefinedScopes,
        applicableForDefinitions: normalizedApplicableForDefinitions,
      },
    };
    if (secretKey && secretKey.trim().length >= 16) {
      updateData.appSecret = secretKey.trim();
    }

    await prisma.application.update({
      where: { id: appId },
      data: updateData,
    });

    revalidateApplicationConfigRoutes(appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `saveAppConfig:${appId}`);
    return { success: false, error: 'Failed to save configuration.' };
  }
}

/**
 * Function getAppConfigData.
 *
 * Returns the data needed to render the config page.
 */
export async function getAppConfigData(appId: string, options?: { rootMode?: boolean }): Promise<{
  hasSecretKey: boolean;
  access: ApplicationAccessField[];
  tokenFields: ApplicationAccessField[];
  party: ApplicationParty;
  silentSsoOrigins: Array<{ id: string; value: string }>;
  serverIps: Array<{ id: string; value: string }>;
  accountUpdateWebhookUrl: string | null;
  roleUpdateWebhookUrl: string | null;
  allowDevMode: boolean;
  allowDevIpMode: boolean;
  definedScopes: ApplicationAuthzConfig['definedScopes'];
  allowMultipleDefinedScopes: boolean;
  applicableForDefinitions: ApplicationAuthzConfig['applicableForDefinitions'];
  status: string;
} | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;
  if (!(await canAccessRootApplicationMode(options?.rootMode))) return null;

  const canEdit = await canCurrentAccountViewApplicationConfig(appId, options);
  if (!canEdit) return null;

  try {
    const [app, originRows, serverIpRows, accountUpdateWebhookRecord, roleUpdateWebhookRecord] = await Promise.all([
      prisma.application.findUnique({
        where: { id: appId },
        select: { appSecret: true, responseFields: true, tokenFields: true, party: true, details: true, status: true },
      }),
      prisma.applicationBridge.findMany({
        where: { appId, type: 'silentSsoOrigin' },
        select: { id: true, value: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.applicationBridge.findMany({
        where: { appId, type: 'serverIp' },
        select: { id: true, value: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.applicationBridge.findFirst({
        where: { appId, type: 'accountUpdateWebhook' },
        select: { value: true },
      }),
      prisma.applicationBridge.findFirst({
        where: { appId, type: 'roleUpdateWebhook' },
        select: { value: true },
      }),
    ]);

    if (!app) return null;

    const legacyDetails = app.details && typeof app.details === 'object'
      ? (app.details as Record<string, unknown>)
      : {};
    const authzConfig = extractApplicationAuthzConfig(app.details);

    const responseFieldSource =
      app.responseFields.length > 0 ? app.responseFields : (legacyDetails as any).access ?? [];
    const tokenFieldSource =
      app.tokenFields.length > 0 ? app.tokenFields : (legacyDetails as any).token_fields ?? [];
    const allowDevMode = Boolean((legacyDetails as any).allowDevMode);
    const allowDevIpMode = Boolean((legacyDetails as any).allowDevIpMode);
    const party = applicationPartyValues.includes(app.party as ApplicationParty)
      ? (app.party as ApplicationParty)
      : 1;

    return {
      hasSecretKey: Boolean(app.appSecret),
      access: enforcePartyFieldRules(
        party,
        normalizeAccess(responseFieldSource).filter((field) => responseAccessSet.has(field)),
      ),
      tokenFields: enforcePartyFieldRules(
        party,
        normalizeAccess(tokenFieldSource).filter((field) => tokenFieldSet.has(field)),
      ),
      party,
      silentSsoOrigins: originRows,
      serverIps: serverIpRows,
      accountUpdateWebhookUrl: accountUpdateWebhookRecord?.value ?? null,
      roleUpdateWebhookUrl: roleUpdateWebhookRecord?.value ?? null,
      allowDevMode,
      allowDevIpMode,
      definedScopes: authzConfig.definedScopes,
      allowMultipleDefinedScopes: authzConfig.allowMultipleDefinedScopes,
      applicableForDefinitions: authzConfig.applicableForDefinitions,
      status: app.status ?? 'development',
    };
  } catch (error) {
    await logError('database', error, `getAppConfigData:${appId}`);
    return null;
  }
}

export async function getApplicationAuthzConfig(appId: string): Promise<ApplicationAuthzConfig | null> {
  try {
    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: { details: true },
    });

    if (!app) return null;
    return extractApplicationAuthzConfig(app.details);
  } catch (error) {
    await logError('database', error, `getApplicationAuthzConfig:${appId}`);
    return null;
  }
}

export async function saveAccountUpdateWebhookUrl(input: {
  appId: string;
  url: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canEdit = await canCurrentAccountUpdateApplicationConfig(input.appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to configure this application.' };

  const url = input.url.trim();

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { success: false, error: 'Webhook URL must use HTTPS.' };
      }
    } catch {
      return { success: false, error: 'Invalid webhook URL.' };
    }
  }

  try {
    if (!url) {
      await prisma.applicationBridge.deleteMany({
        where: { appId: input.appId, type: 'accountUpdateWebhook' },
      });
    } else {
      const existing = await prisma.applicationBridge.findFirst({
        where: { appId: input.appId, type: 'accountUpdateWebhook' },
        select: { id: true },
      });

      if (existing) {
        await prisma.applicationBridge.update({
          where: { id: existing.id },
          data: { value: url },
        });
      } else {
        await prisma.applicationBridge.create({
          data: { appId: input.appId, type: 'accountUpdateWebhook', value: url },
        });
      }
    }

    revalidateApplicationConfigRoutes(input.appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `saveAccountUpdateWebhookUrl:${input.appId}`);
    return { success: false, error: 'Failed to save webhook URL.' };
  }
}

export async function saveRoleUpdateWebhookUrl(input: {
  appId: string;
  url: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canEdit = await canCurrentAccountUpdateApplicationConfig(input.appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to configure this application.' };

  const url = input.url.trim();

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { success: false, error: 'Webhook URL must use HTTPS.' };
      }
    } catch {
      return { success: false, error: 'Invalid webhook URL.' };
    }
  }

  try {
    if (!url) {
      await prisma.applicationBridge.deleteMany({
        where: { appId: input.appId, type: 'roleUpdateWebhook' },
      });
    } else {
      const existing = await prisma.applicationBridge.findFirst({
        where: { appId: input.appId, type: 'roleUpdateWebhook' },
        select: { id: true },
      });

      if (existing) {
        await prisma.applicationBridge.update({
          where: { id: existing.id },
          data: { value: url },
        });
      } else {
        await prisma.applicationBridge.create({
          data: { appId: input.appId, type: 'roleUpdateWebhook', value: url },
        });
      }
    }

    revalidateApplicationConfigRoutes(input.appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `saveRoleUpdateWebhookUrl:${input.appId}`);
    return { success: false, error: 'Failed to save webhook URL.' };
  }
}
