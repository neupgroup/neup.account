/**
 * _wholeRunner.ts
 *
 * Master seed runner — fully self-contained, no external files needed.
 *
 *   Step 1 — Insert application, roles, permissions, and role-permission maps
 *   Step 2 — Create the master account (interactive prompt) or use ACCOUNT_ID
 *   Step 3 — Assign neup.account roles to the master account
 *
 * Configuration — edit the constants below, then run:
 *   npx tsx --tsconfig tsconfig.json core/dbSeed/runner_neupaccount.ts
 */

import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { Prisma } from '@/prisma/generated/client';
import prisma from '@/core/helpers/prisma';
import { ensureAccessGrant } from '@/services/access-model';
import { BRAND_OWNER_PERMISSION_NAMES, BRAND_OWNER_ROLE_ID, BRAND_OWNER_ROLE_NAME, BRAND_ROOT_PERMISSION_NAMES } from '@/core/auth/brand-roles';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

// =============================================================================
// CONFIGURATION
// Change these values to re-target a different app, roles, or account.
// =============================================================================

// The application this runner bootstraps.
const APP_ID = 'neup.account';

// Stable role IDs — must match what is inserted in the SQL below.
const ROLE_INDIV_DEFAULT = 'individual-default-neup-account';
const ROLE_INDIV_ROOT    = 'root-full-neup-account';
const ROLE_APP_OWNER     = 'application.owner';
const ROLE_BRAND_OWNER   = BRAND_OWNER_ROLE_ID;

// Fill in an existing account ID to skip account creation and grant roles
// directly to that account. Leave empty to create a new master account
// (only valid when the database has no accounts yet).
const ACCOUNT_ID = 'd7169b8d-df72-4284-89fc-ed3f27950ac7';

// =============================================================================
// BOOTSTRAP SQL
// Inlined from default.sql — IDs reference the constants above so changing
// APP_ID / ROLE_* above automatically updates the SQL as well.
// =============================================================================

