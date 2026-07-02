/*
::neup.documentation::logica-post-roles-script

Posts local `logica/basics/permissions.json` and `logica/basics/roles.json`
to an app through the bridge sync APIs.

Set `NEUP_APP_ID`, `NEUP_APP_SECRET`, and optionally `NEUP_BRIDGE_URL`.

::end
*/

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
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

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(ROOT, relativePath), 'utf8'));
}

async function postJson(pathname, body) {
  const response = await fetch(`${BRIDGE_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      neup_app_id: NEUP_APP_ID,
      neup_app_secret: NEUP_APP_SECRET,
      ...body,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(`${pathname} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function main() {
  requireCredentials();

  const permissions = await readJson('logica/basics/permissions.json');
  const roles = await readJson('logica/basics/roles.json');

  const permissionsPayload = await postJson('/bridge/api.v1/app/permissions', { permissions });
  const rolesPayload = await postJson('/bridge/api.v1/app/roles', { roles });

  console.log(`Posted ${permissionsPayload.imported ?? 0} permissions.`);
  console.log(`Posted ${rolesPayload.imported ?? 0} roles.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
