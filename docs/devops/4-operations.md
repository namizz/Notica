# 4. Operations

Scaling status, CI/CD, observability, backups, security, and what is still
outstanding.

## Scaling status

The architecture was always sound — stateless handlers, a durable queue between
ingestion and delivery, provider abstractions, tenant-scoped queries, retry
with exponential backoff. Those are the decisions that are expensive to
retrofit, and they were already right.

As of 2026-10-28 the three changes that blocked running more than one instance
are **done**:

| Change | Status | Where |
| --- | --- | --- |
| Socket.IO Redis adapter | **done** | `apps/api/src/realtime/redis-io.adapter.ts`, wired in `main.ts` |
| Graceful shutdown | **done** | `main.ts` (`enableShutdownHooks`), `prisma.service.ts` (`onModuleDestroy`) |
| API / worker role split | **done** | `APP_ROLE` in `config/environment.ts`, gated in `notifications.module.ts` |

### What the adapter fixed

Socket.IO rooms are local to one Node process. Before the adapter,
`server.to(room).emit(…)` and `fetchSockets()` only saw sockets held by the
instance running the code. On two instances, a delivery job picked up by
instance B could not reach a recipient socket on instance A: the emit was
dropped, `fetchSockets()` returned zero, and the processor recorded
**`SKIPPED`** — a status meaning "the recipient was offline, this is fine".

A silently wrong status is harder to find than a crash. It presents as
"notifications sometimes don't arrive", with clean logs and a green dashboard,
and it appears exactly when autoscaling adds the second instance.

The adapter puts room membership and emits on Redis pub/sub, which makes both
`emit` and `fetchSockets()` cluster-wide. It reuses the connection settings
that already back BullMQ, so no new infrastructure is needed. If Redis is
unreachable at boot the adapter logs a warning and falls back to process-local
rooms rather than failing silently.

### Role split

