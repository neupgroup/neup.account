export const DATA_PRIVACY_PERMISSION_GROUPS = {
  terms: ['data.agreed_terms.view.self'],
  deleteAccount: ['data.delete_account.start.self'],
  deactivateAccount: ['data.deactivate_account.start.self'],
  materialization: ['data.materialization.view.self', 'data.materialization.modify.self'],
  appConnections: ['security.third_party.view.self'],
  recentActivities: ['security.recent_activities.view.self'],
} as const;

export const DATA_PRIVACY_NAV_PERMISSIONS = Array.from(
  new Set(Object.values(DATA_PRIVACY_PERMISSION_GROUPS).flat()),
);
