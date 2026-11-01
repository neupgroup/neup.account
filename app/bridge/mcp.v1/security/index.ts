import { changePassword } from '@/services/security/password';
import { getUserSessions, logoutAllOtherSessions } from '@/services/security/sessions';
import { getTotpStatus } from '@/services/security/totp';
import { getRecoveryEmail } from '@/services/security/email';
import { getRecoveryPhone } from '@/services/security/phone';
import { checkPermissions } from '@/services/user';
import { createMcpToolResult, type McpToolModule } from '../basics/types';

/** Changes the active account password through the existing credential and permission checks. */
async function executeChangePassword(args: Record<string, unknown>) {
  if (typeof args.currentPassword !== 'string' || typeof args.newPassword !== 'string') {
    return createMcpToolResult({ success: false, error: 'currentPassword and newPassword are required.' }, true);
  }
  const result = await changePassword({ currentPassword: args.currentPassword, newPassword: args.newPassword });
  return createMcpToolResult(result, !result.success);
}

/** Lists login sessions for the active account using the security service's permission check. */
async function executeListSecuritySessions() {
  return createMcpToolResult({ success: true, sessions: await getUserSessions() });
}

/** Expires every active session except the device session making this request. */
async function executeLogoutOtherSessions() {
  const result = await logoutAllOtherSessions();
  return createMcpToolResult(result, !result.success);
}

/** Returns available security settings, omitting sections without view permission. */
async function executeGetSecurityStatus() {
  const [canViewTotp, canViewRecoveryEmail, canViewRecoveryPhone, canViewSessions] = await Promise.all([
    checkPermissions(['security.totp.add', 'security.totp.remove']),
    checkPermissions(['security.recovery_email.view']),
    checkPermissions(['security.recovery_phone.view']),
    checkPermissions(['security.login_devices.view']),
  ]);
  if (!canViewTotp && !canViewRecoveryEmail && !canViewRecoveryPhone && !canViewSessions) {
    return createMcpToolResult({ success: false, error: 'Permission denied.' }, true);
  }

  const [totp, recoveryEmail, recoveryPhone, sessions] = await Promise.all([
    canViewTotp ? getTotpStatus() : Promise.resolve(undefined),
    canViewRecoveryEmail ? getRecoveryEmail() : Promise.resolve(undefined),
    canViewRecoveryPhone ? getRecoveryPhone() : Promise.resolve(undefined),
    canViewSessions ? getUserSessions() : Promise.resolve(undefined),
  ]);
  return createMcpToolResult({
    success: true,
    ...(totp ? { twoFactorEnabled: totp.isEnabled } : {}),
    ...(canViewRecoveryEmail ? { recoveryEmail } : {}),
    ...(canViewRecoveryPhone ? { recoveryPhone } : {}),
    ...(sessions ? { activeSessionCount: sessions.length } : {}),
  });
}

export const securityTools: McpToolModule[] = [
  {
    definition: {
      name: 'change_password',
      description: 'Change the active account password. Requires the current password and existing password-change permission.',
      annotations: { destructiveHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 8 },
        },
        required: ['currentPassword', 'newPassword'],
        additionalProperties: false,
      },
    },
    execute: executeChangePassword,
  },
  {
    definition: {
      name: 'list_security_sessions',
      description: 'List active login sessions for the signed-in account.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeListSecuritySessions,
  },
  {
    definition: {
      name: 'get_security_status',
      description: 'Get permitted security status details, including two-factor, recovery methods, and active session count.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeGetSecurityStatus,
  },
  {
    definition: {
      name: 'logout_other_sessions',
      description: 'Sign out this account from every active session except the device making this request.',
      annotations: { destructiveHint: true },
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeLogoutOtherSessions,
  },
];
