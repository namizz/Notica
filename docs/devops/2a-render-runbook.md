# Render Runbook (Simple)

The short operator version. For background, architecture diagrams and the full
reasoning behind each step, see [2-render.md](./2-render.md).

Two jobs live here: **deploy it once**, and **rotate PostgreSQL every month**.

---

## What runs on Render

| Service | Type | Plan |
| --- | --- | --- |
| `notica-api` | Web service (API + worker in one process) | Free |
| `notica-web` | Static site | Free |
| `notica-postgres` | PostgreSQL | Free — **deleted after 30 days** |
| `notica-keyvalue` | Key Value (Redis) | Free — no persistence |

---

## Deploy

1. **New → Blueprint**, point at the repo. `render.yaml` provisions all four.
2. Set the secrets Render cannot generate (dashboard → Environment):
   OAuth (`GOOGLE_*`, `GITHUB_*`), push (`VAPID_*`), mail (`SMTP_*`),
   and `ENCRYPTION_KEY` (see below).
3. Generate VAPID keys once: `npx web-push generate-vapid-keys`. Keep an
   offline copy — losing them kills every push subscription.
4. Put the PostgreSQL expiry date on a calendar: **creation + 30 days**, with
   a reminder at day 20.

`JWT_SECRET`, `JWT_REFRESH_SECRET` and `CLIENT_TOKEN_SECRET` are minted by
Render via `generateValue: true`. Don't regenerate them casually — it logs
every user out.

### Keys that must survive a rotation

| Variable | Lose it and… |
| --- | --- |
| `ENCRYPTION_KEY` | every stored 2FA secret becomes undecryptable |
| `VAPID_PRIVATE_KEY` | every push subscription dies |
| `JWT_REFRESH_SECRET` | every session is invalidated |

`ENCRYPTION_KEY` is the one to be careful with. It encrypts `two_factor_secret`
at rest, so the **ciphertext lives in the database but the key lives in Render's
environment**. A `pg_dump` carries the data and not the key. Restore into a new
instance with a different `ENCRYPTION_KEY` and every 2FA user is locked out —
they'd each need recovery codes to get back in.

**So: never change `ENCRYPTION_KEY` during a database rotation.** It is not
part of the rotation. Copy it across unchanged.

---

## Monthly PostgreSQL rotation

Render deletes the free database 30 days after creation. No grace period, no
recovery. **Run this on day 25**, not day 29 — if the restore fails you want
days of slack.

Budget 30–45 minutes, with 5–15 minutes of API downtime.

### Prerequisites

- `pg_dump` / `pg_restore` **at or above** the server version
  (check: `psql "$OLD" -c 'SHOW server_version;'` — currently 16).
- Both connection strings: **external** (ends `.render.com`) for your laptop,
  **internal** for the service's `DATABASE_URL`.
- Somewhere encrypted to keep the dump. It contains password hashes, 2FA
  ciphertext and API key hashes. Never commit one.

### 1. Dump

```bash
set -euo pipefail

OLD='postgresql://notica:…@dpg-xxxx-a.frankfurt-postgres.render.com/notica'
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="notica-${STAMP}.dump"

pg_dump "$OLD" --format=custom --no-owner --no-acl --file="$OUT"

# A dump you haven't verified is not a backup.
pg_restore --list "$OUT" | grep -c 'TABLE DATA'   # expect 9
sha256sum "$OUT" > "${OUT}.sha256"
```

`--no-owner --no-acl` matters: the new instance has a different role name and
the restore errors on every object without them.

Nine tables = 8 Prisma models + `_prisma_migrations`. That last one carries
migration history, so `prisma migrate deploy` correctly becomes a no-op later
instead of trying to rebuild populated tables.

### 2. Create the new instance

**New → PostgreSQL**, free plan, **same region and major version**. Name it for
the cycle: `notica-postgres-2026-11`. Note its expiry immediately.

### 3. Stop writes

Suspend `notica-api`. This starts the downtime window.

Anything the API accepts between the dump and the cutover exists only on the
instance you're abandoning, and vanishes with no error. If time passed since
the dump, **re-dump now** rather than reusing the day-25 file.

### 4. Restore

```bash
NEW='postgresql://notica:…@dpg-yyyy-a.frankfurt-postgres.render.com/notica'

sha256sum -c "${OUT}.sha256"          # verify before trusting it

pg_restore --dbname="$NEW" \
  --no-owner --no-acl \
  --single-transaction --exit-on-error "$OUT"
```

`--single-transaction --exit-on-error` is deliberate: everything lands or
nothing does. A half-restored database the API happily connects to is worse
than a failed restore.

Then confirm migration state:

```bash
DATABASE_URL="$NEW" pnpm --filter api exec prisma migrate status
# Expected: "Database schema is up to date!"
```

If it reports pending migrations, `_prisma_migrations` didn't come across.
**Don't** run `migrate deploy` — restore that table on its own:

```bash
pg_restore --dbname="$NEW" --table=_prisma_migrations --data-only "$OUT"
```

### 5. Cut over

1. Update `DATABASE_URL` on `notica-api` to the new instance's **internal**
   string. If `render.yaml` is source of truth, update `fromDatabase.name`
   and re-sync.
2. Leave every other variable alone — especially `ENCRYPTION_KEY`.
3. Resume the service, watch the boot logs. A bad URL crash-loops rather than
   starting degraded, so a clean boot is real signal.

### 6. Verify

```bash
API=https://notica-api.onrender.com
curl -fsS --max-time 90 "$API/health"
curl -fsS "$API/health/ready" | grep -q '"status":"ready"'
```

Then the checks that actually exercise restored data:

- Log in as an existing user → password hashes and sessions survived.
- Log in as a user **with 2FA enabled** → `ENCRYPTION_KEY` still decrypts.
- `POST /notifications` with an existing project API key → the `api_key_hash`
  lookup still matches. Best single end-to-end signal.
- Open the dashboard, confirm notification history renders.

### 7. Decommission

Keep the old instance until every check passes, then let it expire. Archive
the dump and checksum for one more cycle.

**Rollback:** until step 7, point `DATABASE_URL` back at the old instance and
resume. This only works while the old instance exists — which is the whole
reason the window is day 25.

---

## Weekly verification dumps

A rotation that first exercises `pg_dump` on day 25 discovers its problems on
day 25. Dump weekly and restore at least one into local Docker:

```bash
docker compose up -d postgres
pg_restore --dbname='postgresql://notica:password@localhost:5433/notica_dev' \
  --clean --if-exists --no-owner --no-acl --single-transaction "$OUT"
```

A dump that has never been restored is an untested assumption.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| First request after idle times out | Free tier spins down after ~15 min | Expected: 30–60 s cold start. `api-wakeup.ts` polls `/health` for 90 s |
| API crash-loops on deploy | Missing or weak env var | Read the boot logs — validation names the variable |
| 2FA users locked out after rotation | `ENCRYPTION_KEY` changed | Restore the old value; if lost, recovery codes are the only way back |
| `pg_dump` version mismatch | Client older than server | Install client ≥ server major |
| Queued notifications vanish | Redis has no persistence | Rows persist as `PENDING`. Drain the queue before suspending |

---

## The structural fix

This runbook exists only because the database is free-tier. A paid Render
instance replaces the entire monthly operation with automated point-in-time
recovery. If Notica ever holds data worth keeping, that's the correct spend.
