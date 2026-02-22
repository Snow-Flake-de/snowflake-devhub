# Snowflake DevHub Architecture

## Module Boundaries

Server modules are now separated by responsibility:

- `server/src/core`
  - Platform settings (DB-backed), maintenance controls, and foundational runtime behavior.
- `server/src/security`
  - ACL/permission engine, rate limiting, security headers, and audit logging.
- `server/src/community`
  - Community mode isolation and public-library gating.
- `server/src/routes`
  - API route orchestration. Route handlers depend on `core/security/community` modules instead of embedding access logic directly.
- `server/src/repositories`
  - Data persistence layer only.
- `server/src/services`
  - Business logic layer for snippets/users.

## Security Model

- Central RBAC roles:
  - `SUPER_ADMIN`
  - `ADMIN`
  - `MODERATOR`
  - `USER`
  - `READ_ONLY`
- Centralized permission checks live in:
  - `server/src/security/permissions.js`
  - `server/src/security/aclMiddleware.js`
- No environment-only role grants are used for admin authorization anymore.

## Configuration Model

Runtime controls moved from env-only flags to DB-backed settings:

- `registration.mode` (`OPEN`/`APPROVAL`/`CLOSED`)
- `community.mode` (`ON`/`OFF`)
- `maintenance.mode` (`ON`/`OFF`)
- lockout and rate-limit settings
- feature flags in `feature_flags`

## Data Layer Foundation

New schema foundations include:

- User lifecycle and security fields:
  - `role`, `status`, `failed_login_attempts`, `locked_until`, `session_version`, `force_password_reset`
- Snippet visibility model:
  - `visibility` (`PRIVATE`/`TEAM`/`SHARED`/`PUBLIC`)
- Platform control tables:
  - `system_settings`
  - `feature_flags`
  - `audit_logs`

## Future-Ready Hooks

- `feature_flags` and module boundaries enable safe extension for:
  - AI module injection
  - PostgreSQL migration adapter
  - multi-tenant scoping layer
  - billing and entitlement modules
  - white-label branding overlays
