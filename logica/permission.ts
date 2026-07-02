/*
::neup.documentation::logica-permission-helper

Creates static permission declaration records for routes, pages, and services.

The helper preserves the existing `{ id, scopeFor, tag }` shape so auth and
mapping code can consume one consistent declaration format while source files
move to explicit `permission()` calls.

::end
*/

export type PermissionDeclaration = {
  id: string;
  scopeFor: string;
  tag: string;
};

export function permission(id: string, scopeFor: string, tag = ''): PermissionDeclaration {
  return { id, scopeFor, tag };
}
