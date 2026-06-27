# Neup.Account

Authentication, account, delegation, and application-access services for the Neup ecosystem.

## Project Structure

- `app/` - Next.js routes, pages, and bridge endpoints.
- `services/` - server-side auth, application, profile, and access logic.
- `core/` - shared auth, database, and infrastructure helpers.
- `prisma/` - schema, generated client, migrations, and seed support.
- `grpc/` - gRPC definitions and services.

## Documentation

This repo follows the Neup documentation standard in [`documentation.guide.md`](documentation.guide.md). Documentation lives next to the code it describes.

- [Bridge Overview](app/bridge/README.md)
- [Bridge API v1](app/bridge/api.v1/README.md)
- [Bridge Auth API](app/bridge/api.v1/auth/README.md)
- [Bridge Application API](app/bridge/api.v1/application/README.md)
- [Silent SSO](app/bridge/silent.v1/README.md)
- [Auth Services](services/auth/README.md)
- [Application Services](services/applications/README.md)

::neup.documentation::project-neup-account
::title Neup.Account Project Documentation

Authentication and delegated-access service for Neup applications and third-party integrations.

::public

Use the bridge route documentation under `app/bridge` for integration contracts and the service READMEs under `services/` for implementation ownership.

::public end

::private

The old centralized `docs/` tree has been removed. New documentation should be added in source comments or folder-level `README.md` files beside the owning code.

::private end

::end
