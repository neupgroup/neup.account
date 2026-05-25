'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId, getPersonalAccountId } from '@/core/auth/verify';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
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
} from '@/services/applications/types';

const responseAccessSet = new Set<ApplicationAccessField>(applicationResponseFields);
const tokenFieldSet = new Set<ApplicationAccessField>(applicationTokenFields);

const createApplicationSchema = z.object({
  name: z.string().trim().min(1, 'Application name is required.').max(120, 'Application name is too long.'),
});

const saveSecretSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  secretKey: z.string().min(16, 'Secret key is required.'),
});

const saveAccessSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  access: z.array(z.enum(applicationAccessFields)).default([]),
});

const policyEntrySchema = z.object({
  name: z.string().trim().min(1, 'Policy name is required.').max(120, 'Policy name is too long.'),
  policy: z.string().trim().min(1, 'Policy content is required.'),
});

const savePoliciesSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  policies: z.array(policyEntrySchema).default([]),
});

const saveEndpointsSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  dataDeletionApi: z.string().trim().max(500).optional().or(z.literal('')),
  dataDeletionPage: z.string().trim().max(500).optional().or(z.literal('')),
  accountBlock: z.string().trim().max(4000).optional().or(z.literal('')),
  accountBlockApi: z.string().trim().max(500).optional().or(z.literal('')),
  logoutPage: z.string().trim().max(500).optional().or(z.literal('')),
  logoutApi: z.string().trim().max(500).optional().or(z.literal('')),
});

const updateApplicationStatusSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  status: z.enum(['development', 'active', 'rejected', 'blocked']),
});

const viewRoleKeys = new Set(['application.owner', 'application.view', 'app.view', 'application.edit', 'app.edit', 'application.manage', 'app.manage', 'manage', '*']);
const editRoleKeys = new Set(['application.owner', 'application.edit', 'app.edit', 'application.manage', 'app.manage', 'manage', '*']);
const ownerRoleKeys = new Set(['application.owner', 'app.owner', 'owner', '*']);

/**
 * Function normalizeText.
 */
function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}


/**
 * Function normalizeAccess.
 */
function normalizeAccess(value: unknown): ApplicationAccessField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is ApplicationAccessField =>
    typeof entry === 'string' && (applicationAccessFields as readonly string[]).includes(entry)
  );
}


/**
 * Function normalizePolicies.
 */
function normalizePolicies(value: unknown): ApplicationPolicyEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  // Handle legacy array shape: { name, policy }
  const legacy = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = normalizeText(record.name);
      const policy = normalizeText(record.policy);
      if (!name || !policy) return null;
      return { name, policy };
    })
    .filter((e): e is ApplicationPolicyEntry => e !== null);

  if (legacy.length > 0) return legacy;

  // Handle relational ApplicationPolicy shape: { policyType, policyValue }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = normalizeText(record.policyType ?? record.name);
      const policyVal = record.policyValue ?? record.policy;
      const policy = typeof policyVal === 'string' ? policyVal : JSON.stringify(policyVal);
      const policyText = normalizeText(policy);
      if (!name || !policyText) return null;
      return { name, policy: policyText };
    })
    .filter((e): e is ApplicationPolicyEntry => e !== null);
}


/**
 * Function normalizeEndpoints.
 */
function normalizeEndpoints(value: unknown): ApplicationEndpointConfig {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    dataDeletionApi: normalizeText(record.dataDeletionApi),
    dataDeletionPage: normalizeText(record.dataDeletionPage),
    accountBlock: normalizeText(record.accountBlock),
    accountBlockApi: normalizeText(record.accountBlockApi),
    logoutPage: normalizeText(record.logoutPage),
    logoutApi: normalizeText(record.logoutApi),
  };
}


/**
 * Function resolveApplicationAccessForAccount.
 */
async function resolveApplicationAccessForAccount(accountId: string, appId: string): Promise<{ canView: boolean; canEdit: boolean }> {
  try {
    const roleRows = await prisma.member.findMany({
      where: {
        memberId: accountId,
        parentApplicationId: appId,
      },
      select: {
        roleId: true,
      },
    });

    if (roleRows.length === 0) {
      return { canView: false, canEdit: false };
    }

    const normalizedRoles = new Set(roleRows.map((row) => row.roleId.trim().toLowerCase()));
    const canEdit = Array.from(normalizedRoles).some((role) => editRoleKeys.has(role));
    const canView = canEdit || Array.from(normalizedRoles).some((role) => viewRoleKeys.has(role));

    return { canView, canEdit };
  } catch (error) {
    await logError('database', error, `resolveApplicationAccessForAccount:${accountId}:${appId}`);
    return { canView: false, canEdit: false };
  }
}


/**
 * Function getApplicationAuthorization.
 */
async function getApplicationAuthorization(accountId: string, appId: string): Promise<{ exists: boolean; canView: boolean; canEdit: boolean }> {
  const application = await prisma.application.findUnique({ where: { id: appId }, select: { id: true } });
  if (!application) return { exists: false, canView: false, canEdit: false };

  const access = await resolveApplicationAccessForAccount(accountId, appId);
  return { exists: true, canView: access.canView, canEdit: access.canEdit };
}


/**
 * Function isApplicationOwnerForAccount.
 */
