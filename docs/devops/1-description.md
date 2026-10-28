# 1. Description

## What Notica is

A multi-tenant **notification gateway**. Client applications hand it a
notification and a project API key; Notica stores it, delivers it over the
requested channel, retries on failure, and keeps a per-attempt record.

The caller never waits for delivery. The API does two cheap things — write the
row, enqueue the job — and answers immediately. Everything slow happens behind
the queue.

```text
Client backend
    │  POST /notifications  (x-api-key: ntc_live_…)
    ▼
NestJS API ──► PostgreSQL        notification row, status = PENDING
    │
    ├────────► Redis / BullMQ    job on queue "notification-delivery"
    │
    └──► 201 returned immediately

Delivery worker
    │  status = PROCESSING
    ├──► IN_APP    → Socket.IO emit into the recipient's room
    ├──► WEB_PUSH  → VAPID push per registered device token
    ├──► EMAIL     → SMTP, or console when SMTP_HOST is unset
    │
    ├──► one notification_deliveries row per attempt
    └──► status = SENT | DELIVERED | FAILED
```

Three channels, each behind a provider interface so a new one slots in without
touching delivery logic.

## Two kinds of user

The deployment must keep these apart.

| | Dashboard users | Recipient users |
| --- | --- | --- |
| Table | `dashboard_users` | `recipient_users` |
| Who | People managing projects and API keys | The client application's own end users |
| Auth | Password (bcrypt), Google, GitHub, optional TOTP 2FA | None — they never log in |
| Identity | Email | `(project_id, external_user_id)` |
| Credential in the browser | Access token + refresh session | Short-lived scoped client token |

Tenant isolation is enforced **in application code**: every query is scoped by
`tenant_id`, resolved from the API key hash or the JWT, never from request
input. There is no database-level RLS, so any path that bypasses the service
layer (direct SQL, a reporting replica, an admin tool) loses isolation. Treat
the API as the only writer.

## Processes to run

One build artifact, selected by `APP_ROLE`.

| `APP_ROLE` | Serves HTTP | Consumes the queue | Use for |
| --- | --- | --- | --- |
| unset / `all` | yes | yes | Local development, single-service deployments (Render) |
| `api` | yes | **no** | AWS: request handling, scaled on request rate and CPU |
| `worker` | yes (health only) | yes | AWS: delivery, scaled on queue depth |

The `worker` role keeps the HTTP server up so container health checks have
something to probe. An unrecognised value fails at boot rather than silently
deploying the wrong role.

## Components

| # | Component | Stateful | Notes |
| --- | --- | --- | --- |
| 1 | **API** (NestJS 11) | no | Port `PORT`, binds `0.0.0.0`. Also serves Swagger at `/api-docs` and the browser SDK at `/sdk` |
| 2 | **Realtime gateway** (Socket.IO) | room state in Redis | Namespace `/realtime`, same process and port as the API |
| 3 | **Delivery worker** (BullMQ) | no | Queue `notification-delivery`, 3 attempts, exponential backoff from 5 s |
| 4 | **PostgreSQL** 15+ | **system of record** | Prisma 6, 8 models, 6 migrations |
| 5 | **Redis** 7+ | yes, reconstructible | Two jobs: BullMQ broker *and* Socket.IO pub/sub adapter |
| 6 | **Web frontend** (Next.js 16) | no | **Static export** — plain files in `apps/web/out/`, any static host |
| 7 | SMTP provider | — | Optional; console fallback when unset |
| 8 | Web Push / VAPID | — | Keys are permanent per environment |

Redis carrying both the queue and the realtime adapter is deliberate: room
membership has to be shared so any instance can reach a socket held by another
one. Set `maxmemory-policy noeviction` — under any eviction policy Redis can
discard BullMQ job hashes under memory pressure, and jobs vanish without ever
reaching `failed`.

## Health endpoints

| Endpoint | Checks | Use for |
| --- | --- | --- |
| `GET /health` | Process only, no dependency calls | Load-balancer and platform health checks |
| `GET /health/ready` | `SELECT 1` on PostgreSQL, `getJobCounts` on Redis. Returns `503` with a per-dependency breakdown | Deploy gating and alerting |

Do **not** wire `/health/ready` to a load-balancer target group. A brief
database blip would drain every healthy container at once.

## Build

pnpm workspace (`apps/*`).

