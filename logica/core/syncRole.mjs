/*
::neup.documentation::logica-core-apppermit

Scans application page, route, and service files for permission usage and writes the matching
permission definitions into `logica/basics/permissions.json`.

The script treats `logica/accounts/permissions.json` as the full app-level
permission catalog and derives the used subset from permission declaration
objects shaped as `{ id, scopeFor, tag }`.

::end
*/

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "pages", "services"];
const EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];

const CATALOG_PATH = path.join(ROOT, "logica", "accounts", "permissions.json");
const OUTPUT_PATH = path.join(ROOT, "logica", "basics", "permissions.json");

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "prisma",
  "logica",
]);

const DIRECT_PERMISSION_PATTERNS = [
  /checkPermissions\s*\(([\s\S]*?)\)/g,
  /hasPermission\s*\(([\s\S]*?)\)/g,
  /requirePermission\s*\(([\s\S]*?)\)/g,
  /authorize\s*\(([\s\S]*?)\)/g,
  /can\s*\(([\s\S]*?)\)/g,
  /\b[A-Za-z0-9_]*(?:Permissions|PERMISSIONS)\s*=\s*\[([\s\S]*?)\]/g,
  /permissions?\s*:\s*\[([\s\S]*?)\]/g,
  /requiredPermissions?\s*:\s*\[([\s\S]*?)\]/g,
];

const DECLARED_ARRAY_PATTERN =
  /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s*(?:as\s+const)?/g;

const STRING_LITERAL_PATTERN = /["'`]([^"'`]+)["'`]/g;
const PERMISSION_OBJECT_ID_PATTERN = /(?:^|[{,\s])["']?id["']?\s*:\s*["'`]([^"'`]+)["'`]/g;
const SPREAD_IDENTIFIER_PATTERN = /\.\.\.\s*([A-Za-z0-9_]+)/g;
const IDENTIFIER_ARG_PATTERN = /^[A-Za-z0-9_]+$/;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const item of fs.readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(item)) continue;

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (EXTENSIONS.includes(path.extname(item))) {
      files.push(fullPath);
    }
  }

  return files;
}

function isScannedFile(filePath) {
  const normalized = filePath.replaceAll("\\", "/");

  return (
    /\/page\.(js|jsx|ts|tsx)$/.test(normalized) ||
    /\/route\.(js|jsx|ts|tsx)$/.test(normalized) ||
    /\/pages\/.*\.(js|jsx|ts|tsx)$/.test(normalized) ||
    /\/services\/.*\.(js|jsx|ts|tsx)$/.test(normalized)
  );
}

function collectStringLiterals(value) {
  const matches = [];
  let match;

  STRING_LITERAL_PATTERN.lastIndex = 0;
  while ((match = STRING_LITERAL_PATTERN.exec(value))) {
    matches.push(match[1].trim());
  }

  return matches.filter(Boolean);
}

function collectPermissionObjectIds(value) {
  const matches = [];
  let match;

  PERMISSION_OBJECT_ID_PATTERN.lastIndex = 0;
  while ((match = PERMISSION_OBJECT_ID_PATTERN.exec(value))) {
    matches.push(match[1].trim());
  }

  return matches.filter(Boolean);
}

function collectSpreadIdentifiers(value) {
  const matches = [];
  let match;

  SPREAD_IDENTIFIER_PATTERN.lastIndex = 0;
  while ((match = SPREAD_IDENTIFIER_PATTERN.exec(value))) {
    matches.push(match[1].trim());
  }

  return matches.filter(Boolean);
}

function parseArrayDefinition(arraySource) {
  const objectIds = collectPermissionObjectIds(arraySource);

  return {
    permissions: objectIds.length > 0 ? objectIds : collectStringLiterals(arraySource),
    dependencies: collectSpreadIdentifiers(arraySource),
  };
}

function buildExportedPermissionMap(files) {
  const definitions = new Map();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let match;

    DECLARED_ARRAY_PATTERN.lastIndex = 0;
    while ((match = DECLARED_ARRAY_PATTERN.exec(content))) {
      definitions.set(match[1], parseArrayDefinition(match[2]));
    }
  }

  const resolved = new Map();

  function resolveDefinition(name, stack = new Set()) {
    if (resolved.has(name)) return resolved.get(name);
    if (stack.has(name)) return [];

    const definition = definitions.get(name);
    if (!definition) return [];

    stack.add(name);
    const permissions = new Set(definition.permissions);

    for (const dependency of definition.dependencies) {
      for (const permission of resolveDefinition(dependency, stack)) {
        permissions.add(permission);
      }
    }

    stack.delete(name);
    const result = [...permissions];
    resolved.set(name, result);
    return result;
  }

  for (const name of definitions.keys()) {
    resolveDefinition(name);
  }

  return resolved;
}

function extractPermissionsFromSnippet(snippet, exportedArrays) {
  const objectIds = collectPermissionObjectIds(snippet);
  const permissions = new Set(objectIds.length > 0 ? objectIds : collectStringLiterals(snippet));

  for (const identifier of collectSpreadIdentifiers(snippet)) {
    for (const permission of exportedArrays.get(identifier) ?? []) {
      permissions.add(permission);
    }
  }

  const trimmed = snippet.trim();
  if (IDENTIFIER_ARG_PATTERN.test(trimmed)) {
    for (const permission of exportedArrays.get(trimmed) ?? []) {
      permissions.add(permission);
    }
  }

  return permissions;
}

function extractPermissionsFromContent(content, exportedArrays) {
  const permissions = new Set();

  for (const pattern of DIRECT_PERMISSION_PATTERNS) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(content))) {
      for (const permission of extractPermissionsFromSnippet(match[1], exportedArrays)) {
        permissions.add(permission);
      }
    }
  }

  return [...permissions];
}

function loadPermissionCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Permission catalog not found: ${CATALOG_PATH}`);
  }

  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function main() {
  const allFiles = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  const scannedFiles = allFiles.filter(isScannedFile);
  const exportedArrays = buildExportedPermissionMap(allFiles);
  const usedPermissions = new Set();

  for (const file of scannedFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const permission of extractPermissionsFromContent(content, exportedArrays)) {
      usedPermissions.add(permission);
    }
  }

  const catalog = loadPermissionCatalog();
  const filteredPermissions = catalog.filter((entry) => usedPermissions.has(entry.title));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(filteredPermissions, null, 2)}\n`, "utf8");

  console.log(`Scanned ${scannedFiles.length} page, route, and service files.`);
  console.log(`Resolved ${usedPermissions.size} distinct permission references.`);
  console.log(`Wrote ${filteredPermissions.length} permission entries to: ${OUTPUT_PATH}`);
}

main();
