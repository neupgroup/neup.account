export const NEUP_ACCOUNT_APP_ID = 'neup.account';

export const PERMISSION_ACQUISITION_TYPES = [
  'assignment',
  'public_request',
  'invitation',
  'system_generated',
] as const;

export const PERMISSION_APPROVAL_POLICIES = [
  'none',
  'approval_required',
] as const;

export type PermissionAudience = 'self' | 'managed' | 'root';
export type PermissionAcquisitionType = (typeof PERMISSION_ACQUISITION_TYPES)[number];
export type PermissionApprovalPolicy = (typeof PERMISSION_APPROVAL_POLICIES)[number];

type LegacyPermissionAudienceConfig = {
  audiences: PermissionAudience[];
};

export type NeupAccountPermissionDefinition = {
  legacyName: string;
  name: string;
  audience: PermissionAudience;
  description: string;
  scope: string[];
  acquisitionType: PermissionAcquisitionType;
  approvalPolicy: PermissionApprovalPolicy;
  assignable: boolean;
  publiclyEnrollable: boolean;
  selfAssigned: boolean;
  rootManaged: boolean;
  publiclyRequestable: boolean;
  requestableToOwner: boolean;
};

const DEFAULT_LEGACY_PERMISSIONS = [
  'profile.display.name',
  'profile.display.update',
  'profile.display.view',
  'profile.display.view.root',
  'profile.display.update.root',
  'profile.legal.view',
  'profile.legal.update',
  'profile.demographics.view',
  'profile.demographics.update',
  'profile.neupid.view',
  'profile.neupid.update',
  'profile.neupid.request',
  'profile.neupid.remove',
  'profile.contact.view',
  'profile.contact.update',
  'profile.kyc.view',
  'profile.kyc.update',
  'notification.read',
  'notification.delete',
  'security.pass.modify',
  'security.totp.add',
  'security.totp.remove',
  'security.backup_codes.view',
  'security.backup_codes.create',
  'security.recovery_accounts.view',
  'security.recovery_accounts.add',
  'security.recovery_accounts.remove',
  'security.recovery_phone.view',
  'security.recovery_phone.add',
  'security.recovery_phone.remove',
  'security.recovery_email.view',
  'security.recovery_email.add',
  'security.recovery_email.remove',
  'security.login_devices.view',
  'linked_accounts.brand.view',
  'data.agreed_terms.view',
  'data.delete_account.start',
  'data.deactivate_account.start',
  'data.materialization.view',
  'data.materialization.modify',
  'access.view',
  'access.team.view',
  'access.team.add',
  'access.team.remove',
  'access.connection.view',
  'access.connection.add',
  'access.connection.create.individual',
  'access.connection.create.brand',
  'access.connection.create.dependent',
  'access.connection.remove',
  'access.application.view',
  'access.application.add',
  'access.application.remove',
  'access.linked_account.view',
  'access.linked_account.add',
  'access.linked_account.remove',
  'access.linked_account.approve',
  'access.account.brand.create',
  'access.account.dependent.create',
  'access.account.dependent.unlink',
  'access.accounts.switch',
  'access.family.member.update',
  'access.family.partner.update',
  'access.invitations.view',
  'access.invitation.approve',
  'access.block.view',
  'access.block.update',
  'access.portfolio.create',
  'access.portfolio.update',
  'access.portfolio.delete',
  'security.recent_activities.view',
  'payment.method.show',
  'payment.transactions.show',
  'payment.subscriptions.show',
  'payment.purchase_neup_pro.view',
  'linked_accounts.brand.manage',
  'linked_accounts.brand.manager',
] as const;

