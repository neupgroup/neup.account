/*
::neup.documentation::logica-get-roles-script

Fetches app authz data through the bridge sync APIs and refills the local
`logica/basics/appinfo.json`, `logica/basics/permissions.json`, and
`logica/basics/roles.json` snapshots.

Set `NEUP_APP_ID`, `NEUP_APP_SECRET`, and optionally `NEUP_BRIDGE_URL`.

::end
*/

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const BRIDGE_URL = (process.env.NEUP_BRIDGE_URL || 'http://127.0.0.1:2226').replace(/\/+$/, '');
const NEUP_APP_ID = process.env.NEUP_APP_ID || process.env.neup_app_id;
const NEUP_APP_SECRET = process.env.NEUP_APP_SECRET || process.env.neup_app_secret;

function requireCredentials() {
  if (!NEUP_APP_ID || !NEUP_APP_SECRET) {
    throw new Error('NEUP_APP_ID and NEUP_APP_SECRET are required.');
  }
}

function endpoint(pathname) {
  const url = new URL(`${BRIDGE_URL}${pathname}`);
  url.searchParams.set('neup_app_id', NEUP_APP_ID);
  url.searchParams.set('neup_app_secret', NEUP_APP_SECRET);
  return url;
}

async function getJson(pathname) {
  const response = await fetch(endpoint(pathname));
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(`${pathname} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function writeJson(relativePath, value) {
  const target = resolve(ROOT, relativePath);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  requireCredentials();

  const [permissionsPayload, rolesPayload] = await Promise.all([
    getJson('/bridge/api.v1/app/permissions'),
    getJson('/bridge/api.v1/app/roles'),
  ]);

  await writeJson('logica/basics/appinfo.json', rolesPayload.appinfo ?? permissionsPayload.appinfo ?? null);
  await writeJson('logica/basics/permissions.json', permissionsPayload.permissions ?? []);
  await writeJson('logica/basics/roles.json', rolesPayload.roles ?? []);

  console.log(`Wrote ${permissionsPayload.permissions?.length ?? 0} permissions.`);
  console.log(`Wrote ${rolesPayload.roles?.length ?? 0} roles.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