```text
notica/
├── apps/api/      NestJS API + worker + Prisma
│   ├── prisma/    schema.prisma, 6 migrations
│   ├── public/    notica.js browser SDK, served at /sdk
│   └── src/       auth, projects, recipients, notifications, realtime,
│                  push, email, device-tokens, queue, health, config
├── apps/web/      Next.js dashboard + public site (static export)
└── docs/          product docs 1–6, devops docs here
```

```bash
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate     # MANDATORY before build
pnpm --filter api run build                # → apps/api/dist/
pnpm --filter api run start:prod           # node dist/src/main.js
pnpm --filter web run build                # → apps/web/out/ (static)
pnpm --filter api exec prisma migrate deploy
```

Prisma generates into gitignored directories, so `prisma generate` must run in
every pipeline before `nest build`. Never run `migrate dev` against a deployed
database.

Toolchain: **Node 20, pnpm 10** (pinned in CI only). Neither `package.json`
declares `engines` or `packageManager`, so pin versions explicitly in every
environment or builds drift.

> **Build gotcha.** `apps/web/` contains its own nested `pnpm-workspace.yaml`
> and `pnpm-lock.yaml`. pnpm can resolve the web app against the nested
> workspace instead of the root one, producing a different dependency tree in
> CI than locally. Either delete the nested files, or keep every build
> root-anchored (`pnpm --filter web …` from the repository root).

## Environment variables

Validated at boot by `validateProductionEnvironment()` in
`apps/api/src/config/environment.ts`, when `NODE_ENV=production` **or**
`RENDER=true`. **Any violation stops the process** — a missing variable is a
crash loop, so read the boot logs first on a failed deploy.

### API

| Variable | Required in prod | Validation |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` enables the strict checks |
| `PORT` | platform-set | Defaults to 8000 |
| `APP_ROLE` | no | One of `all`, `api`, `worker`; defaults to `all` |
| `DATABASE_URL` | **yes** | `postgresql://` or `postgres://`. Add `?connection_limit=…` |
| `REDIS_URL` | **yes** ¹ | `redis://` or `rediss://`; `rediss` auto-enables TLS |
| `REDIS_HOST` / `REDIS_PORT` | alternative ¹ | Valid TCP port |
| `FRONTEND_URL` | **yes** | **HTTPS origin with no path, query or fragment.** Drives CORS and OAuth/password-reset redirects |
| `JWT_SECRET` | **yes** | ≥32 chars, not a known dev value |
| `JWT_REFRESH_SECRET` | **yes** | ≥32 chars, **different from the other two** |
| `CLIENT_TOKEN_SECRET` | **yes** | ≥32 chars, **different from the other two** |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_CALLBACK_URL` | **yes** | All three; callback must be HTTPS |
| `GITHUB_CLIENT_ID` / `_SECRET` / `_CALLBACK_URL` | **yes** | All three; callback must be HTTPS |
| `VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `_SUBJECT` | **yes** | Subject is `mailto:` or `https:` |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `_FROM` | optional, **all or none** | Partial config is rejected; unset ⇒ console-simulated email |
| `RENDER` | Render-set | Forces production validation |

¹ Exactly one of `REDIS_URL` or the `REDIS_HOST`/`REDIS_PORT` pair.

### Web — baked in at build time

The frontend is a static export, so these are compiled into the bundle.
Changing one needs a rebuild and redeploy; there is no runtime reconfiguration.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API origin for REST calls |
| `NEXT_PUBLIC_WS_URL` | Socket.IO origin (same host as the API) |
| `NEXT_PUBLIC_RENDER` | `"true"` enables the cold-start wake-up probe. Set `true` on Render free tier, `false` on AWS |

### Rotation impact

| Secret | Blast radius |
| --- | --- |
| `JWT_SECRET` | Access tokens invalid; clients refresh transparently |
| `JWT_REFRESH_SECRET` | **Every dashboard user is logged out** |
| `CLIENT_TOKEN_SECRET` | All browser SDK sessions drop and must re-identify |
| `VAPID_*` | **Every Web Push subscription is permanently dead.** `device_tokens` must be purged and recipients must re-subscribe |
| Project API keys | Per-project, rotated from the dashboard. Only a SHA-256 digest and display prefix are stored — the raw key is unrecoverable |
| `DATABASE_URL` | Restart required; see [2-render.md](./2-render.md) |