const ROOT_LEGACY_PERMISSIONS = [
  'root.account.view',
  'root.account.modify',
  'root.account.delete',
  'root.account.search',
  'root.account.create_individual',
  'root.account.access.view',
  'root.account.access.edit',
  'access.view',
  'access.team.view',
  'access.team.add',
  'access.team.remove',
  'access.connection.view',
  'access.connection.add',
  'access.connection.create.individual',
  'access.connection.create.brand',
  'access.connection.create.dependent',
  'access.connection.remove',
  'access.application.view',
  'access.application.add',
  'access.application.remove',
  'access.linked_account.view',
  'access.linked_account.add',
  'access.linked_account.remove',
  'access.linked_account.approve',
  'access.account.brand.create',
  'access.account.dependent.create',
  'access.account.dependent.unlink',
  'access.accounts.switch',
  'access.family.member.update',
  'access.family.partner.update',
  'access.invitations.view',
  'access.invitation.approve',
  'access.block.view',
  'access.block.update',
  'access.portfolio.create',
  'access.portfolio.update',
  'access.portfolio.delete',
  'root.account.send_warning',
  'root.account.give_block_account',
  'root.account.remove_block_account',
  'root.account.impersonate',
  'root.account.edit_pro_status',
  'root.account.edit_neupid',
  'application.view',
  'application.edit',
  'application.delete',
  'application.logs.view',
  'application.devlogs.view',
  'application.roles.view',
  'application.roles.manage',
  'root.permission.view',
  'root.permission.edit',
  'root.requests.view',
  'root.requests.approve',
  'root.requests.deny',
  'root.dashboard.view',
  'root.payment_config.view',
  'root.errors.view',
  'root.site.social_accounts.read',
  'root.site.social_accounts.add',
  'root.site.social_accounts.edit',
  'root.site.social_accounts.delete',
  'root.display_images.view',
  'root.display_images.add',
  'root.display_images.update',
  'root.display_images.delete',
  'account.brand.delete',
  'account.brand.kyc.submit',
  'account.brand.kyc.view',
  'account.brand.members.manage',
] as const;

const SELF_MANAGED_ROOT_LEGACY_PERMISSION_SET = new Set<string>([
  'notification.read',
  'notification.delete',
  'access.view',
  'access.team.view',
  'access.team.add',
  'access.team.remove',
  'access.connection.view',
  'access.connection.add',
  'access.connection.create.individual',
  'access.connection.create.brand',
  'access.connection.create.dependent',
  'access.connection.remove',
  'access.application.view',
  'access.application.add',
  'access.application.remove',
  'access.linked_account.view',
  'access.linked_account.add',
  'access.linked_account.remove',
  'access.linked_account.approve',
  'access.account.brand.create',
  'access.account.dependent.create',
  'access.account.dependent.unlink',
  'access.accounts.switch',
  'access.invitations.view',
  'access.invitation.approve',
  'access.block.view',
  'access.block.update',
  'application.view',
  'application.edit',
  'application.delete',
  'application.logs.view',
  'application.devlogs.view',
  'application.roles.view',
  'application.roles.manage',
  'account.brand.members.manage',
  'account.brand.kyc.view',
  'account.brand.kyc.submit',
  'account.brand.delete',
]);

const SELF_ROOT_LEGACY_PERMISSION_SET = new Set<string>([
  'access.family.member.update',
  'access.family.partner.update',
  'access.portfolio.create',
  'access.portfolio.update',
  'access.portfolio.delete',
]);

const LEGACY_PERMISSION_AUDIENCE_OVERRIDES: Record<string, LegacyPermissionAudienceConfig> = {
  'profile.display.name': { audiences: ['self'] },
  'profile.display.view': { audiences: ['managed'] },
  'profile.display.view.root': { audiences: ['root'] },
  'profile.display.update': { audiences: ['self', 'managed'] },
  'profile.display.update.root': { audiences: ['root'] },
};

const LEGACY_PERMISSION_SET = new Set<string>([
  ...DEFAULT_LEGACY_PERMISSIONS,
  ...ROOT_LEGACY_PERMISSIONS,
]);

function humanizeSegment(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\bneupid\b/gi, 'NeupID')
    .replace(/\btotp\b/gi, 'TOTP')
    .replace(/\bkyc\b/gi, 'KYC')
    .replace(/\bacmgmt\b/gi, 'account management')
    .replace(/\bdevlogs\b/gi, 'developer logs')
    .replace(/\bpro\b/gi, 'Pro')
    .replace(/\bapi\b/gi, 'API');
}

function formatSubjectFromBase(baseName: string): string {
  const parts = baseName.split('.');
  const actionParts = new Set([
    'view',
    'update',
    'add',
    'remove',
    'create',
    'delete',
    'approve',
    'modify',
    'manage',
    'show',
    'read',
    'search',
    'edit',
    'start',
    'deny',
    'clear',
    'impersonate',
    'request',
  ]);
  const subjectParts = parts.filter((part) => !actionParts.has(part));
  if (subjectParts.length === 0) return 'this capability';
  return humanizeSegment(subjectParts.join(' '));
}