const BOOTSTRAP_SQL = `
BEGIN;

-- 1. Application
INSERT INTO "application" (
  "id", "name", "description", "icon", "website",
  "app_secret", "created_at", "endpoints", "status", "is_internal", "details"
) VALUES (
  '${APP_ID}',
  '${APP_ID}',
  'Official NeupAccount Application.',
  'https://neupcdn.com/neupaccount/assets/logo.png',
  'https://neupgroup.com/account',
  NULL,
  NOW(),
  '"https://neupgroup.com/account"',
  'active',
  TRUE,
  '[]'
) ON CONFLICT ("id") DO NOTHING;

-- 2. Roles
INSERT INTO "authz_role" ("id", "name", "description", "app_id", "scope") VALUES
  ('${ROLE_INDIV_DEFAULT}', 'individual.default', 'Default permission set for individual accounts.',  '${APP_ID}', 'default'),
  ('${ROLE_INDIV_ROOT}',    'individual.root',    'Admin-only permission set for root accounts.',     '${APP_ID}', 'individual.root'),
  ('${ROLE_APP_OWNER}',     'application.owner',  'Full ownership role for applications.',            '${APP_ID}', 'application')
ON CONFLICT ("id") DO NOTHING;

-- 3a. Permissions — individual.default
INSERT INTO "authz_capability" ("id", "name", "app_id", "scope") VALUES
  ('cap-def-profile-display-view-self',       'profile.display.name',               '${APP_ID}', 'default'),
  ('cap-def-profile-display-update-self',     'profile.display.update',             '${APP_ID}', 'default'),
  ('cap-def-profile-display-view-managed',    'profile.display.view',               '${APP_ID}', 'default'),
  ('cap-def-profile-display-view-root',       'profile.display.view.root',          '${APP_ID}', 'default'),
  ('cap-def-profile-display-update-root',     'profile.display.update.root',        '${APP_ID}', 'default'),
  ('cap-def-profile-legal-view',              'profile.legal.view',            '${APP_ID}', 'default'),
  ('cap-def-profile-legal-update',            'profile.legal.update',          '${APP_ID}', 'default'),
  ('cap-def-profile-demographics-view',       'profile.demographics.view',     '${APP_ID}', 'default'),
  ('cap-def-profile-demographics-update',     'profile.demographics.update',   '${APP_ID}', 'default'),
  ('cap-def-profile-neupid-view',             'profile.neupid.view',           '${APP_ID}', 'default'),
  ('cap-def-profile-neupid-update',           'profile.neupid.update',         '${APP_ID}', 'default'),
  ('cap-def-profile-neupid-request',          'profile.neupid.request',        '${APP_ID}', 'default'),
  ('cap-def-profile-neupid-remove',           'profile.neupid.remove',         '${APP_ID}', 'default'),
  ('cap-def-profile-contact-view',            'profile.contact.view',          '${APP_ID}', 'default'),
  ('cap-def-profile-contact-update',          'profile.contact.update',        '${APP_ID}', 'default'),
  ('cap-def-profile-kyc-view',                'profile.kyc.view',              '${APP_ID}', 'default'),
  ('cap-def-profile-kyc-update',              'profile.kyc.update',            '${APP_ID}', 'default'),
  ('cap-def-notification-read',               'notification.read',             '${APP_ID}', 'default'),
  ('cap-def-notification-delete',             'notification.delete',           '${APP_ID}', 'default'),
  ('cap-def-security-pass-modify',            'security.pass.modify',                    '${APP_ID}', 'default'),
  ('cap-def-security-totp-add',               'security.totp.add',                       '${APP_ID}', 'default'),
  ('cap-def-security-totp-remove',            'security.totp.remove',                '${APP_ID}', 'default'),
  ('cap-def-security-backup-view',            'security.backup_codes.view',          '${APP_ID}', 'default'),
  ('cap-def-security-backup-create',          'security.backup_codes.create',        '${APP_ID}', 'default'),
  ('cap-def-security-recovery-accts-view',    'security.recovery_accounts.view',     '${APP_ID}', 'default'),
  ('cap-def-security-recovery-accts-add',     'security.recovery_accounts.add',      '${APP_ID}', 'default'),
  ('cap-def-security-recovery-accts-remove',  'security.recovery_accounts.remove',   '${APP_ID}', 'default'),
  ('cap-def-security-recovery-phone-view',    'security.recovery_phone.view',        '${APP_ID}', 'default'),
  ('cap-def-security-recovery-phone-add',     'security.recovery_phone.add',         '${APP_ID}', 'default'),
  ('cap-def-security-recovery-phone-remove',  'security.recovery_phone.remove',      '${APP_ID}', 'default'),
  ('cap-def-security-recovery-email-view',    'security.recovery_email.view',        '${APP_ID}', 'default'),
  ('cap-def-security-recovery-email-add',     'security.recovery_email.add',         '${APP_ID}', 'default'),
  ('cap-def-security-recovery-email-remove',  'security.recovery_email.remove',      '${APP_ID}', 'default'),
  ('cap-def-security-devices-view',           'security.login_devices.view',         '${APP_ID}', 'default'),
  ('cap-def-linked-brand-view',               'linked_accounts.brand.view',          '${APP_ID}', 'default'),
  ('cap-def-data-terms-view',                 'data.agreed_terms.view',              '${APP_ID}', 'default'),
  ('cap-def-data-delete-start',               'data.delete_account.start',           '${APP_ID}', 'default'),
  ('cap-def-data-deactivate-start',           'data.deactivate_account.start',       '${APP_ID}', 'default'),
  ('cap-def-data-materialization-view',       'data.materialization.view',           '${APP_ID}', 'default'),
  ('cap-def-data-materialization-modify',     'data.materialization.modify',         '${APP_ID}', 'default'),
  ('cap-def-access-view',                     'access.view',                             '${APP_ID}', 'default'),
  ('cap-def-access-team-view',                'access.team.view',                    '${APP_ID}', 'default'),
  ('cap-def-access-team-add',                 'access.team.add',                     '${APP_ID}', 'default'),
  ('cap-def-access-team-remove',              'access.team.remove',                  '${APP_ID}', 'default'),
  ('cap-def-access-connection-view',          'access.connection.view',              '${APP_ID}', 'default'),
  ('cap-def-access-connection-add',           'access.connection.add',               '${APP_ID}', 'default'),
  ('cap-def-access-connection-remove',        'access.connection.remove',            '${APP_ID}', 'default'),
  ('cap-def-access-application-view',         'access.application.view',             '${APP_ID}', 'default'),
  ('cap-def-access-application-add',          'access.application.add',              '${APP_ID}', 'default'),
  ('cap-def-access-application-remove',       'access.application.remove',           '${APP_ID}', 'default'),
  ('cap-def-access-linked-account-view',      'access.linked_account.view',          '${APP_ID}', 'default'),
  ('cap-def-access-linked-account-add',       'access.linked_account.add',           '${APP_ID}', 'default'),
  ('cap-def-access-linked-account-remove',    'access.linked_account.remove',        '${APP_ID}', 'default'),
  ('cap-def-access-linked-account-approve',   'access.linked_account.approve',       '${APP_ID}', 'default'),
  ('cap-def-access-account-brand-create',     'access.account.brand.create',         '${APP_ID}', 'default'),
  ('cap-def-access-account-dependent-create', 'access.account.dependent.create',     '${APP_ID}', 'default'),
  ('cap-def-access-account-dependent-unlink', 'access.account.dependent.unlink',     '${APP_ID}', 'default'),
  ('cap-def-access-accounts-switch',          'access.accounts.switch',              '${APP_ID}', 'default'),
  ('cap-def-access-family-member-update',     'access.family.member.update',         '${APP_ID}', 'default'),
  ('cap-def-access-family-partner-update',    'access.family.partner.update',        '${APP_ID}', 'default'),
  ('cap-def-access-invitations-view',         'access.invitations.view',             '${APP_ID}', 'default'),
  ('cap-def-access-invitation-approve',       'access.invitation.approve',           '${APP_ID}', 'default'),
  ('cap-def-access-block-view',               'access.block.view',                   '${APP_ID}', 'default'),
  ('cap-def-access-block-update',             'access.block.update',                 '${APP_ID}', 'default'),
  ('cap-def-access-portfolio-create',         'access.portfolio.create',             '${APP_ID}', 'default'),
  ('cap-def-access-portfolio-update',         'access.portfolio.update',             '${APP_ID}', 'default'),
  ('cap-def-access-portfolio-delete',         'access.portfolio.delete',             '${APP_ID}', 'default'),
  ('cap-def-security-recent-activities',      'security.recent_activities.view',         '${APP_ID}', 'default'),
  ('cap-def-payment-method-show',             'payment.method.show',                '${APP_ID}', 'default'),
  ('cap-def-payment-transactions-show',       'payment.transactions.show',          '${APP_ID}', 'default'),
  ('cap-def-payment-subscriptions-show',      'payment.subscriptions.show',         '${APP_ID}', 'default'),
  ('cap-def-payment-neup-pro-view',           'payment.purchase_neup_pro.view',     '${APP_ID}', 'default'),
  ('cap-def-linked-brand-manager',            'linked_accounts.brand.manager',           '${APP_ID}', 'default')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "authz_role_capability" (
  "id", "role_id", "capability_id", "scope", "app_id", "role_name", "denormalized_capability"
)
SELECT
  'rcp-def-' || c."id",
  '${ROLE_INDIV_DEFAULT}',
  c."id",
  'default',
  '${APP_ID}',
  'individual.default',
  '["profile.display.name","profile.display.update","profile.display.view","profile.display.view.root","profile.display.update.root","profile.legal.view","profile.legal.update","profile.demographics.view","profile.demographics.update","profile.neupid.view","profile.neupid.update","profile.neupid.request","profile.neupid.remove","profile.contact.view","profile.contact.update","profile.kyc.view","profile.kyc.update","notification.read","notification.delete","security.pass.modify","security.totp.add","security.totp.remove","security.backup_codes.view","security.backup_codes.create","security.recovery_accounts.view","security.recovery_accounts.add","security.recovery_accounts.remove","security.recovery_phone.view","security.recovery_phone.add","security.recovery_phone.remove","security.recovery_email.view","security.recovery_email.add","security.recovery_email.remove","security.login_devices.view","linked_accounts.brand.view","data.agreed_terms.view","data.delete_account.start","data.deactivate_account.start","data.materialization.view","data.materialization.modify","access.view","access.team.view","access.team.add","access.team.remove","access.connection.view","access.connection.add","access.connection.remove","access.application.view","access.application.add","access.application.remove","access.linked_account.view","access.linked_account.add","access.linked_account.remove","access.linked_account.approve","access.account.brand.create","access.account.dependent.create","access.account.dependent.unlink","access.accounts.switch","access.family.member.update","access.family.partner.update","access.invitations.view","access.invitation.approve","access.block.view","access.block.update","access.portfolio.create","access.portfolio.update","access.portfolio.delete","security.recent_activities.view","payment.method.show","payment.transactions.show","payment.subscriptions.show","payment.purchase_neup_pro.view","linked_accounts.brand.manage","linked_accounts.brand.manager"]'::jsonb
FROM "authz_capability" c
WHERE c."app_id" = '${APP_ID}'
  AND c."scope"  = 'default'
ON CONFLICT ("id") DO NOTHING;

-- 3b. Permissions — individual.root (admin-only)
INSERT INTO "authz_capability" ("id", "name", "app_id", "scope") VALUES
  ('cap-root-admin-accounts-view',         'root.account.view',            '${APP_ID}', 'root'),
  ('cap-root-admin-accounts-modify',       'root.account.modify',          '${APP_ID}', 'root'),
  ('cap-root-admin-accounts-delete',       'root.account.delete',          '${APP_ID}', 'root'),
  ('cap-root-admin-accounts-search',       'root.account.search',          '${APP_ID}', 'root'),
  ('cap-root-admin-accounts-create',       'root.account.create_individual','${APP_ID}', 'root'),
  ('cap-root-admin-access-view',           'access.view',                  '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-team-view',      'access.team.view',             '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-team-add',       'access.team.add',              '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-team-remove',    'access.team.remove',           '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-connection-view','access.connection.view',       '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-connection-add', 'access.connection.add',        '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-connection-remove','access.connection.remove',   '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-application-view','access.application.view',     '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-application-add','access.application.add',       '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-application-remove','access.application.remove', '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-linked-account-view','access.linked_account.view','${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-linked-account-add','access.linked_account.add', '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-linked-account-remove','access.linked_account.remove','${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-linked-account-approve','access.linked_account.approve','${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-account-brand-create','access.account.brand.create','${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-account-dependent-create','access.account.dependent.create','${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-account-dependent-unlink','access.account.dependent.unlink','${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-accounts-switch','access.accounts.switch',       '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-family-member-update','access.family.member.update','${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-family-partner-update','access.family.partner.update','${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-invitations-view','access.invitations.view',     '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-invitation-approve','access.invitation.approve', '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-block-view',     'access.block.view',            '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-block-update',   'access.block.update',          '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-portfolio-create','access.portfolio.create',     '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-portfolio-update','access.portfolio.update',     '${APP_ID}', 'individual.root'),
  ('cap-root-admin-access-portfolio-delete','access.portfolio.delete',     '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-view',               'application.view',               '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-create',             'application.create',             '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-basics-edit',        'application.basics.edit',        '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-delete',             'application.delete',             '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-config-view',        'application.config.view',        '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-config-update',      'application.config.update',      '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-logs-view',          'application.logs.view',          '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-devlogs-view',       'application.devlogs.view',       '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-devlogs-clear',      'application.devlogs.clear',      '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-roles-view',         'application.roles.view',         '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-roles-manage',       'application.roles.manage',       '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-roles-reset-push',   'application.roles.resetPush',    '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-user-view',          'application.user.view',          '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-user-remove',        'application.user.remove',        '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-user-update-basics', 'application.user.updateBasics',  '${APP_ID}', 'individual.root'),
  ('cap-root-admin-application-user-update-role',   'application.user.updateRole',    '${APP_ID}', 'individual.root'),
  ('cap-root-brand-delete',               'account.brand.delete',                   '${APP_ID}', 'individual.root'),
  ('cap-root-brand-kyc-submit',           'account.brand.kyc.submit',               '${APP_ID}', 'individual.root'),
  ('cap-root-brand-kyc-view',             'account.brand.kyc.view',                 '${APP_ID}', 'individual.root'),
  ('cap-root-brand-members-manage',       'account.brand.members.manage',           '${APP_ID}', 'individual.root'),
  ('cap-root-admin-permits-view',          'root.permission.view',         '${APP_ID}', 'root'),
  ('cap-root-admin-permits-edit',          'root.permission.edit',         '${APP_ID}', 'root'),
  ('cap-root-admin-requests-view',         'root.requests.view',           '${APP_ID}', 'root'),
  ('cap-root-admin-dashboard-view',        'root.dashboard.view',          '${APP_ID}', 'root'),
  ('cap-root-admin-payment-config-view',   'root.payment_config.view',     '${APP_ID}', 'root'),
  ('cap-root-admin-errors-view',           'root.errors.view',             '${APP_ID}', 'root'),
  ('cap-root-display-images-view',         'root.display_images.view',      '${APP_ID}', 'root'),
  ('cap-root-display-images-add',          'root.display_images.add',       '${APP_ID}', 'root'),
  ('cap-root-display-images-update',       'root.display_images.update',    '${APP_ID}', 'root'),
  ('cap-root-display-images-delete',       'root.display_images.delete',    '${APP_ID}', 'root')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "authz_role_capability" (
  "id", "role_id", "capability_id", "scope", "app_id", "role_name", "denormalized_capability"
)
SELECT
  'rcp-root-' || c."id",
  '${ROLE_INDIV_ROOT}',
  c."id",
  'individual.root',
  '${APP_ID}',
  'individual.root',
  '${JSON.stringify([
    'root.account.view',
    'root.account.modify',
    'root.account.delete',
    'root.account.search',
    'root.account.create_individual',
    'access.view',
    'access.team.view',
    'access.team.add',
    'access.team.remove',
    'access.connection.view',
    'access.connection.add',
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
    'application.view',
    'application.create',
    'application.basics.edit',
    'application.delete',
    'application.config.view',
    'application.config.update',
    'application.logs.view',
    'application.devlogs.view',
    'application.devlogs.clear',
    'application.roles.view',
    'application.roles.manage',
    'application.roles.resetPush',
    'application.user.view',
    'application.user.remove',
    'application.user.updateBasics',
    'application.user.updateRole',
    ...BRAND_ROOT_PERMISSION_NAMES,
    'root.permission.view',
    'root.permission.edit',
    'root.requests.view',
    'root.dashboard.view',
    'root.payment_config.view',
    'root.errors.view',
    'root.display_images.view',
    'root.display_images.add',
    'root.display_images.update',
    'root.display_images.delete',
  ])}'::jsonb
FROM "authz_capability" c
WHERE c."app_id" = '${APP_ID}'
  AND c."scope"  = 'individual.root'
ON CONFLICT ("id") DO NOTHING;

-- 3c. Permissions — application.owner
INSERT INTO "authz_capability" ("id", "name", "app_id", "scope") VALUES
  ('cap-appowner-application-view-public',               'application.view',               '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-view-managed',              'application.view',               '${APP_ID}', 'managable'),
  ('cap-appowner-application-basics-edit-public',        'application.basics.edit',        '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-basics-edit-managed',       'application.basics.edit',        '${APP_ID}', 'managable'),
  ('cap-appowner-application-delete-public',             'application.delete',             '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-delete-managed',            'application.delete',             '${APP_ID}', 'managable'),
  ('cap-appowner-application-config-view-public',        'application.config.view',        '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-config-view-managed',       'application.config.view',        '${APP_ID}', 'managable'),
  ('cap-appowner-application-config-update-public',      'application.config.update',      '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-config-update-managed',     'application.config.update',      '${APP_ID}', 'managable'),
  ('cap-appowner-application-logs-view-public',          'application.logs.view',          '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-logs-view-managed',         'application.logs.view',          '${APP_ID}', 'managable'),
  ('cap-appowner-application-devlogs-view-public',       'application.devlogs.view',       '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-devlogs-view-managed',      'application.devlogs.view',       '${APP_ID}', 'managable'),
  ('cap-appowner-application-devlogs-clear-public',      'application.devlogs.clear',      '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-devlogs-clear-managed',     'application.devlogs.clear',      '${APP_ID}', 'managable'),
  ('cap-appowner-application-roles-view-public',         'application.roles.view',         '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-roles-view-managed',        'application.roles.view',         '${APP_ID}', 'managable'),
  ('cap-appowner-application-roles-manage-public',       'application.roles.manage',       '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-roles-manage-managed',      'application.roles.manage',       '${APP_ID}', 'managable'),
  ('cap-appowner-application-roles-reset-push-public',   'application.roles.resetPush',    '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-roles-reset-push-managed',  'application.roles.resetPush',    '${APP_ID}', 'managable'),
  ('cap-appowner-application-user-view-public',          'application.user.view',          '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-user-view-managed',         'application.user.view',          '${APP_ID}', 'managable'),
  ('cap-appowner-application-user-remove-public',        'application.user.remove',        '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-user-remove-managed',       'application.user.remove',        '${APP_ID}', 'managable'),
  ('cap-appowner-application-user-update-basics-public', 'application.user.updateBasics',  '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-user-update-basics-managed','application.user.updateBasics',  '${APP_ID}', 'managable'),
  ('cap-appowner-application-user-update-role-public',   'application.user.updateRole',    '${APP_ID}', 'individual.public'),
  ('cap-appowner-application-user-update-role-managed',  'application.user.updateRole',    '${APP_ID}', 'managable')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "authz_role_capability" (
  "id", "role_id", "capability_id", "scope", "app_id", "role_name", "denormalized_capability"
)
SELECT
  'rcp-appowner-' || c."id",
  '${ROLE_APP_OWNER}',
  c."id",
  'application',
  '${APP_ID}',
  'application.owner',
  '["application.view","application.basics.edit","application.delete","application.config.view","application.config.update","application.logs.view","application.devlogs.view","application.devlogs.clear","application.roles.view","application.roles.manage","application.roles.resetPush","application.user.view","application.user.remove","application.user.updateBasics","application.user.updateRole"]'::jsonb
FROM "authz_capability" c
WHERE c."app_id" = '${APP_ID}'
  AND c."scope"  = 'application'
ON CONFLICT ("id") DO NOTHING;

-- 3d. Role — neup_account.brand_owner
INSERT INTO "authz_role" ("id", "name", "description", "app_id", "scope") VALUES
  ('${ROLE_BRAND_OWNER}', '${BRAND_OWNER_ROLE_NAME}', 'Full ownership role for brand accounts.', '${APP_ID}', 'brand')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "authz_capability" ("id", "name", "app_id", "scope") VALUES
  ('cap-brand-profile-view',      'brand.profile.view',            '${APP_ID}', 'brand'),
  ('cap-brand-profile-edit',      'brand.profile.edit',            '${APP_ID}', 'brand'),
  ('cap-brand-settings-view',     'brand.settings.view',           '${APP_ID}', 'brand'),
  ('cap-brand-settings-edit',     'brand.settings.edit',           '${APP_ID}', 'brand'),
  ('cap-brand-members-view',      'brand.members.view',            '${APP_ID}', 'brand'),
  ('cap-brand-access-view',       'access.view',                   '${APP_ID}', 'brand.managable'),
  ('cap-brand-members-manage',    'account.brand.members.manage',             '${APP_ID}', 'brand.managable'),
  ('cap-brand-branches-view',     'linked_accounts.brand.view',         '${APP_ID}', 'brand'),
  ('cap-brand-branches-manage',   'linked_accounts.brand.manage',       '${APP_ID}', 'brand'),
  ('cap-brand-branches-manager',  'linked_accounts.brand.manager',      '${APP_ID}', 'brand'),
  ('cap-brand-kyc-view',          'account.brand.kyc.view',                 '${APP_ID}', 'brand.managable'),
  ('cap-brand-kyc-submit',        'account.brand.kyc.submit',               '${APP_ID}', 'brand.managable'),
  ('cap-brand-platforms-view',    'brand.platforms.view',          '${APP_ID}', 'brand'),
  ('cap-brand-platforms-manage',  'brand.platforms.manage',        '${APP_ID}', 'brand'),
  ('cap-brand-delete',            'account.brand.delete',                   '${APP_ID}', 'brand.managable')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "authz_role_capability" (
  "id", "role_id", "capability_id", "scope", "app_id", "role_name", "denormalized_capability"
)
SELECT
  'rcp-brandowner-' || c."id",
  '${ROLE_BRAND_OWNER}',
  c."id",
  'brand',
  '${APP_ID}',
  '${BRAND_OWNER_ROLE_NAME}',
  '${JSON.stringify(BRAND_OWNER_PERMISSION_NAMES)}'::jsonb
FROM "authz_capability" c
WHERE c."app_id" = '${APP_ID}'
  AND c."scope"  = 'brand'
ON CONFLICT ("id") DO NOTHING;

-- 3e. Role — branch.owner (same scope as brand so the role picker shows it for branch_account assets)
INSERT INTO "authz_role" ("id", "name", "description", "app_id", "scope") VALUES
  ('branch-owner-neup-account', 'branch.owner', 'Full ownership role for branch accounts.', '${APP_ID}', 'brand')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "authz_capability" ("id", "name", "app_id", "scope") VALUES
  ('cap-branch-profile-view',    'branch.profile.view',   '${APP_ID}', 'brand'),
  ('cap-branch-profile-edit',    'branch.profile.edit',   '${APP_ID}', 'brand'),
  ('cap-branch-settings-view',   'branch.settings.view',  '${APP_ID}', 'brand'),
  ('cap-branch-settings-edit',   'branch.settings.edit',  '${APP_ID}', 'brand'),
  ('cap-branch-members-view',    'branch.members.view',   '${APP_ID}', 'brand'),
  ('cap-branch-members-manage',  'branch.members.manage', '${APP_ID}', 'brand'),
  ('cap-branch-delete',          'branch.delete',         '${APP_ID}', 'brand')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "authz_role_capability" (
  "id", "role_id", "capability_id", "scope", "app_id", "role_name", "denormalized_capability"
)
SELECT
  'rcp-branchowner-' || c."id",
  'branch-owner-neup-account',
  c."id",
  'brand',
  '${APP_ID}',
  'branch.owner',
  '["branch.profile.view","branch.profile.edit","branch.settings.view","branch.settings.edit","branch.members.view","branch.members.manage","branch.delete"]'::jsonb
FROM "authz_capability" c
WHERE c."app_id" = '${APP_ID}'
  AND c."id" IN (
    'cap-branch-profile-view','cap-branch-profile-edit',
    'cap-branch-settings-view','cap-branch-settings-edit',
    'cap-branch-members-view','cap-branch-members-manage',
    'cap-branch-delete'
  )
ON CONFLICT ("id") DO NOTHING;

COMMIT;
`;