export async function isApplicationOwnerForAccount(accountId: string, appId: string): Promise<boolean> {
  const app = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true },
  });

  if (!app) return false;

  const ownerRoleRows = await prisma.member.findMany({
    where: {
      memberId: accountId,
      parentApplicationId: appId,
    },
    select: {
      roleId: true,
    },
  });

  return ownerRoleRows.some((row) => ownerRoleKeys.has(row.roleId.trim().toLowerCase()));
}


/**
 * Type ApplicationDetailsForViewer.
 */
export type ApplicationDetailsForViewer = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  configuredAccess: ApplicationAccessField[];
  accessedData: string[];
  hasUsedApp: boolean;
  policies: ApplicationPolicyEntry[];
  endpoints: ApplicationEndpointConfig;
  canDelete: boolean;
};


/**
 * Function getApplicationDetailsForViewer.
 */
export async function getApplicationDetailsForViewer(appId: string): Promise<ApplicationDetailsForViewer | null> {
  const activeAccountId = await getActiveAccountId();
  if (!activeAccountId) return null;

  const personalAccountId = await getPersonalAccountId();

  try {
    const authorization = await getApplicationAuthorization(activeAccountId, appId);
    if (!authorization.exists || !authorization.canView) return null;

    const [application, appSessions, canDelete] = await Promise.all([
      prisma.application.findUnique({
        where: { id: appId },
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
          responseFields: true,
          policies: true,
          endpoints: true,
        },
      }),
      personalAccountId
        ? prisma.member.findMany({
            where: { memberId: personalAccountId, parentApplicationId: appId },
            select: { roleId: true },
          })
        : [],
      isApplicationOwnerForAccount(activeAccountId, appId),
    ]);

    if (!application) return null;

    const configuredAccess = normalizeAccess(application.responseFields).filter((field) => responseAccessSet.has(field));
    const policies = normalizePolicies(application.policies);
    const endpoints = normalizeEndpoints(application.endpoints);

    const accessedData = Array.from(
      new Set(
        appSessions.map((row) => row.roleId)
      )
    );

    return {
      id: application.id,
      name: application.name,
      description: application.description || undefined,
      icon: application.icon || undefined,
      configuredAccess,
      accessedData,
      hasUsedApp: appSessions.length > 0,
      policies,
      endpoints,
      canDelete,
    };
  } catch (error) {
    await logError('database', error, `getApplicationDetailsForViewer:${appId}`);
    return null;
  }
}


/**
 * Function deleteManagedApplication.
 */
export async function deleteManagedApplication(appId: string): Promise<{ success: boolean; error?: string }> {
  const activeAccountId = await getActiveAccountId();
  if (!activeAccountId) {
    return { success: false, error: 'Not signed in.' };
  }

  try {
    const canDelete = await isApplicationOwnerForAccount(activeAccountId, appId);
    if (!canDelete) {
      return { success: false, error: 'Only the application owner can delete this app.' };
    }

    await prisma.application.delete({
      where: { id: appId },
    });

    revalidatePath('/application');
    return { success: true };
  } catch (error) {
    await logError('database', error, `deleteManagedApplication:${appId}`);
    return { success: false, error: 'Failed to delete application.' };
  }
}


/**
 * Function createManagedApplication.
 */
export async function createManagedApplication(input: { name: string }) {
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application name.' };
  }

  const canCreateApplication = await checkPermissions(['root.application.create']);
  if (!canCreateApplication) {
    return { success: false, error: 'Permission denied.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  try {
    const application = await prisma.$transaction(async (tx) => {
      // Ensure the application.owner role and its permissions exist before creating grants.
      // This makes createManagedApplication self-contained regardless of seed state.
      const permissions = [
        { id: 'cap-appowner-application-view',   name: 'application.view',   description: 'View application details and settings.' },
        { id: 'cap-appowner-application-edit',   name: 'application.edit',   description: 'Edit application details, secrets, access fields, policies, and endpoints.' },
        { id: 'cap-appowner-application-delete', name: 'application.delete', description: 'Delete or deactivate an application.' },
      ];
      for (const cap of permissions) {
        await tx.authzPermission.upsert({
          where: { id: cap.id },
          update: { name: cap.name, description: cap.description, appId: 'neup.account', scope: 'application' },
          create: { id: cap.id, name: cap.name, description: cap.description, appId: 'neup.account', scope: 'application' },
        });
      }
      await tx.authzRole.upsert({
        where: { id: 'application.owner' },
        update: { name: 'application.owner', description: 'Full ownership of an application.', appId: 'neup.account', scope: 'application' },
        create: { id: 'application.owner', name: 'application.owner', description: 'Full ownership of an application.', appId: 'neup.account', scope: 'application' },
      });
      await tx.authzRole.update({
        where: { id: 'application.owner' },
        data: {
          permissions: permissions.map((cap) => ({ id: cap.id, name: cap.name })),
        },
      });
      const createdApp = await tx.application.create({
        data: {
          id: randomUUID(),
          name: parsed.data.name,
          status: 'development',
        },
        select: {
          id: true,
          name: true,
        },
      });

      // Grant the creator ownership directly — no portfolio needed for applications.
      const existingGrant = await tx.member.findFirst({
        where: {
          accessTo: accountId,
          memberId: accountId,
          roleId: 'application.owner',
          accessFor: 'application',
          parentApplicationId: createdApp.id,
        },
      });

      if (!existingGrant) {
        await tx.member.create({
          data: {
            accessTo: accountId,
            memberId: accountId,
            accessFor: 'application',
            roleId: 'application.owner',
            parentApplicationId: createdApp.id,
          },
        });
      }

      return { id: createdApp.id };
    });

    revalidatePath('/application');
    return { success: true, appId: application.id };
  } catch (error) {
    await logError('database', error, 'createManagedApplication');
    return { success: false, error: 'Failed to create application.' };
  }
}