function formatActionFromBase(baseName: string): string {
  if (baseName.includes('.view')) return 'view';
  if (baseName.includes('.read')) return 'read';
  if (baseName.includes('.show')) return 'view';
  if (baseName.includes('.search')) return 'search';
  if (baseName.includes('.update')) return 'update';
  if (baseName.includes('.edit')) return 'edit';
  if (baseName.includes('.modify')) return 'modify';
  if (baseName.includes('.create')) return 'create';
  if (baseName.includes('.add')) return 'add';
  if (baseName.includes('.remove')) return 'remove';
  if (baseName.includes('.delete')) return 'delete';
  if (baseName.includes('.approve')) return 'approve';
  if (baseName.includes('.deny')) return 'deny';
  if (baseName.includes('.manage')) return 'manage';
  if (baseName.includes('.start')) return 'start';
  if (baseName.includes('.request')) return 'request';
  if (baseName.includes('.impersonate')) return 'impersonate';
  if (baseName.includes('.clear')) return 'clear';
  return 'use';
}

function audienceLead(audience: PermissionAudience): string {
  if (audience === 'self') return 'Allows the account holder to';
  if (audience === 'managed') return 'Allows a managing account to';
  return 'Allows a root manager to';
}

function audienceTail(audience: PermissionAudience): string {
  if (audience === 'self') return 'for their own account.';
  if (audience === 'managed') return 'for an account they manage.';
  return 'for any account in the system.';
}

function permissionDescription(name: string, audience: PermissionAudience): string {
  switch (name) {
    case 'profile.display.view.self':
      return 'Allows the account holder to view their own account display information.';
    case 'profile.display.view.managed':
      return 'Allows a managing account to view the display information of an account they manage.';
    case 'profile.display.view.root':
      return 'Allows a root manager to view the display information of any account in the system.';
    case 'profile.display.update.self':
      return 'Allows the account holder to update their own account display information.';
    case 'profile.display.update.managed':
      return 'Allows a managing account to update the display information of an account they manage.';
    case 'profile.display.update.root':
      return 'Allows a root manager to update the display information of any account in the system.';
    default: {
      const canonicalBase = stripPermissionAudience(name);
      return `${audienceLead(audience)} ${formatActionFromBase(canonicalBase)} ${formatSubjectFromBase(canonicalBase)} ${audienceTail(audience)}`;
    }
  }
}

function canonicalNameFromLegacy(legacyName: string, audience: PermissionAudience): string {
  if (legacyName === 'profile.display.name') return 'profile.display.view.self';
  if (legacyName === 'profile.display.view') return 'profile.display.view.managed';
  if (legacyName === 'profile.display.view.root') return 'profile.display.view.root';
  if (legacyName === 'profile.display.update') return `profile.display.update.${audience}`;
  if (legacyName === 'profile.display.update.root') return 'profile.display.update.root';
  if (legacyName.endsWith('.root')) return legacyName;
  return `${legacyName}.${audience}`;
}

function audiencesForLegacyPermission(legacyName: string): PermissionAudience[] {
  const override = LEGACY_PERMISSION_AUDIENCE_OVERRIDES[legacyName];
  if (override) return override.audiences;
  if (SELF_MANAGED_ROOT_LEGACY_PERMISSION_SET.has(legacyName)) return ['self', 'managed', 'root'];
  if (SELF_ROOT_LEGACY_PERMISSION_SET.has(legacyName)) return ['self', 'root'];
  if (ROOT_LEGACY_PERMISSIONS.includes(legacyName as (typeof ROOT_LEGACY_PERMISSIONS)[number])) return ['root'];
  return ['self'];
}

function scopeForAudience(audience: PermissionAudience): string[] {
  if (audience === 'managed') return ['managed.individual'];
  if (audience === 'root') return ['root.individual'];
  return ['public.individual'];
}

