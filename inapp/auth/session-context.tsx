/*
::neup.documentation::inapp-auth-session-context
::title In-App Auth Session Context Compatibility Export

Compatibility export for the canonical core session provider.

::public

Use `@/core/providers/session` for new imports. This file re-exports the same provider and hook so existing client components keep working.

::public end

::private

The account app historically imported its client session context from `inapp/auth`. The implementation now lives in `core/providers/session.tsx`, so this file remains a thin migration shim.

::private end

::end
*/

export { SessionProvider, useSession } from '@/core/providers/session';
