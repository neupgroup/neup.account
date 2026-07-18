/*
::neup.documentation::export-logica-authz-script

Exports authz roles, permissions, and basic application metadata into generated
snapshot files under `local/*` plus `logica/basics/appinfo.json`.

The generated JSON keeps the user-facing `title` alias for `name` while also
persisting the rest of each table row so downstream consumers can read the
full authz snapshot without querying the database directly.

Permission exports include policy fields such as `scopeFor` and `scopeLevel`
but no longer persist the removed legacy permission `scope` column.

::end
*/

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import prisma from '@/core/database/prisma';

const CURRENT_APP_ID = 'neup.account';

function normalizeJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeJsonValue(entry)]),
    );
  }

  return value;
}

async function exportPermissions() {
  await mkdir(resolve(process.cwd(), 'local/accounts'), { recursive: true });
  await mkdir(resolve(process.cwd(), 'local/basics'), { recursive: true });

  const permissions = await prisma.authzPermission.findMany({
    where: { appId: CURRENT_APP_ID },
    orderBy: [
      { name: 'asc' },
    ],
  });

  const serialized = permissions.map((permission) => ({
    id: permission.id,
    title: permission.name,
    description: permission.description,
    scopeFor: normalizeJsonValue(permission.scopeFor),
    scopeLevel: normalizeJsonValue(permission.scopeLevel),
    acquisitionType: null,
    approvalPolicy: permission.approvalPolicy,
    rules: permission.rules,
    status: permission.status,
    tag: normalizeJsonValue(permission.tag),
  }));

  await writeFile(
    resolve(process.cwd(), 'local/accounts/permissions.json'),
    `${JSON.stringify(serialized, null, 2)}\n`,
    'utf8',
  );

  await writeFile(
    resolve(process.cwd(), 'local/basics/permissions.json'),
    `${JSON.stringify(serialized, null, 2)}\n`,
    'utf8',
  );
}

async function exportRoles() {
  await mkdir(resolve(process.cwd(), 'local/accounts'), { recursive: true });
  await mkdir(resolve(process.cwd(), 'local/basics'), { recursive: true });

  const roles = await prisma.authzRole.findMany({
    where: { appId: CURRENT_APP_ID },
    orderBy: [
      { name: 'asc' },
    ],
  });

  const serialized = roles.map((role) => ({
    id: role.id,
    title: role.name,
    description: role.description,
    scopeFor: normalizeJsonValue(role.scopeFor),
    scopeLevel: normalizeJsonValue(role.scopeLevel),
    acquisitionType: role.acquisitionType,
    approvalPolicy: role.approvalPolicy,
    pushed: role.pushed,
    applicableFor: normalizeJsonValue(role.applicableFor),
    permissions: normalizeJsonValue(role.permissions),
  }));

  await writeFile(
    resolve(process.cwd(), 'local/accounts/roles.json'),
    `${JSON.stringify(serialized, null, 2)}\n`,
    'utf8',
  );

  await writeFile(
    resolve(process.cwd(), 'local/basics/roles.json'),
    `${JSON.stringify(serialized, null, 2)}\n`,
    'utf8',
  );
}

async function exportAppInfo() {
  await mkdir(resolve(process.cwd(), 'logica/basics'), { recursive: true });

  const application = await prisma.application.findUnique({
    where: { id: CURRENT_APP_ID },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  await writeFile(
    resolve(process.cwd(), 'logica/basics/appinfo.json'),
    `${JSON.stringify(
      application
        ? {
            id: application.id,
            name: application.name,
            description: application.description,
          }
        : null,
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function main() {
  await exportPermissions();
  await exportRoles();
  await exportAppInfo();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