function permissionAccessForAudience(audience: PermissionAudience) {
  if (audience === 'root') {
    return {
      acquisitionType: 'invitation' as PermissionAcquisitionType,
      approvalPolicy: 'none' as PermissionApprovalPolicy,
      assignable: false,
      publiclyEnrollable: false,
      selfAssigned: false,
      rootManaged: true,
      publiclyRequestable: false,
      requestableToOwner: false,
    };
  }

  if (audience === 'managed') {
    return {
      acquisitionType: 'assignment' as PermissionAcquisitionType,
      approvalPolicy: 'none' as PermissionApprovalPolicy,
      assignable: true,
      publiclyEnrollable: false,
      selfAssigned: false,
      rootManaged: false,
      publiclyRequestable: false,
      requestableToOwner: false,
    };
  }

  return {
    acquisitionType: 'system_generated' as PermissionAcquisitionType,
    approvalPolicy: 'none' as PermissionApprovalPolicy,
    assignable: false,
    publiclyEnrollable: false,
    selfAssigned: true,
    rootManaged: false,
    publiclyRequestable: false,
    requestableToOwner: false,
  };
}

export function stripPermissionAudience(name: string): string {
  return name.replace(/\.(self|managed|root)$/u, '');
}

export function getCanonicalPermissionAudience(name: string): PermissionAudience | null {
  if (name.endsWith('.self')) return 'self';
  if (name.endsWith('.managed')) return 'managed';
  if (name.endsWith('.root')) return 'root';
  return null;
}

export const NEUP_ACCOUNT_PERMISSION_DEFINITIONS: NeupAccountPermissionDefinition[] = Array.from(
  new Map(
    Array.from(LEGACY_PERMISSION_SET)
      .flatMap((legacyName) =>
        audiencesForLegacyPermission(legacyName).map((audience) => {
          const name = canonicalNameFromLegacy(legacyName, audience);
          const access = permissionAccessForAudience(audience);
          const definition: NeupAccountPermissionDefinition = {
            legacyName,
            name,
            audience,
            description: permissionDescription(name, audience),
            scope: scopeForAudience(audience),
            acquisitionType: access.acquisitionType,
            approvalPolicy: access.approvalPolicy,
            assignable: access.assignable,
            publiclyEnrollable: access.publiclyEnrollable,
            selfAssigned: access.selfAssigned,
            rootManaged: access.rootManaged,
            publiclyRequestable: access.publiclyRequestable,
            requestableToOwner: access.requestableToOwner,
          };
          return [name, definition] as const;
        }),
      ),
  ).values(),
);

export const NEUP_ACCOUNT_DEFAULT_ROLE_PERMISSION_NAMES = NEUP_ACCOUNT_PERMISSION_DEFINITIONS
  .filter((permission) => permission.audience === 'self')
  .map((permission) => permission.name);

export const NEUP_ACCOUNT_ROOT_ROLE_PERMISSION_NAMES = NEUP_ACCOUNT_PERMISSION_DEFINITIONS
  .filter((permission) => permission.audience === 'root')
  .map((permission) => permission.name);

type PermissionResolutionContext = PermissionAudience | 'selfOrRoot';

function defaultAudienceCandidatesForLegacyPermission(
  legacyName: string,
  context: PermissionResolutionContext,
): PermissionAudience[] {
  if (context === 'selfOrRoot') {
    return ['self', 'root'];
  }

  if (context === 'root') {
    return ['root'];
  }

  if (context === 'managed') {
    return ['managed'];
  }

  return ['self'];
}

export function resolveNeupAccountPermissionCandidates(
  permissionName: string,
  context: PermissionResolutionContext,
): string[] {
  const trimmed = permissionName.trim();
  if (!trimmed) return [];

  const canonicalAudience = getCanonicalPermissionAudience(trimmed);
  if (canonicalAudience) {
    return [trimmed];
  }

  const candidates = new Set<string>([trimmed]);
  const preferredAudiences = defaultAudienceCandidatesForLegacyPermission(trimmed, context);

  if (LEGACY_PERMISSION_SET.has(trimmed)) {
    for (const audience of preferredAudiences) {
      const canonicalName = canonicalNameFromLegacy(trimmed, audience);
      candidates.add(canonicalName);
    }
  } else {
    for (const audience of preferredAudiences) {
      candidates.add(`${trimmed}.${audience}`);
    }
  }

  return Array.from(candidates);
}
