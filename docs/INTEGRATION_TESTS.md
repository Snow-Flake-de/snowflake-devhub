# Integration Test Instructions

## Test Scope

Integration suite file:

- `server/test/integration/foundation-security.test.js`

It covers:

- first-user bootstrap to `SUPER_ADMIN`
- registration mode `APPROVAL` flow
- lockout + admin unlock flow
- community mode endpoint gating
- audit log generation

## Run Requirements

Server tests require a working `better-sqlite3` install for your platform.

On Debian 12 (recommended for this project):

```bash
sudo apt update
sudo apt install -y build-essential python3
cd server
npm install
npm test
```

## Notes

- Tests start a real server process on port `5099`
- Tests use an isolated temp data directory
- No external services are required