One build artifact, three roles — see
[1-description.md](./1-description.md#processes-to-run). `APP_ROLE=api` omits
the BullMQ processor so request handling never shares an event loop with SMTP
and Web Push calls; `worker` keeps it. Unset (`all`) preserves the existing
single-service behaviour exactly, so the Render deployment is unaffected.

### Remaining work, in order

1. **Rate limiting is per-instance.** `ThrottlerModule.forRoot([{ ttl: 60000,
   limit: 10 }])` uses the default in-memory storage, so the effective limit is
   10/minute **× instance count**, drifting as you autoscale. 10/minute is also
   the wrong shape for an ingestion API — too loose for login, far too strict
   for a client backend sending order updates. The `PlanType` enum
   (`FREE`/`PRO`/`ENTERPRISE`) exists and nothing reads it. **Fix:**
   Redis-backed throttler storage, per-route limits, ceiling from the tenant's
   plan.
2. **No idempotency keys**, though `docs/2-architecture.md` §11B specifies them.
   A client retrying a timed-out `POST /notifications` sends a **duplicate
   notification**. **Fix:** accept an `Idempotency-Key` header, store
   `(project_id, key) → notification_id` with a TTL, return the original
   response on replay.
3. **No dead-letter queue**, though §11C specifies one. After 3 attempts a job
   lands in BullMQ's `failed` set: nothing alerts, nothing replays, nobody
   knows the notification was lost. **Fix:** a `failed-notifications` queue, an
   alarm on its depth, and a replay endpoint.
4. **The recipient feed is unbounded.** `getRecipientNotifications()` runs
   `findMany` with `orderBy: createdAt desc` and **no `take`**. A recipient
   with 100k notifications returns all of them in one response. This is the
   clearest availability risk in the data layer. **Fix:** cursor pagination
   with a hard maximum.
5. **Dashboard search cannot use an index.** `contains` with
   `mode: 'insensitive'` across `title`, `body` and the joined
   `external_user_id` is an unanchored `ILIKE %…%` — a sequential scan over the
   tenant's notifications. **Fix:** a `pg_trgm` GIN index.
6. **Composite indexes are missing for the hot paths.** The schema indexes
   `tenant_id` and `project_id` separately, but queries filter by project and
   sort by `created_at`. **Fix:** `@@index([projectId, createdAt])` on
   `notifications`, and `@@index([projectId, recipientUserId, createdAt])` for
   the recipient feed.
7. **Connection pooling.** Prisma's default pool is
   `num_physical_cpus × 2 + 1` **per process**. Ten tasks on 2-vCPU hosts want
   ~50 connections; `db.t4g.micro` allows ~85 total, so scaling the API
   exhausts PostgreSQL before CPU. **Fix:**
   `?connection_limit=5&pool_timeout=10` plus RDS Proxy. Size so that
   `tasks × connection_limit` stays well under `max_connections`, leaving
   headroom for migrations and operators.
8. **Unbounded data growth.** Nothing ever removes a row.
   `notification_deliveries` grows *faster* than `notifications` — one row per
   attempt per device. `user_sessions` accumulates a row per login and expired
   sessions are never pruned. **Fix:** per-plan retention, monthly
   `PARTITION BY RANGE (created_at)` so old partitions detach instantly instead
   of deleting millions of rows, and a nightly
   `DELETE FROM user_sessions WHERE expires_at < now()`.

### Scaling dimensions

| Load grows in… | Pressure lands on | Lever |
| --- | --- | --- |
| API requests/sec | API tasks, Prisma pool | More API tasks + RDS Proxy (7) |
| Notifications/sec | queue depth, worker throughput | More worker tasks; raise BullMQ concurrency |
| Concurrent recipients | Socket.IO memory, file descriptors | More API tasks — the Redis adapter makes this safe |
| Notification history | PostgreSQL size, query latency | Indexes, retention, partitioning (4–6, 8) |
| Tenants | nothing structural | Already tenant-scoped; watch noisy neighbours (1) |
| Email volume | SMTP provider limits | SES with a raised quota; a dedicated email queue |
| Web Push volume | push service rate limits | Batch, and honour 429 with backoff |

## CI/CD

### Current state

`.github/workflows/ci.yml` runs on pushes and PRs to `main`: pnpm 10, Node 20,
`pnpm install --frozen-lockfile`, `prisma generate` against a dummy
`DATABASE_URL`, then `pnpm run build`.

**It does not run tests or lint**, despite `docs/6-progress-tracker.md`
claiming "Enforce API tests, frontend lint, and production builds in CI". There
are 12 API test suites (54 tests) and they gate nothing.

### Recommended

```yaml
jobs:
  verify:
    # install + prisma generate as today, then:
    - run: pnpm --filter api run test
    - run: pnpm --filter web run lint
    - run: pnpm run build

  migrate-check:
    services:
      postgres: { image: postgres:16-alpine, env: { … } }
    steps:
      # Prove migrations apply cleanly to an empty database and leave no drift.
      - run: pnpm --filter api exec prisma migrate deploy
      - run: pnpm --filter api exec prisma migrate status
      - run: pnpm --filter api exec prisma migrate diff \
               --from-schema-datamodel prisma/schema.prisma \
               --to-schema-datasource prisma/schema.prisma \
               --exit-code     # non-zero on drift
```

`migrate-check` is the job most worth adding: drift between `schema.prisma` and
the migration history is invisible locally and fails at deploy time, in the one
step you cannot easily roll back.

API lint cannot be enforced yet — see [open gaps](#open-gaps).

## Observability

### What exists

- Nest's `Logger` writing text to stdout from `NotificationsProcessor`,
  `RealtimeGateway` and `RedisIoAdapter`.
- `/health` and `/health/ready`.
- A per-project live activity console in the dashboard, fed by
  `sendLogToProject()` — useful for debugging a tenant's integration, but
  ephemeral and not an operational signal.
- `notification_deliveries` rows, an excellent delivery audit trail and the
  basis for most metrics below.

### What is missing

No metrics endpoint, no tracing, no correlation IDs, no error tracking, no
queue-depth visibility outside the health check. Debugging a production
delivery failure means reading stdout.

Minimum additions:

1. **Structured JSON logging** (`nestjs-pino`) with a per-request correlation
   ID propagated into the job payload, so an API request and its delivery
   attempts can be joined.
2. **Prometheus `/metrics`** (`@willsoto/nestjs-prometheus`): queue depth, job
   duration, delivery outcomes by channel and status, HTTP histograms.
3. **Error tracking** (Sentry or equivalent) with release tagging.
4. **Queue-depth metric** to CloudWatch — needed anyway for worker autoscaling.

### Alerts worth paging on

| Signal | Condition | Why |
| --- | --- | --- |
| `/health/ready` failing | 2 consecutive failures | PostgreSQL or Redis is down |
| BullMQ failed-job count | any increase | Notifications are being lost |
| Queue depth | > 1000 and rising for 5 min | Workers cannot keep up |
| Oldest waiting job | > 5 min | Stalled worker |
| `FAILED` delivery rate | > 5% over 15 min | Provider outage |
| `SKIPPED` in-app rate | sudden spike | Realtime fan-out may be broken — check the Redis adapter connected at boot |
| RDS connections | > 80% of max | Pool exhaustion imminent |
| Redis memory | > 80% | Job keys at risk even under `noeviction` |
| **Render PostgreSQL age** | **> 25 days** | **Rotation window open** — see [2-render.md](./2-render.md#monthly-postgresql-rotation) |

The last one is specific to the Render estate and the most likely to save you
from total data loss.

### SLOs to adopt

| Indicator | Target |
| --- | --- |
| `POST /notifications` availability | 99.9% non-5xx |
| `POST /notifications` latency | p95 < 200 ms (enqueue only; delivery is async) |
| Enqueue to first delivery attempt | p95 < 5 s |
| In-app delivery to a connected recipient | p95 < 1 s |
| Delivery success, excluding recipient-side failures | > 99% |

## Backup and disaster recovery

| Data | Durability | Backup | Recovery |
| --- | --- | --- | --- |
| PostgreSQL (Render) | **30 days, then deleted** | `pg_dump`, weekly + rotation | Restore into a new instance |
| PostgreSQL (AWS) | Multi-AZ | Automated snapshots + 35-day PITR | PITR to any second in the window |
| Redis | reconstructible | none needed | Re-enqueue `PENDING`/`PROCESSING` notifications — **no tool exists yet** |
| Frontend | derived from source | none needed | Rebuild and redeploy |
| Secrets | — | Secrets Manager versions; offline copy of VAPID keys | VAPID keys are **unrecoverable** if lost |

| Environment | RPO | RTO |
| --- | --- | --- |
| Render | up to 7 days (weekly dumps) | 1–2 h (provision + restore) |
| AWS | < 5 min (PITR) | < 30 min (restore or failover) |

### Scenarios

**Redis lost.** Notifications are persisted before enqueue, so rows survive as
`PENDING` or `PROCESSING`. Recovery is a job that finds notifications in those
states older than a few minutes and re-enqueues them. Note this needs
idempotency first, or it duplicates deliveries that actually succeeded before
the crash.

**PostgreSQL lost on Render without a dump.** Unrecoverable. Every tenant,
project, API key and notification is gone. This is what the rotation runbook
exists to prevent.

**Region failure on AWS.** Out of scope for the current design. Cross-region
replicas and a second cluster would be the path, and are not worth the cost
until there is revenue attached.

## Security

### Already correct

- API keys stored as SHA-256 digests with a non-secret display prefix; the raw
  `ntc_live_…` value is shown once and is unrecoverable.
- bcrypt password hashes; failed-attempt counters and lockout windows.
- Refresh tokens persisted hashed in `user_sessions` with expiry, so sessions
  are revocable server-side.
- Optional TOTP 2FA.
- Recipient-scoped client tokens signed with a **separate** secret, so a browser
  never holds a project API key.
- Strict production environment validation refusing weak or reused secrets,
  non-HTTPS OAuth callbacks, and `FRONTEND_URL` values carrying a path.
- A global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`.
- Tenant scoping on every query, resolved from credentials.
- Dead Web Push subscriptions pruned on 404/410.

### To fix

1. **Realtime CORS is `origin: '*'`.** `RealtimeGateway`'s decorator allows any
   origin while HTTP CORS is correctly restricted to `FRONTEND_URL`. Tighten it
   to the same allow-list.
2. **`auth-test.controller.ts` is mounted in production.** It exposes
   `/auth-test/dashboard-user` and `/auth-test/api-key`, which echo the resolved
   `tenantId`. Guarded, so harmless in itself — but it is a development aid
   that hands an attacker a free credential-and-tenant oracle. Delete it, or
   gate it behind a non-production check.
3. **Swagger is public at `/api-docs`.** Reasonable for a developer-facing
   product; make it a deliberate decision, and consider basic auth in
   non-public environments.
4. **No security headers.** Add `helmet` (HSTS, `X-Content-Type-Options`,
   `Referrer-Policy`) and a CSP on the frontend.
5. **No RLS in PostgreSQL.** Isolation is application-enforced only. Add
   row-level security as defence in depth before granting any direct database
   access (BI tools, read replicas, support tooling).
6. **No audit log.** API key creation and rotation, project deletion, 2FA
   changes and session revocations should be recorded in an append-only table.
7. **Secrets in Render environment variables** are visible to anyone with
   dashboard access. On AWS use Secrets Manager with rotation and CloudTrail.
8. **No dependency scanning.** Add Dependabot and `pnpm audit` to CI.

## Open gaps

| # | Gap | Where |
| --- | --- | --- |
| 1 | **`render.yaml` is absent** — `docs/6-progress-tracker.md` Checkpoint 8 claims a Render Blueprint was added. The estate is click-configured and not reproducible | Blueprint in [2-render.md](./2-render.md#blueprint) |
| 2 | **CI runs no tests or lint** — the same checkpoint claims they are enforced. 12 suites gate nothing | [CI/CD](#cicd) above |
| 3 | **API lint baseline is failing** — 323 errors / 22 warnings, mostly `no-unsafe-*` in `auth/`, `push/`, and test files, plus generated Prisma output that ESLint is not configured to ignore. Must be cleaned (and `src/generated` ignored) before API lint can gate CI | `apps/api/eslint.config.mjs` |
| 4 | **`pnpm lint` runs `eslint --fix`**, so running it reformats unrelated files as a side effect. Split into `lint` (check) and `lint:fix` | `apps/api/package.json` |
| 5 | **No Dockerfile** — no containerised artifact for AWS | Provided in [3-aws.md](./3-aws.md#containerising) |
| 6 | **No idempotency keys** despite `docs/2-architecture.md` §11B | [Remaining work](#remaining-work-in-order) item 2 |
| 7 | **No dead-letter queue** despite §11C | item 3 |
| 8 | **Recipient feed has no pagination** | item 4 |
| 9 | **No retention or partitioning**; `user_sessions` never pruned | item 8 |
| 10 | **No Redis-loss recovery tool** to re-enqueue stuck rows | [Scenarios](#scenarios) |
| 11 | **No metrics, tracing, or error tracking** | [Observability](#observability) |
| 12 | **Realtime CORS `origin: '*'`** | [Security](#to-fix) item 1 |
| 13 | **`auth-test` controller mounted in production** | item 2 |
| 14 | **Nested `pnpm-workspace.yaml` / `pnpm-lock.yaml` in `apps/web/`** can resolve a different dependency tree in CI than locally | [1-description.md](./1-description.md#build) |
| 15 | **No `engines` or `packageManager`** in any `package.json`; the toolchain is pinned in CI only | same |
| 16 | **`apps/api/README.md` is the unmodified NestJS template** | — |
| 17 | **Integration smoke test for multi-instance realtime delivery is unexecuted.** The adapter is covered by unit tests and compiles against the real `@socket.io/redis-adapter`, but has not been run against a live Redis with two instances | [below](#verifying-multi-instance-delivery) |

## Verifying multi-instance delivery

The one check that cannot be unit-tested. Run it once against real Redis before
trusting a multi-task deployment.

```bash
docker compose up -d                                  # PostgreSQL + Redis
pnpm --filter api exec prisma migrate deploy

# Two instances against the same Postgres and Redis
PORT=8000 APP_ROLE=api    pnpm --filter api run start:prod &
PORT=8001 APP_ROLE=worker pnpm --filter api run start:prod &
```

Both logs should show:

```text
Realtime gateway is using the Redis adapter; room events span every instance
Role:         api     (delivery worker: off)
Role:         worker  (delivery worker: on)
```

Then:

1. Open an SDK socket against **:8000** (the API role) for some recipient.
2. `POST /notifications` to **:8000** with `channel: "IN_APP"`.
3. The job is delivered by the **:8001** worker, which holds no socket.
4. **Expected:** the browser receives the notification, and the
   `notification_deliveries` row is `SUCCESS`.
5. **Regression:** a `SKIPPED` row with the recipient visibly connected means
   the adapter is not active — check the boot logs for the fallback warning.

Also confirm graceful shutdown: send `SIGTERM` to the worker mid-delivery and
check it finishes the active job before exiting, rather than leaving the
notification in `PROCESSING`.
