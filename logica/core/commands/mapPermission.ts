/*
::neup.documentation::map-permission-command

Statically maps permission helper usage across the project.

The command scans TypeScript and TSX files with the TypeScript Compiler API,
recognizes imports from the local permission helper, records usage context,
and writes a permission catalog with policy and usage metadata to
`logica/basics/permissions.json`.

::end
*/

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { createProjectScanner } from '../ast/project-scanner';

const PERMISSION_HELPER_MODULES = new Set([
  '@logica/permission',
  '@/logica/permission',
  './logica/permission',
  '../logica/permission',
]);

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const OUTPUT_FILE = 'logica/basics/permissions.json';

type FileType = 'page' | 'layout' | 'route' | 'middleware' | 'component' | 'hook' | 'utility' | 'unknown';

type PermissionUsage = {
  permission: string;
  scope: string | null;
  file: string;
  line: number;
  column: number;
  route: string | null;
  type: FileType;
  function: string | null;
  class: string | null;
  component: string | null;
  method: string | null;
};

type PermissionCatalogEntry = {
  id: string;
  title: string;
  scopeFor?: unknown;
  scopeLevel?: unknown;
  acquisitionType?: unknown;
  approvalPolicy?: unknown;
  rules?: unknown;
  status?: unknown;
  tag?: unknown;
  usages?: PermissionUsage[];
};

type Warning = {
  file: string;
  line: number;
  column: number;
  message: string;
};

type ScanResult = {
  filesScanned: number;
  usages: PermissionUsage[];
  warnings: Warning[];
};

type ImportBindings = {
  permissionIdentifiers: Set<string>;
  namespaceIdentifiers: Set<string>;
};

function toProjectPath(projectRoot: string, fileName: string): string {
  return relative(projectRoot, fileName).split(sep).join('/');
}

function positionFor(sourceFile: ts.SourceFile, node: ts.Node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}

function warningAt(projectRoot: string, sourceFile: ts.SourceFile, node: ts.Node, message: string): Warning {
  return {
    file: toProjectPath(projectRoot, sourceFile.fileName),
    ...positionFor(sourceFile, node),
    message,
  };
}

function getModuleSpecifier(node: ts.ImportDeclaration): string | null {
  return ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
}

function collectPermissionImports(sourceFile: ts.SourceFile): ImportBindings {
  const bindings: ImportBindings = {
    permissionIdentifiers: new Set(),
    namespaceIdentifiers: new Set(),
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleSpecifier = getModuleSpecifier(statement);
    if (!moduleSpecifier || !PERMISSION_HELPER_MODULES.has(moduleSpecifier)) continue;

    const importClause = statement.importClause;
    if (!importClause?.namedBindings) continue;

    if (ts.isNamedImports(importClause.namedBindings)) {
      for (const element of importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (importedName === 'permission') {
          bindings.permissionIdentifiers.add(element.name.text);
        }
      }
    }

    if (ts.isNamespaceImport(importClause.namedBindings)) {
      bindings.namespaceIdentifiers.add(importClause.namedBindings.name.text);
    }
  }

  return bindings;
}

function isImportedPermissionCall(expression: ts.Expression, bindings: ImportBindings): boolean {
  if (ts.isIdentifier(expression)) {
    return bindings.permissionIdentifiers.has(expression.text);
  }

  return Boolean(
    ts.isPropertyAccessExpression(expression) &&
      expression.name.text === 'permission' &&
      ts.isIdentifier(expression.expression) &&
      bindings.namespaceIdentifiers.has(expression.expression.text),
  );
}

function isUnresolvedPermissionLikeCall(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) return expression.text === 'permission';
  return ts.isPropertyAccessExpression(expression) && expression.name.text === 'permission';
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function getStringProperty(node: ts.ObjectLiteralExpression, propertyName: string): ts.StringLiteralLike | null {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyNameText(property.name) !== propertyName) continue;
    if (ts.isStringLiteralLike(property.initializer)) return property.initializer;
  }

  return null;
}

function hasPermissionDeclarationShape(node: ts.ObjectLiteralExpression): boolean {
  return Boolean(getStringProperty(node, 'id') && getStringProperty(node, 'scopeFor'));
}

function isUppercaseLetter(value: string): boolean {
  if (value.length !== 1) return false;
  const upper = value.toUpperCase();
  const lower = value.toLowerCase();
  return value === upper && value !== lower;
}

function isLowercaseLetter(value: string): boolean {
  if (value.length !== 1) return false;
  const upper = value.toUpperCase();
  const lower = value.toLowerCase();
  return value === lower && value !== upper;
}

function isDigit(value: string): boolean {
  return value >= '0' && value <= '9';
}

function isSlugCharacter(value: string): boolean {
  return isUppercaseLetter(value) || isLowercaseLetter(value) || isDigit(value);
}

function startsWithUppercase(value: string): boolean {
  return value.length > 0 && isUppercaseLetter(value[0] ?? '');
}