/**
 * Function getManagedApplications.
 */
export async function getManagedApplications(): Promise<Array<{ id: string; name: string; slug?: string; icon?: string; createdAt: Date; hasSecretKey: boolean; status?: string }>> {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return [];
  }

  try {
    const ownedRows = await prisma.member.findMany({
      where: { accessTo: accountId, roleId: 'application.owner', accessFor: 'application' },
      orderBy: { id: 'desc' },
      select: {
        parentApplication: {
          select: {
            id: true,
            name: true,
            icon: true,
            createdAt: true,
            appSecret: true,
            status: true,
          },
        },
      },
    });

    const ownedApplications = ownedRows
      .map((r) => r.parentApplication)
      .filter((app): app is NonNullable<typeof app> => Boolean(app));
    const ownedIds = new Set(ownedApplications.map((app) => app.id));

    const roleRows = await prisma.member.findMany({
      where: { memberId: accountId, accessFor: 'application' },
      select: { roleId: true, parentApplicationId: true },
    });

    const permittedViewAppIds = new Set<string>();
    for (const row of roleRows) {
      const normalizedRole = row.roleId.trim().toLowerCase();
      if (viewRoleKeys.has(normalizedRole) && row.parentApplicationId) {
        permittedViewAppIds.add(row.parentApplicationId);
      }
    }

    const permittedApplications = permittedViewAppIds.size
      ? await prisma.application.findMany({
          where: {
            id: { in: Array.from(permittedViewAppIds) },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            icon: true,
            createdAt: true,
            appSecret: true,
            status: true,
          },
        })
      : [];

    const applications = [
      ...ownedApplications,
      ...permittedApplications.filter((app) => !ownedIds.has(app.id)),
    ];

    return applications.map((application) => ({
      id: application.id,
      name: application.name,
      icon: application.icon || undefined,
      createdAt: application.createdAt,
      hasSecretKey: Boolean(application.appSecret),
      status: application.status || undefined,
    }));
  } catch (error) {
    await logError('database', error, 'getManagedApplications');
    return [];
  }
}


/**
 * Function getManagedApplication.
 */
export async function getManagedApplication(appId: string): Promise<ManagedApplication | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return null;
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, appId);
    if (!authorization.exists || !authorization.canView) {
      return null;
    }

    const [application, authzWebhookRecord] = await Promise.all([
      prisma.application.findFirst({
        where: { id: appId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          appSecret: true,
          responseFields: true,
          details: true,
          policies: true,
          endpoints: true,
        },
      }),
      prisma.applicationBridge.findFirst({
        where: { appId, type: 'authzWebhook' },
        select: { value: true },
      }),
    ]);

    if (!application) {
      return null;
    }

    return {
      id: application.id,
      name: application.name,
      createdAt: application.createdAt,
      hasSecretKey: Boolean(application.appSecret),
      access: normalizeAccess(
        application.responseFields.length > 0
          ? application.responseFields
          : (application as any).details?.access ?? [],
      ).filter((field) => responseAccessSet.has(field)),
      policies: normalizePolicies(application.policies),
      endpoints: normalizeEndpoints(application.endpoints),
      authzWebhookUrl: authzWebhookRecord?.value ?? null,
    };
  } catch (error) {
    await logError('database', error, `getManagedApplication:${appId}`);
    return null;
  }
}


/**
 * Function saveApplicationSecret.
 */
export async function saveApplicationSecret(input: { appId: string; secretKey: string }) {
  const parsed = saveSecretSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid secret key.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }
    if (!authorization.canEdit) {
      return { success: false, error: 'Permission denied.' };
    }

    const result = await prisma.application.updateMany({
      where: {
        id: parsed.data.appId,
      },
      data: {
        appSecret: parsed.data.secretKey,
      },
    });

    if (result.count === 0) {
      return { success: false, error: 'Application not found.' };
    }

    revalidatePath('/application');
    revalidatePath(`/application/${parsed.data.appId}`);

    return { success: true };
  } catch (error) {
    await logError('database', error, `saveApplicationSecret:${parsed.data.appId}`);
    return { success: false, error: 'Failed to save secret key.' };
  }
}


/**
 * Function saveApplicationAccess.
 */
export async function saveApplicationAccess(input: { appId: string; access: ApplicationAccessField[] }) {
  const parsed = saveAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid access list.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }
    if (!authorization.canEdit) {
      return { success: false, error: 'Permission denied.' };
    }

    const sanitizedAccess = parsed.data.access.filter((field) => responseAccessSet.has(field));

    const existing = await prisma.application.findUnique({
      where: { id: parsed.data.appId },
      select: { details: true },
    });

    const existingDetails =
      existing?.details && typeof existing.details === 'object'
        ? (existing.details as Record<string, unknown>)
        : {};

    const result = await prisma.application.updateMany({
      where: { id: parsed.data.appId },
      data: { responseFields: sanitizedAccess, details: { ...existingDetails, access: sanitizedAccess } },
    });

    if (result.count === 0) {
      return { success: false, error: 'Application not found.' };
    }

    revalidatePath('/application');
    revalidatePath(`/application/${parsed.data.appId}`);

    return { success: true };
  } catch (error) {
    await logError('database', error, `saveApplicationAccess:${parsed.data.appId}`);
    return { success: false, error: 'Failed to save access list.' };
  }
}