// =============================================================================
// LOGGING
// =============================================================================

function log(step: number, label: string, detail?: string) {
  // eslint-disable-next-line no-console
  console.log(`[Step ${step}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function logSkipped(step: number, label: string, reason: string) {
  // eslint-disable-next-line no-console
  console.log(`[Step ${step}] SKIPPED ${label} — ${reason}`);
}

function logError(step: number, label: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[Step ${step}] FAILED ${label}:`, error);
}

// =============================================================================
// STEP 1 — Bootstrap SQL (application, roles, permissions, maps)
// Uses a raw pg pool — Prisma doesn't support multi-statement SQL.
// =============================================================================

async function runBootstrapSql(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(BOOTSTRAP_SQL);
  } finally {
    await pool.end();
  }
}

// =============================================================================
// STEP 2 — Create master account (interactive prompt)
// =============================================================================

type MasterAccountInput = {
  firstName: string;
  lastName: string;
  neupId: string;
  dateOfBirth: string;
  countryOfResidence: string;
  password: string;
};

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

async function promptHidden(question: string): Promise<string> {
  output.write(question);

  return new Promise<string>((resolve) => {
    const chunks: string[] = [];
    const onData = (chunk: Buffer) => {
      const char = chunk.toString('utf8');

      if (char === '\r' || char === '\n') {
        input.off('data', onData);
        output.write('\n');
        resolve(chunks.join('').trim());
        return;
      }

      if (char === '\u0003') process.exit(130);

      if (char === '\u0008' || char === '\u007f') {
        chunks.pop();
        return;
      }

      chunks.push(char);
    };

    input.on('data', onData);
  });
}

