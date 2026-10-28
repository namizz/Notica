# 2. Render

Render hosts the **free-tier demo estate**: right for cost-free public
demonstration, wrong for paying traffic. No database durability past 30 days,
no Redis persistence, cold starts measured in tens of seconds.

## Topology

```text
                    Internet
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌──────────────────┐        ┌──────────────────────┐
│ Static Site      │  REST  │ Web Service          │
│ notica-web       │───────►│ notica-api           │
│ apps/web/out/    │   WS   │ APP_ROLE unset = all │
└──────────────────┘◄──────►│ API + gateway + worker│
                            └──────┬──────┬────────┘
                                   │      │
                       ┌───────────▼─┐  ┌─▼──────────────┐
                       │ PostgreSQL   │  │ Key Value      │
                       │ FREE —       │  │ (Redis) FREE — │
                       │ EXPIRES 30d  │  │ no persistence │
                       └──────────────┘  └────────────────┘
```

One service, so `APP_ROLE` stays unset and the single process runs both the API
and the delivery worker. Splitting the roles needs two services; on the free
tier it buys nothing.

## Blueprint

`render.yaml` is **not currently committed** — the estate is click-configured
and not reproducible. Commit this at the repository root:

```yaml
databases:
  - name: notica-postgres
    databaseName: notica
    user: notica
    plan: free            # deleted 30 days after creation — see below
    postgresMajorVersion: "16"

services:
  - type: redis
    name: notica-keyvalue
    plan: free
    maxmemoryPolicy: noeviction   # required: BullMQ must not lose job keys
    ipAllowList: []               # internal only

  - type: web
    name: notica-api
    runtime: node
    plan: free
    region: frankfurt
    rootDir: .
    healthCheckPath: /health
    buildCommand: >-
      corepack enable &&
      pnpm install --frozen-lockfile &&
      pnpm --filter api exec prisma generate &&
      pnpm --filter api run build
    preDeployCommand: pnpm --filter api exec prisma migrate deploy
    startCommand: pnpm --filter api run start:prod
    envVars:
      - key: NODE_VERSION
        value: "20"
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: notica-postgres
          property: connectionString
      - key: REDIS_URL
        fromService:
          type: redis
          name: notica-keyvalue
          property: connectionString
      - key: FRONTEND_URL
        value: https://notica-web.onrender.com
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_REFRESH_SECRET
        generateValue: true
      - key: CLIENT_TOKEN_SECRET
        generateValue: true
      # Set these in the dashboard, never in the blueprint:
      - { key: GOOGLE_CLIENT_ID, sync: false }
      - { key: GOOGLE_CLIENT_SECRET, sync: false }
      - { key: GOOGLE_CALLBACK_URL, sync: false }
      - { key: GITHUB_CLIENT_ID, sync: false }
      - { key: GITHUB_CLIENT_SECRET, sync: false }
      - { key: GITHUB_CALLBACK_URL, sync: false }
      - { key: VAPID_PUBLIC_KEY, sync: false }
      - { key: VAPID_PRIVATE_KEY, sync: false }
      - { key: VAPID_SUBJECT, sync: false }
      - { key: SMTP_HOST, sync: false }
      - { key: SMTP_PORT, sync: false }
      - { key: SMTP_USER, sync: false }
      - { key: SMTP_PASS, sync: false }
      - { key: SMTP_FROM, sync: false }

  - type: web
    name: notica-web
    runtime: static
    rootDir: .
    buildCommand: >-
      corepack enable &&
      pnpm install --frozen-lockfile &&
      pnpm --filter web run build
    staticPublishPath: apps/web/out
    envVars:
      - key: NODE_VERSION
        value: "20"
      - key: NEXT_PUBLIC_API_URL
        value: https://notica-api.onrender.com
      - key: NEXT_PUBLIC_WS_URL
        value: https://notica-api.onrender.com
      - key: NEXT_PUBLIC_RENDER
        value: "true"
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
```