/**
 * Function saveApplicationPolicies.
 */
export async function saveApplicationPolicies(input: { appId: string; policies: ApplicationPolicyEntry[] }) {
  const parsed = savePoliciesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid policies.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }
    if (!authorization.canEdit) {
      return { success: false, error: 'Permission denied.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.applicationPolicy.deleteMany({ where: { appId: parsed.data.appId } });
      if (parsed.data.policies.length > 0) {
        await tx.applicationPolicy.createMany({
          data: parsed.data.policies.map((p) => ({
            appId: parsed.data.appId,
            policyType: p.name,
            policyValue: p.policy,
          })),
        });
      }
    });

    revalidatePath('/application');
    revalidatePath(`/application/${parsed.data.appId}`);

    return { success: true };
  } catch (error) {
    await logError('database', error, `saveApplicationPolicies:${parsed.data.appId}`);
    return { success: false, error: 'Failed to save policies.' };
  }
}


/**
 * Function saveApplicationEndpoints.
 */
export async function saveApplicationEndpoints(input: { appId: string } & ApplicationEndpointConfig) {
  const parsed = saveEndpointsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid endpoint information.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }
    if (!authorization.canEdit) {
      return { success: false, error: 'Permission denied.' };
    }

    const result = await prisma.application.updateMany({
      where: {
        id: parsed.data.appId,
      },
      data: {
        endpoints: {
          dataDeletionApi: normalizeText(parsed.data.dataDeletionApi),
          dataDeletionPage: normalizeText(parsed.data.dataDeletionPage),
          accountBlock: normalizeText(parsed.data.accountBlock),
          accountBlockApi: normalizeText(parsed.data.accountBlockApi),
          logoutPage: normalizeText(parsed.data.logoutPage),
          logoutApi: normalizeText(parsed.data.logoutApi),
        },
      },
    });

    if (result.count === 0) {
      return { success: false, error: 'Application not found.' };
    }

    revalidatePath('/application');
    revalidatePath(`/application/${parsed.data.appId}`);

    return { success: true };
  } catch (error) {
    await logError('database', error, `saveApplicationEndpoints:${parsed.data.appId}`);
    return { success: false, error: 'Failed to save endpoint information.' };
  }
}


/**
 * Function updateManagedApplicationStatus.
 */
export async function updateManagedApplicationStatus(input: { appId: string; status: 'development' | 'active' | 'rejected' | 'blocked' }) {
  const parsed = updateApplicationStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application status.' };
  }

  const isRootAppManager = await checkPermissions(['root.application.view']);
  const isBrandManager = await checkPermissions(['linked_accounts.brand.manager']);
  if (!isRootAppManager && !isBrandManager) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    const result = await prisma.application.updateMany({
      where: {
        id: parsed.data.appId,
      },
      data: {
        status: parsed.data.status,
      },
    });

    if (result.count === 0) {
      return { success: false, error: 'Application not found.' };
    }

    revalidatePath('/manage/applications');
    revalidatePath('/application');
    revalidatePath(`/application/${parsed.data.appId}`);

    return { success: true };
  } catch (error) {
    await logError('database', error, `updateManagedApplicationStatus:${parsed.data.appId}`);
    return { success: false, error: 'Failed to update application status.' };
  }
}

// Returns all applications, optionally filtered by a search query.
export async function getApps(searchQuery?: string): Promise<Application[]> {
    try {
        const apps = await prisma.application.findMany({
            where: searchQuery ? {
                OR: [
                    { name: { contains: searchQuery, mode: 'insensitive' } },
                    { id: { contains: searchQuery, mode: 'insensitive' } },
                    { description: { contains: searchQuery, mode: 'insensitive' } },
                ],
            } : {},
            orderBy: { createdAt: 'desc' }
        });

        return apps.map(app => {
            const { appSecret, ...data } = app;
            return { ...data } as unknown as Application;
        });
    } catch (error) {
        await logError('database', error, 'getApps');
        return [];
    }
}

// Returns a single application by ID, stripping the secret key.
export async function getAppDetails(appId: string): Promise<Application | null> {
    try {
        const app = await prisma.application.findUnique({ where: { id: appId } });
        if (app) {
            const { appSecret, ...data } = app;
            return { ...data } as unknown as Application;
        }
        return null;
    } catch (error) {
        await logError('database', error, `getApplicationDetails: ${appId}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Silent SSO Origins
// ---------------------------------------------------------------------------

/**
 * Returns all registered silentSsoOrigin entries for an application.
 */
export async function getSilentSsoOrigins(
  appId: string
): Promise<Array<{ id: string; value: string }>> {
  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  try {
    const authorization = await getApplicationAuthorization(accountId, appId);
    if (!authorization.exists || !authorization.canView) return [];

    const records = await prisma.applicationBridge.findMany({
      where: { appId, type: 'silentSsoOrigin' },
      select: { id: true, value: true },
      orderBy: { createdAt: 'asc' },
    });

    return records;
  } catch (error) {
    await logError('database', error, `getSilentSsoOrigins:${appId}`);
    return [];
  }
}

/**
 * Adds a new silentSsoOrigin entry for an application.
 * The origin must be a valid HTTPS URL.
 */
export async function addSilentSsoOrigin(input: {
  appId: string;
  origin: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  // Validate origin is a valid HTTPS URL
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(input.origin);
  } catch {
    return { success: false, error: 'Invalid URL.' };
  }

  if (parsedOrigin.protocol !== 'https:') {
    return { success: false, error: 'Origin must use HTTPS.' };
  }

  // Normalize to scheme + host only
  const normalizedOrigin = parsedOrigin.origin;

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };
    if (!authorization.canEdit) return { success: false, error: 'Permission denied.' };

    // Prevent duplicates
    const existing = await prisma.applicationBridge.findFirst({
      where: { appId: input.appId, type: 'silentSsoOrigin', value: normalizedOrigin },
    });
    if (existing) return { success: false, error: 'This origin is already registered.' };

    await prisma.applicationBridge.create({
      data: {
        appId: input.appId,
        type: 'silentSsoOrigin',
        value: normalizedOrigin,
      },
    });

    revalidatePath(`/application/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `addSilentSsoOrigin:${input.appId}`);
    return { success: false, error: 'Failed to add origin.' };
  }
}