async function promptMasterAccountInput(): Promise<MasterAccountInput> {
  const rl = createInterface({ input, output });

  try {
    const firstName          = (await rl.question('First name: ')).trim();
    const lastName           = (await rl.question('Last name: ')).trim();
    const neupId             = (await rl.question('NeupID: ')).trim();
    const dateOfBirth        = (await rl.question('Date of birth (YYYY-MM-DD): ')).trim();
    const countryOfResidence = (await rl.question('Country of residence: ')).trim();

    rl.close();

    if (!firstName || !lastName || !neupId || !dateOfBirth || !countryOfResidence) {
      throw new Error('All fields are required.');
    }

    if (!isValidIsoDate(dateOfBirth)) {
      throw new Error('Date of birth must be in YYYY-MM-DD format.');
    }

    const password = await promptHidden('Password: ');
    if (!password) throw new Error('Password is required.');

    return { firstName, lastName, neupId, dateOfBirth, countryOfResidence, password };
  } catch (error) {
    rl.close();
    throw error;
  }
}

async function createMasterAccount(): Promise<{ skipped: boolean; reason?: string; accountId?: string }> {
  const accountCount = await prisma.account.count();

  if (accountCount > 0) {
    return { skipped: true, reason: 'Accounts already exist in the database.' };
  }

  const inputData    = await promptMasterAccountInput();
  const passwordHash = await bcrypt.hash(inputData.password, 10);
  const dateOfBirth  = new Date(`${inputData.dateOfBirth}T00:00:00.000Z`);
  const displayName  = `${inputData.firstName} ${inputData.lastName}`.trim();

  const account = await prisma.account.create({
    data: {
      displayName,
      accountType: 'individual',
      status: 'active',
      isVerified: true,
      details: { role: 'master' } as Prisma.InputJsonValue,
      individualProfile: {
        create: {
          firstName: inputData.firstName,
          lastName: inputData.lastName,
          dateOfBirth,
          countryOfResidence: inputData.countryOfResidence,
        },
      },
      authMethods: {
        create: {
          type: 'password',
          value: passwordHash,
          order: 'primary',
          status: 'active',
        },
      },
      neupIds: {
        create: {
          id: inputData.neupId,
          neupId: inputData.neupId,
          isPrimary: true,
        },
      },
    },
  });

  return { skipped: false, accountId: account.id };
}

