# Rollback Strategy

## Trigger Conditions

Rollback if any of these occur after deployment:

- authentication failures for valid users
- unexpected 5xx spikes
- migration failure in startup logs
- admin settings/audit endpoints failing

## Fast Rollback (Container Image)

1. Stop current stack:

```bash
docker compose down
```

2. Checkout previous release tag/commit.
3. Rebuild and restart:

```bash
docker compose build --no-cache
docker compose up -d
```

## Data Rollback

If schema/data state is corrupted, restore persistent backup:

```bash
docker compose down
sudo rm -rf /home/bytestash/*
sudo rsync -a /home/bytestash-backup-YYYY-MM-DD/ /home/bytestash/
docker compose up -d
```

## Validation After Rollback

- `/api/auth/config` reachable
- admin login works
- snippets readable
- no migration errors in logs

## Recommendation

Perform rollback drills in staging before production changes to verify RTO/RPO targets.