/**
 * Removes a silentSsoOrigin entry for an application.
 */
export async function removeSilentSsoOrigin(input: {
  appId: string;
  bridgeId: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };
    if (!authorization.canEdit) return { success: false, error: 'Permission denied.' };

    await prisma.applicationBridge.deleteMany({
      where: { id: input.bridgeId, appId: input.appId, type: 'silentSsoOrigin' },
    });

    revalidatePath(`/application/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `removeSilentSsoOrigin:${input.appId}`);
    return { success: false, error: 'Failed to remove origin.' };
  }
}


/**
 * Function getApplicationDetailsForViewerV2.
 *
 * Role-aware detail loader. Root users (root.application.view) can view any application.
 * Regular users can view apps they have an member for OR an
 * ApplicationConnection to. appSecret is never returned.
 */
export async function getApplicationDetailsForViewerV2(appId: string): Promise<ApplicationDetailsV2 | null> {
  const activeAccountId = await getActiveAccountId();
  if (!activeAccountId) return null;

  const personalAccountId = await getPersonalAccountId();

  try {
    const isRootViewer = await checkPermissions(['root.application.view']);

    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        website: true,
        status: true,
        isInternal: true,
        responseFields: true,
        policies: true,
        endpoints: true,
      },
    });

    if (!application) return null;

    // Non-root users must have explicit access
    if (!isRootViewer) {
      const access = await resolveApplicationAccessForAccount(activeAccountId, appId);
      // Also allow if they have an ApplicationConnection
      const connection = personalAccountId
        ? await prisma.connection.findUnique({
            where: { accountId_appId: { accountId: personalAccountId, appId } },
            select: { accountId: true },
          })
        : null;
      if (!access.canView && !connection) return null;
    }

    // Fetch connection info for the personal account
    const connectionRow = personalAccountId
      ? await prisma.connection.findUnique({
          where: { accountId_appId: { accountId: personalAccountId, appId } },
          select: { connectedAt: true },
        })
      : null;

    const [canDelete, accessForAccount] = await Promise.all([
      isApplicationOwnerForAccount(activeAccountId, appId),
      resolveApplicationAccessForAccount(activeAccountId, appId),
    ]);

    // Resolve accessed data from authz grants (same as original)
    const appSessions = personalAccountId
      ? await prisma.member.findMany({
          where: { memberId: personalAccountId, parentApplicationId: appId },
          select: { roleId: true },
        })
      : [];

    const configuredAccess = normalizeAccess(application.responseFields).filter((field) => responseAccessSet.has(field));
    const policies = normalizePolicies(application.policies);
    const endpoints = normalizeEndpoints(application.endpoints);
    const accessedData = Array.from(new Set(appSessions.map((row) => row.roleId)));

    return {
      id: application.id,
      name: application.name,
      description: application.description || undefined,
      icon: application.icon || undefined,
      website: application.website || undefined,
      status: application.status || undefined,
      isInternal: application.isInternal,
      connectedAt: connectionRow?.connectedAt?.toISOString() ?? undefined,
      configuredAccess,
      accessedData,
      hasUsedApp: appSessions.length > 0,
      policies,
      endpoints,
      canEdit: accessForAccount.canEdit,
      isRootViewer,
      canDelete,
    };
  } catch (error) {
    await logError('database', error, `getApplicationDetailsForViewerV2:${appId}`);
    return null;
  }
}


// ---------------------------------------------------------------------------
// Meta update (owner — name, description, icon, website only, no status)
// ---------------------------------------------------------------------------

const updateAppMetaSchema = z.object({
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
});

/**
 * Function updateAppMeta.
 *
 * Allows the application owner to update name, description, icon, and website.
 * Does NOT touch status — that goes through the publication request flow.
 */
export async function updateAppMeta(
  input: z.infer<typeof updateAppMetaSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const parsed = updateAppMetaSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = messages?.[0] ?? 'Invalid value.';
    }
    return { success: false, fieldErrors };
  }

  const { appId, name, description, icon, website } = parsed.data;

  const canEdit = await isApplicationOwnerForAccount(accountId, appId);
  if (!canEdit) return { success: false, error: 'Only the application owner can edit metadata.' };

  try {
    await prisma.application.update({
      where: { id: appId },
      data: {
        name,
        description: description || null,
        icon: icon || null,
        website: website || null,
      },
    });
    revalidatePath('/application');
    revalidatePath(`/application/${appId}`);
    revalidatePath(`/application/${appId}/meta`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updateAppMeta:${appId}`);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Publication request + status log
// ---------------------------------------------------------------------------

export type AppStatusLogEntry = {
  id: string;
  action: string;
  status: string;
  timestamp: string;
  actor: string;
};

/**
 * Function getAppStatusLog.
 *
 * Returns activity log entries for this application scoped to status changes
 * and publication events. Accessible to the app owner and root viewers.
 */
export async function getAppStatusLog(appId: string): Promise<AppStatusLogEntry[]> {
  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  const isRootViewer = await checkPermissions(['root.application.view']);
  const isOwner = await isApplicationOwnerForAccount(accountId, appId);
  if (!isRootViewer && !isOwner) return [];

  try {
    const rows = await prisma.activity.findMany({
      where: {
        memberId: appId,
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      status: row.status,
      timestamp: new Date(row.timestamp).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      actor: row.actorAccountId,
    }));
  } catch (error) {
    await logError('database', error, `getAppStatusLog:${appId}`);
    return [];
  }
}

/**
 * Function requestAppPublication.
 *
 * Owner submits a request to publish the application (move from development → pending review).
 * Creates an activity log entry and sets a bridge record to track the pending request.
 * Actual approval/rejection is done by a root user via updateManagedApplicationStatus.
 */
export async function requestAppPublication(
  appId: string,
): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const isOwner = await isApplicationOwnerForAccount(accountId, appId);
  if (!isOwner) return { success: false, error: 'Only the application owner can request publication.' };

  try {
    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: { status: true },
    });

    if (!app) return { success: false, error: 'Application not found.' };
    if (app.status === 'active') return { success: false, error: 'Application is already active.' };
    if (app.status === 'blocked') return { success: false, error: 'Blocked applications cannot request publication.' };

    // Check if a pending request already exists
    const existing = await prisma.applicationBridge.findFirst({
      where: { appId, type: 'publicationRequest', value: 'pending' },
    });
    if (existing) return { success: false, error: 'A publication request is already pending.' };

    await prisma.$transaction(async (tx) => {
      // Mark the request as pending in the bridge table
      await tx.applicationBridge.create({
        data: { appId, type: 'publicationRequest', value: 'pending' },
      });

      // Log the event against the app ID as the target
      await tx.activity.create({
        data: {
          memberId: appId,
          actorAccountId: accountId,
          action: 'Publication requested by owner.',
          status: 'Pending',
          ip: 'system',
          timestamp: new Date(),
        },
      });
    });

    revalidatePath(`/application/${appId}/status`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `requestAppPublication:${appId}`);
    return { success: false, error: 'Failed to submit publication request.' };
  }
}