// =============================================================================
// STEP 3 — Grant roles to the master account
// =============================================================================

async function resolvePrimaryNeupId(accountId: string): Promise<string | null> {
  const row = await prisma.neupId.findFirst({
    where: { accountId, isPrimary: true },
    select: { id: true },
  });

  return row?.id ?? null;
}

async function assignRolesToAccount(accountId: string, primaryNeupId: string | null): Promise<void> {
  const roleIds = [ROLE_INDIV_DEFAULT];

  if (primaryNeupId === 'neupkishor') {
    roleIds.push(ROLE_INDIV_ROOT);
  }

  for (const roleId of roleIds) {
    await ensureAccessGrant(prisma, {
      memberAccountId: accountId,
      parentAccountId: accountId,
      childAccountId: accountId,
      accessApplicationId: APP_ID,
      roleId,
    });
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  // eslint-disable-next-line no-console
  console.log('\n=== neup.account seed runner ===\n');

  // Step 1 — Bootstrap SQL
  try {
    log(1, 'Applying bootstrap SQL…');
    await runBootstrapSql();
    log(1, 'Bootstrap SQL applied', 'application, roles, permissions, maps ready');
  } catch (error) {
    logError(1, 'runBootstrapSql', error);
    throw error;
  }

  // Step 2 — Resolve account
  let resolvedAccountId: string | null = null;

  try {
    if (ACCOUNT_ID) {
      log(2, 'ACCOUNT_ID provided, verifying…');
      const existing = await prisma.account.findUnique({
        where: { id: ACCOUNT_ID },
        select: { id: true },
      });
      if (!existing) {
        throw new Error(`ACCOUNT_ID "${ACCOUNT_ID}" not found in the database.`);
      }
      resolvedAccountId = ACCOUNT_ID;
      logSkipped(2, 'createMasterAccount', `using ACCOUNT_ID=${resolvedAccountId}`);
    } else {
      log(2, 'Creating master account…');
      const result = await createMasterAccount();

      if (result.skipped) {
        throw new Error(
          'Conditions unmet — accounts already exist but ACCOUNT_ID is empty.\n' +
          "Set ACCOUNT_ID = '<id>' at the top of _wholeRunner.ts, then re-run."
        );
      }

      resolvedAccountId = result.accountId ?? null;
      log(2, 'Master account created', `accountId=${resolvedAccountId}`);
    }
  } catch (error) {
    logError(2, 'createMasterAccount', error);
    throw error;
  }

  // Step 3 — Assign roles
  if (!resolvedAccountId) {
    // eslint-disable-next-line no-console
    console.warn('[Step 3] SKIPPED — no accountId available.');
  } else {
    try {
      log(3, 'Assigning roles to master account…');
      const primaryNeupId = await resolvePrimaryNeupId(resolvedAccountId);
      await assignRolesToAccount(resolvedAccountId, primaryNeupId);
      log(
        3,
        'Roles assigned',
        `accountId=${resolvedAccountId} → individual.default${primaryNeupId === 'neupkishor' ? ' + individual.root' : ''}`,
      );
    } catch (error) {
      logError(3, 'assignRolesToAccount', error);
      throw error;
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n=== Seed complete ===\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error('\nSeed runner failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
