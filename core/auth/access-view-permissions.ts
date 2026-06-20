export const ACCESS_VIEW_PERMISSION_GROUPS = {
  public: ['access.view.scopePublic'],
  managed: ['access.view.scopeManaged'],
  root: ['access.view.scopeRoot'],
} as const;

export const ACCESS_VIEW_PERMISSIONS = Array.from(
  new Set(Object.values(ACCESS_VIEW_PERMISSION_GROUPS).flat()),
);