`generateValue: true` makes Render mint the three signing secrets: they satisfy
the ≥32-character check and never enter git. Do not re-generate them casually —
see the rotation-impact table in [1-description.md](./1-description.md#rotation-impact).

## First deploy

1. `New → Blueprint`, point at the repository. Render provisions PostgreSQL,
   Key Value, the API and the static site.
2. **Record the PostgreSQL expiry date** — creation + 30 days. Put it on a
   calendar now, with a reminder at day 20.
3. Generate VAPID keys once: `npx web-push generate-vapid-keys`. Store them as
   environment variables and keep an offline copy — losing them kills every
   push subscription.
4. Register the OAuth applications against the deployed URLs:
   - Google: `https://notica-api.onrender.com/auth/google/callback`
   - GitHub: `https://notica-api.onrender.com/auth/github/callback`
   Both must be HTTPS or the API refuses to boot.
5. Set `FRONTEND_URL` to the static site origin with **no path**.
   `https://notica-web.onrender.com` is accepted; `https://…/dashboard` is not.
6. Confirm the pre-deploy migration ran, then run the smoke checks below.

## Free-tier constraints

| Constraint | Effect | Mitigation |
| --- | --- | --- |
| **PostgreSQL deleted after 30 days** | total data loss | The rotation below |
| Web service **spins down after ~15 min idle** | 30–60 s cold start | `apps/web/src/lib/api-wakeup.ts` polls `/health` for up to 90 s before the first API call, gated on `NEXT_PUBLIC_RENDER=true` |
| Key Value has **no persistence guarantee** | queued jobs lost on restart | Notifications are persisted before enqueue, so rows survive as `PENDING`/`PROCESSING`. **No requeue tool exists yet** — see [4-operations.md](./4-operations.md#open-gaps) |
| Single instance, 512 MB / 0.1 CPU | API and worker share one event loop | Accept here; split roles on AWS |

## Smoke checks

```bash
API=https://notica-api.onrender.com

# Liveness — also wakes a spun-down instance, so allow up to 90 s
curl -fsS --max-time 90 "$API/health"

# Readiness — must report database: up, redis: up
curl -fsS "$API/health/ready" | grep -q '"status":"ready"'

# Swagger and the browser SDK are served
curl -fsS -o /dev/null -w '%{http_code}\n' "$API/api-docs"
curl -fsS -o /dev/null -w '%{http_code}\n' "$API/sdk/notica.js"

# CORS rejects unknown origins
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://evil.example' "$API/health"
```

Then, through the dashboard:

1. Register a user; confirm the password-reset email arrives (or is
   console-logged when SMTP is unset).
2. Create a project and copy the API key — **shown exactly once**.
3. `POST /notifications` with `channel: "IN_APP"` while the live console is
   open. Confirm the log stream and the `notification_deliveries` row.
4. Subscribe to Web Push in a browser, send `channel: "WEB_PUSH"`, confirm
   delivery and that a dead subscription is pruned (404/410 deletes the token).
5. Send `channel: "EMAIL"`; expect `SUCCESS` with SMTP configured, `SIMULATED`
   without.

---

# Monthly PostgreSQL rotation

**The highest-risk recurring operation in this estate.**

Render's free PostgreSQL instance is **permanently deleted 30 days after
creation**. No grace period, no post-deletion recovery. Every dashboard user,
project, API key hash, recipient, notification and device token lives there.

Dump → provision → restore → rewire → verify → decommission. Budget 30–45
minutes, of which 5–15 is API downtime.

## Schedule

Run on **day 25–27**. Never days 29–30: if the restore fails you want days of
slack, not hours.

```text
Day 0     instance created, expiry = day 30
Day 1-24  weekly verification dumps — do not skip these
Day 25    ROTATION WINDOW  ◄── do the work here
Day 27    hard deadline
Day 30    deleted by Render, unrecoverable
```

## Prerequisites

- `pg_dump`, `pg_restore` and `psql` **at or above the server's major version**.
  Render free instances currently run PostgreSQL 16; a 15 client refuses the
  dump. Check with `psql "$OLD_DATABASE_URL" -c 'SHOW server_version;'`.
- Both connection strings: **external** (host ends in `.render.com`) for your
  workstation, **internal** for the service's `DATABASE_URL`.
- An encrypted location for dump files. A dump contains bcrypt password hashes,
  TOTP secrets, OAuth provider IDs, refresh-token hashes and API key hashes.
  **Never** commit one or leave it world-readable.

## Step 1 — dump

```bash
set -euo pipefail

OLD_DATABASE_URL='postgresql://notica:…@dpg-xxxx-a.frankfurt-postgres.render.com/notica'
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="notica-${STAMP}.dump"

pg_dump "$OLD_DATABASE_URL" \
  --format=custom --no-owner --no-acl --verbose --file="$OUT"

# A dump you have not verified is not a backup.
pg_restore --list "$OUT" > "${OUT}.toc"
grep -c 'TABLE DATA' "${OUT}.toc"      # expect 9
sha256sum "$OUT" > "${OUT}.sha256"
```

`--no-owner --no-acl` matters: the new instance has a different role name, and
without them the restore errors on every object's ownership.

Expect nine tables: the eight Prisma models plus **`_prisma_migrations`**.
That last one is essential — it carries the applied-migration history, so
`prisma migrate deploy` against the restored database is correctly a no-op
instead of trying to re-create populated tables.

Record row counts to compare after the restore:

```bash
psql "$OLD_DATABASE_URL" -At -F',' -c "
  SELECT 'tenants', count(*) FROM tenants
  UNION ALL SELECT 'projects', count(*) FROM projects
  UNION ALL SELECT 'dashboard_users', count(*) FROM dashboard_users
  UNION ALL SELECT 'user_sessions', count(*) FROM user_sessions
  UNION ALL SELECT 'recipient_users', count(*) FROM recipient_users
  UNION ALL SELECT 'notifications', count(*) FROM notifications
  UNION ALL SELECT 'notification_deliveries', count(*) FROM notification_deliveries
  UNION ALL SELECT 'device_tokens', count(*) FROM device_tokens
  UNION ALL SELECT '_prisma_migrations', count(*) FROM _prisma_migrations
  ORDER BY 1;" | tee "counts-before-${STAMP}.csv"
```

## Step 2 — provision and restore

1. **Create the new instance.** `New → PostgreSQL`, free plan, **same region**
   as the API, same major version. Name it for the cycle, e.g.
   `notica-postgres-2026-11`. Note its expiry date immediately.

2. **Stop writes.** Suspend `notica-api`. This is the downtime window.
   Anything the API accepts between the dump and the cutover exists only on the
   instance you are about to abandon, and disappears with no error. If the gap
   is unavoidable, re-dump immediately before cutover rather than reusing the
   day-25 dump.

3. **Restore.**

```bash
NEW_DATABASE_URL='postgresql://notica:…@dpg-yyyy-a.frankfurt-postgres.render.com/notica'

sha256sum -c "${OUT}.sha256"        # verify before trusting the file

pg_restore \
  --dbname="$NEW_DATABASE_URL" \
  --no-owner --no-acl \
  --single-transaction --exit-on-error \
  --verbose "$OUT"
```

`--single-transaction` with `--exit-on-error` is deliberate: either everything
lands or nothing does. A half-restored database the API happily connects to is
far worse than a failed restore.

4. **Reconcile row counts** against `counts-before-*.csv`. Any mismatch stops
   the rotation.

5. **Confirm migration state.**

```bash
DATABASE_URL="$NEW_DATABASE_URL" pnpm --filter api exec prisma migrate status
# Expected: "Database schema is up to date!"
```

If it reports pending migrations, `_prisma_migrations` did not come across. Do
**not** run `migrate deploy` — restore that table specifically:

```bash
pg_restore --dbname="$NEW_DATABASE_URL" --table=_prisma_migrations --data-only "$OUT"
```

## Step 3 — cut over and verify

1. Update `DATABASE_URL` on `notica-api` to the **internal** connection string
   of the new instance. If `render.yaml` is the source of truth, update
   `fromDatabase.name` and re-sync the blueprint.
2. Resume the service and watch the boot logs — a malformed URL fails
   validation and crash-loops rather than starting degraded.
3. `curl -fsS "$API/health/ready"` → `database: up, redis: up`.
4. Checks that actually exercise restored data:
   - Log in as an existing dashboard user — proves password hashes and sessions
     survived.
   - Open a project and confirm the API key **prefix** still displays. The raw
     key is unrecoverable by design; the prefix proves the row restored.
   - `POST /notifications` with an **existing** project API key — proves the
     `api_key_hash` lookup still matches. This is the single best end-to-end
     signal.
   - Confirm notification history renders and the live console streams.
5. **Keep the old instance until every check passes**, then let it expire.
   Archive the dump and checksum for at least one further cycle.

**Rollback:** until step 5 completes, point `DATABASE_URL` back at the old
instance and resume. This only works while the old instance still exists —
which is why the window is day 25, not day 29.

## Pitfalls

| Pitfall | Consequence | Avoidance |
| --- | --- | --- |
| `pg_dump` older than the server | dump refuses to run | Match or exceed the server major version |
| Dumping without stopping writes | notifications in the gap are lost | Suspend the API, or re-dump before cutover |
| Omitting `--no-owner --no-acl` | restore errors on every object | Always pass both |
| Losing `_prisma_migrations` | `migrate deploy` re-creates populated tables | Verify with `migrate status` before cutover |
| Using the **external** URL as the service's `DATABASE_URL` | works, but every query crosses the public internet | Use the internal URL for the service |
| Deleting the old instance early | no rollback path | Keep it to expiry |
| Unencrypted dump | leaks hashes, TOTP secrets, OAuth IDs | Encrypt at rest, never commit |
| Forgetting Redis | queued-but-unprocessed jobs vanish | Drain the queue before suspending: watch the dashboard console until nothing is waiting |

## Weekly verification dumps

A rotation that first exercises `pg_dump` on day 25 discovers its problems on
day 25. Dump weekly, and **restore at least one into local Docker** to prove
the file is usable:

```bash
docker compose up -d postgres
pg_restore --dbname='postgresql://notica:password@localhost:5433/notica_dev' \
  --clean --if-exists --no-owner --no-acl --single-transaction "$OUT"
```

A dump that has never been restored is an untested assumption.

## Automating the dump

The dump automates; the provision/restore/cutover needs a human because free
instance creation has no stable API.

```yaml
name: Backup Render PostgreSQL
on:
  schedule:
    - cron: '17 3 * * 1'       # Mondays 03:17 UTC
  workflow_dispatch:

jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - name: Install PostgreSQL 16 client
        run: |
          sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
          sudo apt-get update && sudo apt-get install -y postgresql-client-16

      - name: Dump and verify
        env:
          DATABASE_URL: ${{ secrets.RENDER_DATABASE_URL_EXTERNAL }}
        run: |
          set -euo pipefail
          STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
          pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
            --file="notica-${STAMP}.dump"
          pg_restore --list "notica-${STAMP}.dump" | grep -c 'TABLE DATA'

      - name: Upload to S3, encrypted
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.BACKUP_AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.BACKUP_AWS_SECRET_ACCESS_KEY }}
        run: |
          aws s3 cp notica-*.dump "s3://notica-backups/render/" \
            --sse aws:kms --sse-kms-key-id "${{ secrets.BACKUP_KMS_KEY_ID }}"
```

This workflow holds a credential with full read access to production data.
Scope the S3 key to `PutObject` on that one prefix, enable bucket versioning
and a lifecycle rule, and rotate the Render credential each cycle — it changes
anyway when the instance rotates.

> **The structural fix is to stop rotating.** This runbook exists only because
> the database is free-tier. A paid Render instance, or an RDS instance reachable
> from Render, replaces the whole monthly operation with automated point-in-time
> recovery. If Notica holds any data worth keeping, that is the correct spend.
