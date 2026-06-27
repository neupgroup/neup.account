# Auth Services

Chapter index for authentication and session service code.

## Source Documents

- [`grant.ts`](grant.ts)
- [`session.ts`](session.ts)
- [`silent-sso.ts`](silent-sso.ts)
- [`accountJwt.ts`](accountJwt.ts)
- [`bridgeToken.ts`](bridgeToken.ts)
- [`access.ts`](access.ts)
- [`sign.ts`](sign.ts)
- [`verify.ts`](verify.ts)
- [`whoami.ts`](whoami.ts)
- [`permission.ts`](permission.ts)
- [`appTokenAuth.ts`](appTokenAuth.ts)

## Shared Rules

- Keep folder-level ownership notes here.
- Keep route-specific HTTP contract docs in `app/bridge/**/route.ts`.
- Keep session, token, grant, and origin-validation behavior in the owning service file.

::neup.documentation::services-auth-folder
::title Auth Services Folder Documentation

Shared entry point for auth service documentation.

::public

Use this README as the chapter index. The live documentation should sit in the source files linked above.

::public end

::private

This folder should stay decentralized. If behavior changes in one auth flow, update the owning source file instead of growing this README into a parallel manual.

::private end

::end
