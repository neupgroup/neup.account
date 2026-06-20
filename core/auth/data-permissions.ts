import {
  ACCESS_APPLICATION_VIEW_PERMISSIONS,
  ACCESS_CONNECTION_VIEW_PERMISSIONS,
} from '@/core/auth/access-view-permissions';

export const DATA_PRIVACY_PERMISSION_GROUPS = {
  terms: ['data.agreed_terms.view'],
  deleteAccount: ['data.delete_account.start'],
  deactivateAccount: ['data.deactivate_account.start'],
  materialization: ['data.materialization.view', 'data.materialization.modify'],
  appConnections: [...ACCESS_CONNECTION_VIEW_PERMISSIONS, ...ACCESS_APPLICATION_VIEW_PERMISSIONS],
  recentActivities: ['security.recent_activities.view'],
} as const;

export const DATA_PRIVACY_NAV_PERMISSIONS = Array.from(
  new Set(Object.values(DATA_PRIVACY_PERMISSION_GROUPS).flat()),
);
