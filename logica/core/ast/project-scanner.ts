/*
::neup.documentation::logica-ast-project-scanner

Shared TypeScript AST project loader for static logic mapping commands.

Commands use this module to read `tsconfig.json`, create a TypeScript program,
and enumerate project source files without executing application code or
running a Next.js build.

::end
*/

import { resolve, relative, sep } from 'node:path';
import ts from 'typescript';

const IGNORED_PATH_PARTS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage']);

export type ProjectScanner = {
  projectRoot: string;
  program: ts.Program;
  sourceFiles: ts.SourceFile[];
};

function isScannableSourceFile(projectRoot: string, sourceFile: ts.SourceFile): boolean {
  if (sourceFile.isDeclarationFile) return false;
  if (!sourceFile.fileName.endsWith('.ts') && !sourceFile.fileName.endsWith('.tsx')) return false;

  const relativePath = relative(projectRoot, sourceFile.fileName);
  if (relativePath.startsWith('..')) return false;

  const parts = relativePath.split(sep);
  return !parts.some((part) => IGNORED_PATH_PARTS.has(part));
}

export function createProjectScanner(projectRoot = process.cwd()): ProjectScanner {
  const tsconfigPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!tsconfigPath) {
    throw new Error(`Unable to find tsconfig.json from ${projectRoot}`);
  }

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    resolve(tsconfigPath, '..'),
    {
      noEmit: true,
      skipLibCheck: true,
    },
    tsconfigPath,
  );

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });

  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => isScannableSourceFile(projectRoot, sourceFile));

  return {
    projectRoot,
    program,
    sourceFiles,
  };
}
