import { revalidatePath } from 'next/cache';

export function revalidateApplicationDetailRoutes(appId: string) {
  revalidatePath('/application');
  revalidatePath(`/application/${appId}`);
}

export function revalidateApplicationEditRoutes(appId: string) {
  revalidateApplicationDetailRoutes(appId);
  revalidatePath('/application/edit');
  revalidatePath(`/application/${appId}/edit`);
}

export function revalidateApplicationConfigRoutes(appId: string) {
  revalidateApplicationDetailRoutes(appId);
  revalidatePath('/application/config');
  revalidatePath(`/application/${appId}/config`);
}

export function revalidateApplicationRoleRoutes(appId: string, roleId?: string) {
  revalidatePath('/application/roles');
  revalidatePath('/application/roles/add');
  revalidatePath(`/application/${appId}/roles`);
  revalidatePath(`/application/${appId}/roles/add`);

  if (roleId) {
    revalidatePath(`/application/roles/${roleId}`);
    revalidatePath(`/application/${appId}/roles/${roleId}`);
  }
}

export function revalidateApplicationPermissionsRoutes(appId: string) {
  revalidatePath('/application/permissions');
  revalidatePath(`/application/${appId}/permissions`);
}

export function revalidateApplicationRequestsRoutes(appId: string) {
  revalidatePath('/application/requests');
  revalidatePath(`/application/${appId}/requests`);
}

export function revalidateApplicationUsersRoutes(appId: string, connectionId?: string) {
  revalidatePath('/application/users');
  revalidatePath(`/application/${appId}/users`);

  if (connectionId) {
    revalidatePath(`/application/users/${connectionId}`);
    revalidatePath(`/application/users/${connectionId}/activity`);
    revalidatePath(`/application/users/${connectionId}/delete`);
    revalidatePath(`/application/${appId}/users/${connectionId}`);
    revalidatePath(`/application/${appId}/users/${connectionId}/activity`);
    revalidatePath(`/application/${appId}/users/${connectionId}/delete`);
    revalidatePath(`/application/${appId}/users/${connectionId}/role`);
  }
}

export function revalidateApplicationLogsRoutes(appId: string) {
  revalidatePath('/application/logs');
  revalidatePath(`/application/${appId}/logs`);
}
