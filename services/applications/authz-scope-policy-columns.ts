/*
::neup.documentation::application-authz-scope-policy-columns
::title Application Authz Scope Policy Column Support

Detects whether the database has the new authz `scope_for` and `scope_level` columns.

::public

The authz management services use this helper to switch between the new scope-policy fields and the legacy acquisition/approval-only shape without crashing on partially migrated databases.

::public end

::private

The result is cached per server process because the schema support only changes when a migration is applied and the process restarts.

::private end

::end
*/

import { Prisma } from '@/prisma/generated/client/client';
import prisma from '@/core/helpers/prisma';

export type AuthzScopePolicyColumnSupport = {
  permission: boolean;
  role: boolean;
  rolePermissionMap: boolean;
};

let authzScopePolicyColumnSupportPromise: Promise<AuthzScopePolicyColumnSupport> | null = null;

function hasColumns(
  rows: Array<{ table_name: string; column_name: string }>,
  tableName: string,
  columnNames: string[],
): boolean {
  return columnNames.every((columnName) =>
    rows.some((row) => row.table_name === tableName && row.column_name === columnName),
  );
}

async function loadAuthzScopePolicyColumnSupport(): Promise<AuthzScopePolicyColumnSupport> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>(Prisma.sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'authz_permission' AND column_name IN ('scope_for', 'scope_level'))
        OR (table_name = 'authz_role' AND column_name IN ('scope_for', 'scope_level'))
        OR (table_name = 'authz_role_permission_map' AND column_name IN ('scope_for', 'scope_level'))
      )
  `);

  return {
    permission: hasColumns(rows, 'authz_permission', ['scope_for', 'scope_level']),
    role: hasColumns(rows, 'authz_role', ['scope_for', 'scope_level']),
    rolePermissionMap: hasColumns(rows, 'authz_role_permission_map', ['scope_for', 'scope_level']),
  };
}

export async function getAuthzScopePolicyColumnSupport(): Promise<AuthzScopePolicyColumnSupport> {
  authzScopePolicyColumnSupportPromise ??= loadAuthzScopePolicyColumnSupport();
  return authzScopePolicyColumnSupportPromise;
}

export function isMissingAuthzScopePolicyColumnError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2022') return false;

  const column = typeof error.meta?.column === 'string' ? error.meta.column : '';
  if (column === 'scope_for' || column === 'scope_level') return true;

  return typeof error.message === 'string' && (
    error.message.includes('scope_for')
    || error.message.includes('scope_level')
  );
}