/**
 * Function getAppPublicationRequestStatus.
 *
 * Returns whether a pending publication request exists for this app.
 */
export async function getAppPublicationRequestStatus(
  appId: string,
): Promise<'none' | 'pending'> {
  try {
    const record = await prisma.applicationBridge.findFirst({
      where: { appId, type: 'publicationRequest', value: 'pending' },
      select: { id: true },
    });
    return record ? 'pending' : 'none';
  } catch {
    return 'none';
  }
}

// ---------------------------------------------------------------------------
// Ownership data
// ---------------------------------------------------------------------------

export type AppOwnerEntry = {
  accountId: string;
  displayName: string;
  accountType: string;
  neupId?: string;
  isVerified: boolean;
};

export type AppAccessEntry = {
  accountId: string;
  displayName: string;
  accountType: string;
  neupId?: string;
  isVerified: boolean;
  roles: string[];
  /** null = direct grant; string = portfolio name the grant came through */
  via: null | string;
};

export type AppPortfolioEntry = {
  parentPortfolioId: string;
  portfolioName: string;
};

export type AppOwnershipData = {
  owners: AppOwnerEntry[];
  accessGrants: AppAccessEntry[];
  portfolios: AppPortfolioEntry[];
};

/**
 * Function getAppOwnershipData.
 *
 * Returns the owner(s), all accounts with access grants, and any portfolios
 * this application belongs to. Accessible to the app owner and root viewers.
 */
