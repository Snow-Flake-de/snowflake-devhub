# Upgrade Instructions

## 1) Backup First

Always back up your persistent directory before upgrade:

```bash
sudo systemctl stop docker
sudo rsync -a /home/bytestash/ /home/bytestash-backup-$(date +%F)/
sudo systemctl start docker
```

If running only Docker Compose, stopping just the stack is enough:

```bash
docker compose down
```

## 2) Pull and Rebuild

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

## 3) Migration Verification

On first boot, app startup applies migration `v2.0.0-foundation-security`.

Verify logs:

```bash
docker compose logs -f bytestash
```

Expected signals:

- database initialized
- migration completed successfully
- server listening on configured port

## 4) Post-upgrade Checks

- Open `/api/auth/config` and verify:
  - `registrationMode`
  - `communityMode`
  - `maintenanceMode`
- Login as admin
- Open Admin -> Settings and confirm persisted values
- Open Admin -> Audit and verify recent events

## 5) New Environment Controls

- `BYTESTASH_DATA_PATH` (default `/home/bytestash` in compose)
- `BYTESTASH_DB_PATH` (optional explicit db file path)
- `ALLOWED_HOSTS` should include `snow-flake-systems.de`
