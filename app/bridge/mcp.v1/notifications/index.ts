import { checkPermissions } from '@/services/user';
import { deleteNotification, getNotifications, markNotificationAsRead } from '@/services/notifications';
import { createMcpToolResult, type McpToolModule } from '../basics/types';

/** Gets the current account's notifications after checking its read permission. */
async function executeGetNotifications() {
  if (!(await checkPermissions(['notification.read']))) {
    return createMcpToolResult({ success: false, error: 'Permission denied.' }, true);
  }
  return createMcpToolResult({ success: true, notifications: await getNotifications() });
}

/** Marks one notification as read using the notification service's account scoping. */
async function executeMarkNotificationRead(args: Record<string, unknown>) {
  if (typeof args.notificationId !== 'string' || !args.notificationId.trim()) {
    return createMcpToolResult({ success: false, error: 'notificationId is required.' }, true);
  }
  const result = await markNotificationAsRead(args.notificationId.trim());
  return createMcpToolResult(result.success ? result : { success: false, error: 'Permission denied or notification not found.' }, !result.success);
}

/** Deletes one notification using the service's account and delete-permission checks. */
async function executeDeleteNotification(args: Record<string, unknown>) {
  if (typeof args.notificationId !== 'string' || !args.notificationId.trim()) {
    return createMcpToolResult({ success: false, error: 'notificationId is required.' }, true);
  }
  const result = await deleteNotification(args.notificationId.trim());
  return createMcpToolResult(result, !result.success);
}

export const notificationTools: McpToolModule[] = [
  {
    definition: {
      name: 'get_notifications',
      description: 'Get notifications for the signed-in user’s active account.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeGetNotifications,
  },
  {
    definition: {
      name: 'mark_notification_read',
      description: 'Mark one of the signed-in user’s notifications as read.',
      inputSchema: {
        type: 'object',
        properties: { notificationId: { type: 'string', minLength: 1 } },
        required: ['notificationId'],
        additionalProperties: false,
      },
    },
    execute: executeMarkNotificationRead,
  },
  {
    definition: {
      name: 'delete_notification',
      description: 'Delete one of the signed-in user’s notifications. Requires notification delete permission.',
      annotations: { destructiveHint: true },
      inputSchema: {
        type: 'object',
        properties: { notificationId: { type: 'string', minLength: 1 } },
        required: ['notificationId'],
        additionalProperties: false,
      },
    },
    execute: executeDeleteNotification,
  },
];