export async function getAppOwnershipData(appId: string): Promise<AppOwnershipData | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const isRootViewer = await checkPermissions(['root.application.view']);
  const isOwner = await isApplicationOwnerForAccount(accountId, appId);
  if (!isRootViewer && !isOwner) return null;

  try {
    // All access grants for this app
    const grants = await prisma.member.findMany({
      where: { parentApplicationId: appId },
      select: {
        memberId: true,
        roleId: true,
        parentPortfolioId: true,
        parentPortfolio: { select: { id: true, name: true } },
        accessAccount: {
          select: {
            id: true,
            displayName: true,
            accountType: true,
            isVerified: true,
            neupIds: { where: { isPrimary: true }, select: { neupId: true }, take: 1 },
            individualProfile: { select: { firstName: true, lastName: true } },
            brandProfile: { select: { brandName: true } },
          },
        },
      },
    });

    // Portfolios this app belongs to (via AuthzAppAccessGrant)
    const appPortfolioGrants = await prisma.member.findMany({
      where: { parentApplicationId: appId, parentPortfolioId: { not: null } },
      select: {
        parentPortfolioId: true,
        parentPortfolio: { select: { id: true, name: true } },
      },
      distinct: ['parentPortfolioId'],
    });

    // Also check AuthzAccountAccessGrant portfolios
    const portfolioIds = new Set<string>();
    const portfolioMap = new Map<string, string>();

    for (const g of grants) {
      if (g.parentPortfolioId && g.parentPortfolio) {
        portfolioIds.add(g.parentPortfolioId);
        portfolioMap.set(g.parentPortfolioId, g.parentPortfolio.name);
      }
    }
    for (const g of appPortfolioGrants) {
      if (g.parentPortfolioId && g.parentPortfolio) {
        portfolioIds.add(g.parentPortfolioId);
        portfolioMap.set(g.parentPortfolioId, g.parentPortfolio.name);
      }
    }

    const portfolios: AppPortfolioEntry[] = Array.from(portfolioIds).map((id) => ({
      parentPortfolioId: id,
      portfolioName: portfolioMap.get(id) ?? id,
    }));

    // Helper to resolve a display name from the included account data
    function resolveDisplayName(target: {
      displayName: string | null;
      individualProfile: { firstName: string | null; lastName: string | null } | null;
      brandProfile: { brandName: string | null } | null;
    }): string {
      if (target.brandProfile?.brandName) return target.brandProfile.brandName;
      if (target.displayName) return target.displayName;
      const first = target.individualProfile?.firstName ?? '';
      const last = target.individualProfile?.lastName ?? '';
      const full = `${first} ${last}`.trim();
      return full || 'Unknown';
    }

    // Separate owners from other grantees; group roles per account
    const ownerMap = new Map<string, AppOwnerEntry>();
    const accessMap = new Map<string, AppAccessEntry>();

    for (const g of grants) {
      const t = g.accessAccount;
      if (!t) continue;
      const displayName = resolveDisplayName(t);
      const neupId = t.neupIds[0]?.neupId;
      const isOwnerRole = ownerRoleKeys.has(g.roleId.trim().toLowerCase());

      if (isOwnerRole) {
        if (!ownerMap.has(t.id)) {
          ownerMap.set(t.id, {
            accountId: t.id,
            displayName,
            accountType: t.accountType,
            neupId,
            isVerified: t.isVerified,
          });
        }
      } else {
        if (!accessMap.has(t.id)) {
          accessMap.set(t.id, {
            accountId: t.id,
            displayName,
            accountType: t.accountType,
            neupId,
            isVerified: t.isVerified,
            roles: [],
            via: g.parentPortfolioId && g.parentPortfolio ? g.parentPortfolio.name : null,
          });
        }
        const entry = accessMap.get(t.id)!;
        if (!entry.roles.includes(g.roleId)) {
          entry.roles.push(g.roleId);
        }
        // If any grant for this account came via a portfolio, mark it
        if (g.parentPortfolioId && g.parentPortfolio && entry.via === null) {
          entry.via = g.parentPortfolio.name;
        }
      }
    }

    return {
      owners: Array.from(ownerMap.values()),
      accessGrants: Array.from(accessMap.values()),
      portfolios,
    };
  } catch (error) {
    await logError('database', error, `getAppOwnershipData:${appId}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// User stats
// ---------------------------------------------------------------------------

export type ApplicationUserStats = {
  total: number;
  last24h: number;
  lastWeek: number;
  lastMonth: number;
};

/**
 * Returns user counts for an application based on ApplicationConnection records.
 * Accessible to any authenticated user who can view the application.
 */
export async function getApplicationUserStats(appId: string): Promise<ApplicationUserStats | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  // Verify the app exists and the caller has at least view access
  const authorization = await getApplicationAuthorization(accountId, appId);
  if (!authorization.exists || !authorization.canView) return null;

  try {
    const now = new Date();
    const minus24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const minus7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const minus30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, last24h, lastWeek, lastMonth] = await Promise.all([
      prisma.connection.count({ where: { appId } }),
      prisma.connection.count({ where: { appId, connectedAt: { gte: minus24h } } }),
      prisma.connection.count({ where: { appId, connectedAt: { gte: minus7d } } }),
      prisma.connection.count({ where: { appId, connectedAt: { gte: minus30d } } }),
    ]);

    return { total, last24h, lastWeek, lastMonth };
  } catch (error) {
    await logError('database', error, `getApplicationUserStats:${appId}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Application users (paginated)
// ---------------------------------------------------------------------------

export type AppUserStatus = 'active' | 'creationRequired' | 'deactivated';
export type AppUserSortKey = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

export type AppUserEntry = {
  accountId: string;
  displayName: string | null;
  displayImage: string | null;
  accountType: string;
  isVerified: boolean;
  connectedAt: Date;
  status: string | null;
};

export type AppUsersPage = {
  users: AppUserEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Returns a paginated list of accounts connected to an application.
 * Supports filtering by status and connectedAt window, plus sorting.
 * Accessible to the app owner and root viewers.
 */
export async function getApplicationUsersPaginated(params: {
  appId: string;
  page: number;
  pageSize?: number;
  search?: string;
  status?: AppUserStatus;
  activeSince?: '1d' | '7d' | '30d';
  sort?: AppUserSortKey;
}): Promise<AppUsersPage> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { users: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  const isRootViewer = await checkPermissions(['root.application.view']);
  const isOwner = await isApplicationOwnerForAccount(accountId, params.appId);
  if (!isRootViewer && !isOwner) return { users: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  const { appId, page, pageSize = 20, search = '', status, activeSince, sort = 'newest' } = params;

  try {
    const now = new Date();
    const sinceMap: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30 };
    const sinceDate = activeSince
      ? new Date(now.getTime() - sinceMap[activeSince] * 24 * 60 * 60 * 1000)
      : undefined;

    // Map AppUserStatus to account status values
    const statusMap: Record<AppUserStatus, string | null> = {
      active: 'active',
      deactivated: 'deactivated',
      creationRequired: null, // accounts with no status set
    };

    const connectionWhere: Record<string, unknown> = { appId };
    if (sinceDate) connectionWhere.connectedAt = { gte: sinceDate };

    // Fetch connections with joined account data
    const orderByMap: Record<AppUserSortKey, object> = {
      newest:    { connectedAt: 'desc' },
      oldest:    { connectedAt: 'asc' },
      name_asc:  { account: { displayName: 'asc' } },
      name_desc: { account: { displayName: 'desc' } },
    };

    const accountWhere: Record<string, unknown> = {};
    if (status === 'creationRequired') {
      accountWhere.status = null;
    } else if (status) {
      accountWhere.status = statusMap[status];
    }
    if (search) {
      accountWhere.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { neupIds: { some: { neupId: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    if (Object.keys(accountWhere).length > 0) {
      connectionWhere.account = accountWhere;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereArg = connectionWhere as any;

    const [total, rows] = await Promise.all([
      prisma.connection.count({ where: whereArg }),
      prisma.connection.findMany({
        where: whereArg,
        orderBy: orderByMap[sort],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          connectedAt: true,
          account: {
            select: {
              id: true,
              displayName: true,
              displayImage: true,
              accountType: true,
              isVerified: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const users: AppUserEntry[] = rows.map((r) => ({
      accountId: r.account.id,
      displayName: r.account.displayName,
      displayImage: r.account.displayImage,
      accountType: r.account.accountType,
      isVerified: r.account.isVerified,
      connectedAt: r.connectedAt,
      status: r.account.status,
    }));

    return {
      users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    await logError('database', error, `getApplicationUsersPaginated:${appId}`);
    return { users: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  }
}

// ---------------------------------------------------------------------------
// Owner edit — name, description, icon, website, status
// ---------------------------------------------------------------------------

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

  const canEdit = await isApplicationOwnerForAccount(accountId, appId);
  if (!canEdit) return { success: false, error: 'Only the application owner can edit this application.' };

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
    revalidatePath('/application');
    revalidatePath(`/application/${appId}`);
    revalidatePath(`/application/${appId}/edit`);
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
  tokenFields: z.array(z.enum(applicationTokenFields)).default([]),
  allowDevMode: z.boolean().optional().default(false),
});

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

  const { appId, secretKey, access, tokenFields, allowDevMode } = parsed.data;
  const sanitizedAccess = access.filter((field) => responseAccessSet.has(field));
  const sanitizedTokenFields = tokenFields.filter((field) => tokenFieldSet.has(field));

  const canEdit = await isApplicationOwnerForAccount(accountId, appId);
  if (!canEdit) return { success: false, error: 'Only the application owner can configure this application.' };

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
      tokenFields: sanitizedTokenFields,
      // Backward-compat: keep legacy JSON in sync until all callers are migrated.
      details: { ...existingDetails, access: sanitizedAccess, token_fields: sanitizedTokenFields, allowDevMode },
    };
    if (secretKey && secretKey.trim().length >= 16) {
      updateData.appSecret = secretKey.trim();
    }

    await prisma.application.update({
      where: { id: appId },
      data: updateData,
    });

    revalidatePath('/application');
    revalidatePath(`/application/${appId}`);
    revalidatePath(`/application/${appId}/config`);
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
export async function getAppConfigData(appId: string): Promise<{
  hasSecretKey: boolean;
  access: ApplicationAccessField[];
  tokenFields: ApplicationAccessField[];
  silentSsoOrigins: Array<{ id: string; value: string }>;
  allowDevMode: boolean;
  status: string;
} | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const canEdit = await isApplicationOwnerForAccount(accountId, appId);
  if (!canEdit) return null;

  try {
    const [app, origins] = await Promise.all([
      prisma.application.findUnique({
        where: { id: appId },
        select: { appSecret: true, responseFields: true, tokenFields: true, details: true, status: true },
      }),
      prisma.applicationBridge.findMany({
        where: { appId, type: 'silentSsoOrigin' },
        select: { id: true, value: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!app) return null;

    const legacyDetails = app.details && typeof app.details === 'object'
      ? (app.details as Record<string, unknown>)
      : {};

    const responseFieldSource =
      app.responseFields.length > 0 ? app.responseFields : (legacyDetails as any).access ?? [];
    const tokenFieldSource =
      app.tokenFields.length > 0 ? app.tokenFields : (legacyDetails as any).token_fields ?? [];
    const allowDevMode = Boolean((legacyDetails as any).allowDevMode);

    return {
      hasSecretKey: Boolean(app.appSecret),
      access: normalizeAccess(responseFieldSource).filter((field) => responseAccessSet.has(field)),
      tokenFields: normalizeAccess(tokenFieldSource).filter((field) => tokenFieldSet.has(field)),
      silentSsoOrigins: origins,
      allowDevMode,
      status: app.status ?? 'development',
    };
  } catch (error) {
    await logError('database', error, `getAppConfigData:${appId}`);
    return null;
  }
}