function staticStringFromExpression(
  expression: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
  warnings: Warning[],
  projectRoot: string,
): string | null {
  if (!expression) {
    return null;
  }

  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }

  if (ts.isNoSubstitutionTemplateLiteral(expression) || ts.isTemplateExpression(expression)) {
    warnings.push(warningAt(projectRoot, sourceFile, expression, 'permission() uses a template literal.'));
    return null;
  }

  if (ts.isIdentifier(expression)) {
    const declaration = findStaticStringDeclaration(expression);
    if (declaration) return declaration;

    warnings.push(
      warningAt(
        projectRoot,
        sourceFile,
        expression,
        `permission() uses variable "${expression.text}" that cannot be statically resolved.`,
      ),
    );
    return null;
  }

  warnings.push(
    warningAt(projectRoot, sourceFile, expression, 'permission() first argument is not a string literal.'),
  );
  return null;
}

function findStaticStringDeclaration(identifier: ts.Identifier): string | null {
  const parent = identifier.parent;
  if (!parent) return null;

  const sourceFile = identifier.getSourceFile();
  let resolved: string | null = null;

  function visit(node: ts.Node) {
    if (resolved !== null) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier.text &&
      node.initializer &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      resolved = node.initializer.text;
      return;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return resolved;
}

function inferFileType(filePath: string): FileType {
  const baseName = filePath.split('/').pop() ?? '';
  if (baseName === 'page.tsx' || baseName === 'page.ts') return 'page';
  if (baseName === 'layout.tsx' || baseName === 'layout.ts') return 'layout';
  if (baseName === 'route.tsx' || baseName === 'route.ts') return 'route';
  if (baseName === 'middleware.ts' || baseName === 'middleware.tsx' || baseName === 'proxy.ts') return 'middleware';
  if (filePath.includes('/components/') || startsWithUppercase(baseName)) return 'component';
  if (baseName.startsWith('use-') || baseName.startsWith('use') || filePath.includes('/hooks/')) return 'hook';
  if (filePath.includes('/services/') || filePath.includes('/core/') || filePath.includes('/lib/')) return 'utility';
  return 'unknown';
}

function inferNextRoute(filePath: string): string | null {
  const parts = filePath.split('/');
  const appIndex = parts.indexOf('app');
  if (appIndex === -1) return null;

  const routeParts = parts.slice(appIndex + 1, -1).filter((part) => !part.startsWith('(') && !part.endsWith(')'));
  const route = `/${routeParts.join('/')}`;
  return route.endsWith('/') && route.length > 1 ? route.slice(0, -1) : route;
}

function getFunctionName(node: ts.Node): string | null {
  if (
    (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText();
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  }

  return null;
}

function isReactComponentName(name: string | null): boolean {
  return Boolean(name && startsWithUppercase(name));
}

function contextForNode(node: ts.Node, fileType: FileType) {
  let current: ts.Node | undefined = node;
  let functionName: string | null = null;
  let className: string | null = null;
  let component: string | null = null;
  let method: string | null = null;

  while (current) {
    const candidateFunctionName = getFunctionName(current);
    if (!functionName && candidateFunctionName) {
      functionName = candidateFunctionName;
      if (isReactComponentName(candidateFunctionName)) {
        component = candidateFunctionName;
      }
      if (fileType === 'route' && HTTP_METHODS.has(candidateFunctionName)) {
        method = candidateFunctionName;
      }
    }

    if (!className && ts.isClassDeclaration(current) && current.name) {
      className = current.name.text;
    }

    current = current.parent;
  }

  return {
    functionName,
    className,
    component,
    method,
  };
}

function buildDuplicateKey(usage: PermissionUsage): string {
  return [
    usage.permission,
    usage.scope ?? '',
    usage.file,
    usage.route ?? '',
    usage.type,
    usage.function ?? '',
    usage.class ?? '',
    usage.component ?? '',
    usage.method ?? '',
  ].join('\u0000');
}

function readScopeArgument(
  expression: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
  warnings: Warning[],
  projectRoot: string,
): string | null {
  if (!expression) return null;
  return staticStringFromExpression(expression, sourceFile, warnings, projectRoot);
}

function scanSourceFile(projectRoot: string, sourceFile: ts.SourceFile): { usages: PermissionUsage[]; warnings: Warning[] } {
  const bindings = collectPermissionImports(sourceFile);
  const warnings: Warning[] = [];
  const usages: PermissionUsage[] = [];
  const file = toProjectPath(projectRoot, sourceFile.fileName);
  const type = inferFileType(file);
  const route = inferNextRoute(file);

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      if (isImportedPermissionCall(node.expression, bindings)) {
        const permissionName = staticStringFromExpression(node.arguments[0], sourceFile, warnings, projectRoot);
        const scope = readScopeArgument(node.arguments[1], sourceFile, warnings, projectRoot);

        if (permissionName) {
          const position = positionFor(sourceFile, node.expression);
          const context = contextForNode(node, type);
          usages.push({
            permission: permissionName,
            scope,
            file,
            line: position.line,
            column: position.column,
            route,
            type,
            function: context.functionName,
            class: context.className,
            component: context.component,
            method: context.method,
          });
        }
      } else if (isUnresolvedPermissionLikeCall(node.expression)) {
        warnings.push(
          warningAt(projectRoot, sourceFile, node.expression, 'permission() cannot be resolved to @logica/permission.'),
        );
      }
    }

    if (ts.isObjectLiteralExpression(node) && hasPermissionDeclarationShape(node)) {
      const idProperty = getStringProperty(node, 'id');
      if (idProperty) {
        const position = positionFor(sourceFile, idProperty);
        const context = contextForNode(node, type);
        usages.push({
          permission: idProperty.text,
          scope: getStringProperty(node, 'scopeFor')?.text ?? null,
          file,
          line: position.line,
          column: position.column,
          route,
          type,
          function: context.functionName,
          class: context.className,
          component: context.component,
          method: context.method,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { usages, warnings };
}

function slugifyPermissionId(permission: string): string {
  const parts: string[] = [];
  let previousWasSeparator = true;

  for (const character of permission) {
    if (isSlugCharacter(character)) {
      parts.push(character.toLowerCase());
      previousWasSeparator = false;
      continue;
    }

    if (!previousWasSeparator) {
      parts.push('-');
      previousWasSeparator = true;
    }
  }

  if (parts[parts.length - 1] === '-') {
    parts.pop();
  }

  return `cap-def-${parts.join('')}`;
}

async function readExistingCatalog(projectRoot: string): Promise<Map<string, PermissionCatalogEntry>> {
  const outputPath = resolve(projectRoot, OUTPUT_FILE);
  try {
    const raw = await readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Map();

    return new Map(
      parsed
        .filter((entry): entry is PermissionCatalogEntry => {
          return Boolean(entry && typeof entry === 'object' && 'title' in entry && typeof entry.title === 'string');
        })
        .map((entry) => [entry.title, entry]),
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }
}

function mergeCatalog(
  existingCatalog: Map<string, PermissionCatalogEntry>,
  usages: PermissionUsage[],
): PermissionCatalogEntry[] {
  const byPermission = new Map<string, PermissionUsage[]>();
  for (const usage of usages) {
    const entries = byPermission.get(usage.permission) ?? [];
    entries.push(usage);
    byPermission.set(usage.permission, entries);
  }

  const names = Array.from(byPermission.keys()).sort();

  return names.map((name) => {
    const existing = existingCatalog.get(name);
    return {
      id: existing?.id ?? slugifyPermissionId(name),
      title: existing?.title ?? name,
      scopeFor: existing?.scopeFor ?? [],
      scopeLevel: existing?.scopeLevel ?? [],
      acquisitionType: existing?.acquisitionType ?? 'assignment',
      approvalPolicy: existing?.approvalPolicy ?? 'none',
      rules: existing?.rules ?? null,
      status: existing?.status ?? null,
      tag: existing?.tag ?? null,
      usages: byPermission.get(name) ?? [],
    };
  });
}

function warnOnDuplicates(usages: PermissionUsage[], warnings: Warning[]) {
  const seen = new Set<string>();
  for (const usage of usages) {
    const key = buildDuplicateKey(usage);
    if (seen.has(key)) {
      warnings.push({
        file: usage.file,
        line: usage.line,
        column: usage.column,
        message: `Duplicate identical permission usage found for "${usage.permission}".`,
      });
    }
    seen.add(key);
  }
}

export async function mapPermission() {
  const scanner = createProjectScanner();
  const result: ScanResult = {
    filesScanned: scanner.sourceFiles.length,
    usages: [],
    warnings: [],
  };

  for (const sourceFile of scanner.sourceFiles) {
    const scanned = scanSourceFile(scanner.projectRoot, sourceFile);
    result.usages.push(...scanned.usages);
    result.warnings.push(...scanned.warnings);
  }

  warnOnDuplicates(result.usages, result.warnings);

  const existingCatalog = await readExistingCatalog(scanner.projectRoot);
  const output = mergeCatalog(existingCatalog, result.usages);
  const outputPath = resolve(scanner.projectRoot, OUTPUT_FILE);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  const uniquePermissions = new Set(result.usages.map((usage) => usage.permission));

  console.log('✓ Permissions mapped successfully');
  console.log('');
  console.log(`Files scanned: ${result.filesScanned}`);
  console.log(`Permission usages: ${result.usages.length}`);
  console.log(`Unique permissions: ${uniquePermissions.size}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log('Output:');
  console.log(OUTPUT_FILE);

  if (result.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const warning of result.warnings) {
      console.log(`- ${warning.file}:${warning.line}:${warning.column} ${warning.message}`);
    }
  }
}
