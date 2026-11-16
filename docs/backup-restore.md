# Backup and Restore

Tutti Belli keeps data in two places, and they are backed up separately:

| Data                                          | Where          | How it is backed up                                            |
| --------------------------------------------- | -------------- | -------------------------------------------------------------- |
| Everything in the app (users, ensembles, ...) | Turso database | Turso point-in-time recovery, plus branches you create by hand |
| Uploaded files (song files, images)           | Tigris bucket  | Nothing by default; bucket snapshots if you turn them on       |
| Secrets (`JWT_SECRET`, email and DB tokens)   | Fly secrets    | Not backed up. Keep copies in a password manager               |

The examples use the names from this project's own deployment: database `tutti-belli-prod`, Fly app `tutti-belli`. Substitute your own.

## Database

### What Turso keeps for you

Turso can recreate a database as it was at any moment inside the plan's retention window. Check your plan with `turso plan show` and the window on the [pricing page](https://turso.tech/pricing); at the time of writing it is 1 day on the free plan, 10 days on Developer, 30 on Scaler and 90 on Pro.

A restore never overwrites the existing database. It always creates a new one, which you then point the app at.

Point-in-time recovery cannot bring back a database that was deleted, so do not rely on it alone before anything risky.

### Before a risky change

Before a migration that rewrites or deletes data, take a copy that will outlive the retention window:

```bash
turso db create tutti-belli-backup-2026-11-15 --from-db tutti-belli-prod
```

The copy is independent of production from the moment it is created, so writes made afterwards are not in it. Take it right before the change, not hours earlier. Delete it once you are sure the change is good (`turso db destroy <name>`); copies count toward the plan's database limit.

For a copy kept off Turso entirely:

```bash
turso db export tutti-belli-prod
```

This writes a local SQLite file. It contains every user's email and password hash, so store it like a secret.

### Restoring

1. Create a database from the moment you want to go back to (RFC 3339 time, inside the retention window), or use a backup copy you made earlier and skip this step:

   ```bash
   turso db create tutti-belli-restored --from-db tutti-belli-prod --timestamp 2026-11-15T09:00:00-08:00
   ```

2. Check that it holds what you expect before switching anything:

   ```bash
   turso db shell tutti-belli-restored "select count(*) from User"
   ```

3. Get its URL and a new token:

   ```bash
   turso db show tutti-belli-restored --url
   ```

   ```bash
   turso db tokens create tutti-belli-restored
   ```

4. Point the app at it. Setting secrets restarts the app:

   ```bash
   fly secrets set ASTRO_DB_REMOTE_URL="libsql://..." ASTRO_DB_APP_TOKEN="..." -a tutti-belli
   ```

5. If the restore point is older than the newest migration, deploy again (`./deploy.sh`). The release command applies any migrations the restored database is missing.

6. Update `TURSO_MAIN_DB` in the GitHub Actions and Dependabot secrets so PR previews branch from the restored database.

7. Keep the old database until you are sure, then `turso db destroy` it.

Anything written after the restore point is gone from the restored database. If only some rows were lost, restore to a scratch database and copy those rows across by hand instead of switching production.

## Uploaded files

The database stores only the path of each uploaded file. Restoring the database does not restore files, and a file deleted in the app is deleted from the bucket.

Tigris can keep history for a bucket if snapshots are enabled on it. A bucket created with `fly storage create` does not have them on. To turn them on for an existing bucket, open the bucket in the Tigris dashboard and switch it to Snapshot under **Bucket Settings → Storage Settings** (see [Tigris snapshots and forks](https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/)). Without that, a deleted file cannot be recovered.

After a database restore, rows may point at files that were deleted since the restore point; those downloads return 404 until the file is uploaded again.

## Restore drill

Run this now and then so the steps are known to work before they are needed. It touches nothing in production:

```bash
turso db create tutti-belli-drill --from-db tutti-belli-prod --timestamp "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)"
```

```bash
turso db shell tutti-belli-drill "select count(*) from User"
```

```bash
turso db destroy tutti-belli-drill --yes
```

To go further, run the app locally against the drill database by putting its URL and a token in `.env` and running `pnpm dev:remote`.
