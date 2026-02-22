# Admin Guide

## Dashboard

Use the Admin Dashboard for:

- User totals (internal/OIDC/pending/suspended/locked)
- Snippet totals (public/private)
- Active API keys and shares
- Risk alerts

## User Management

User actions are available in the Users tab and API:

- Approve user (`status=ACTIVE`)
- Suspend user (`status=SUSPENDED`)
- Change role (`SUPER_ADMIN`/`ADMIN`/`MODERATOR`/`USER`/`READ_ONLY`)
- Unlock account lockout
- Reset all active sessions
- Force password reset
- Delete user

## System Settings

Settings tab allows runtime updates without restart:

- `registration.mode`: `OPEN` / `APPROVAL` / `CLOSED`
- `community.mode`: `ON` / `OFF`
- `maintenance.mode`: `ON` / `OFF`
- Lockout policy (attempts + duration)
- Rate limit policy (auth/public/general/window)
- Feature flags

All changes are audited in `audit_logs`.

## Audit

Audit tab exposes recent events:

- Authentication outcomes
- Role/status changes
- Snippet updates/deletions/visibility changes
- Settings updates
- Admin and moderation actions

Use this as the primary forensic timeline.
