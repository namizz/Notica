# 3. AWS

The production target: durable storage, automated backups, independent scaling
of the API and the worker, and no 30-day cliff.

## Topology

```text
                              Route 53
                                 │
            ┌────────────────────┴────────────────────┐
            ▼                                         ▼
   ┌──────────────────┐                    ┌─────────────────────┐
   │ CloudFront       │                    │ ALB  (HTTPS, ACM)   │
   │ + ACM cert       │                    │ health check /health│
   │  ┌────────────┐  │                    └──────┬──────────────┘
   │  │ S3 bucket  │  │                           │ REST + WebSocket
   │  │ apps/web/  │  │                           ▼
   │  │ out/ (OAC) │  │              ┌──────────────────────────┐
   │  └────────────┘  │              │ ECS Fargate              │
   └──────────────────┘              │ notica-api               │
                                     │ APP_ROLE=api             │
                                     │ 2+ tasks, private subnets│
                                     └────┬──────────────┬──────┘
                                          │              │
  ┌───────────────────────────────────────▼──┐      ┌────▼─────────────────┐
  │ RDS PostgreSQL (Multi-AZ)                │      │ ElastiCache Redis    │
  │ automated backups + PITR, KMS encrypted  │      │ AUTH + TLS, AOF on   │
  │ + RDS Proxy (connection pooling)         │      │ queue + socket.io    │
  └──────────────────────────────────────────┘      │ pub/sub adapter      │
                                          ▲         └────┬─────────────────┘
                                     ┌────┴──────────────▼─────┐
                                     │ ECS Fargate             │
                                     │ notica-worker           │
                                     │ APP_ROLE=worker         │
                                     │ no ALB, queue-depth     │
                                     │ autoscaling             │
                                     └─────────────────────────┘

  Secrets Manager → task secrets      SES → email      CloudWatch → logs
```

Both ECS services run the **same image**; only `APP_ROLE` differs.

## Service mapping

| Concern | Render | AWS | Why |
| --- | --- | --- | --- |
| API | Web Service | **ECS Fargate** behind an ALB | No servers to patch; scales on CPU and request count |
| Worker | same process | **separate ECS service** | Independent scaling; delivery spikes stop hurting API latency |
| PostgreSQL | free, 30-day life | **RDS PostgreSQL 16, Multi-AZ** | Automated backups, 35-day PITR, failover, no rotation runbook |
| Connection pooling | none | **RDS Proxy** | Fargate tasks × Prisma pool exhausts `max_connections` quickly |
| Redis | Key Value free | **ElastiCache Redis**, AOF on, AUTH + TLS | Durable queue; `rediss://` is already supported |
| Frontend | Static Site | **S3 + CloudFront** with OAC | Static export needs nothing more; global edge cache |
| Secrets | env vars | **Secrets Manager**, injected as task `secrets` | Rotation, audit trail, never in task definitions |
| Email | external SMTP | **SES SMTP endpoint** | Drop-in: SES speaks SMTP, so `SmtpProvider` is unchanged |
| Migrations | `preDeployCommand` | **one-off ECS task** before the service update | Gated, logged, re-runnable |
| TLS | automatic | **ACM** on ALB and CloudFront | — |
| Logs | dashboard tail | **CloudWatch Logs** via `awslogs` | Nest logs to stdout; nothing to change |

## Networking

- One VPC, two AZs minimum.
- **Public subnets:** ALB and NAT gateways only.
- **Private subnets:** Fargate tasks (API and worker).
- **Isolated subnets:** RDS and ElastiCache, no route to the internet.
- Security groups chained by reference, not CIDR:
  `ALB:443 ← internet` → `api-sg:8000 ← alb-sg` →
  `rds-sg:5432 ← api-sg, worker-sg, migrate-sg` and
  `redis-sg:6379 ← api-sg, worker-sg`.
- Outbound NAT is required for Web Push endpoints (FCM, Mozilla, Apple), OAuth
  token exchange with Google and GitHub, and SES.

### ALB settings for Socket.IO

The realtime gateway is the one component with load-balancer requirements.

| Setting | Value | Why |
| --- | --- | --- |
| Health check path | **`/health`** | `/health/ready` touches Postgres and Redis; wiring it here means one database hiccup drains every healthy task |
| Idle timeout | **≥ 120 s** | The 60 s default silently drops idle WebSockets |
| Stickiness | `lb_cookie`, **or** force `transports: ['websocket']` client-side | Only needed for the HTTP long-polling upgrade path. Forcing WebSocket is cleaner and every supported browser does it |

Multiple API tasks are safe because the Socket.IO **Redis adapter** is wired in
`apps/api/src/realtime/redis-io.adapter.ts` — room membership and emits are
shared through Redis, so any task can reach a socket held by another one.
Without it, cross-instance in-app delivery silently records `SKIPPED`.

## Containerising

No Dockerfile is committed yet. One multi-stage build produces a single image
that both services run with different `APP_ROLE` values.

```dockerfile
# apps/api/Dockerfile — build context = repository root
FROM node:20-bookworm-slim AS deps
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api...

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter api exec prisma generate \
 && pnpm --filter api run build

FROM node:20-bookworm-slim AS runtime
RUN corepack enable && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/generated apps/api/generated
COPY --from=build /app/apps/api/src/generated apps/api/src/generated
COPY apps/api/prisma apps/api/prisma
COPY apps/api/public apps/api/public
COPY apps/api/package.json apps/api/
USER node
WORKDIR /app/apps/api
EXPOSE 8000
CMD ["node", "dist/src/main.js"]
```

Two details that cause opaque runtime failures if missed:

- **`openssl`** is required by Prisma's query engine on slim Debian images.
  Without it the client fails to initialise.
- **`apps/api/public`** must be in the image or `/sdk/notica.js` returns 404.
  `main.ts` serves it from `process.cwd()`, which is why `WORKDIR` is
  `/app/apps/api`.

## ECS services

### `notica-api`

- `APP_ROLE=api` — serves HTTP, does **not** consume the queue.
- 2+ tasks, 0.5 vCPU / 1 GB each, behind the ALB on port 8000.
- Target-tracking autoscaling on `ALBRequestCountPerTarget` and CPU at 60%.

### `notica-worker`

- `APP_ROLE=worker` — consumes the queue; HTTP stays up for health checks only.
- No ALB, no inbound security-group rules.
- Autoscale on queue depth: publish a custom CloudWatch metric
  (`Notica/QueueDepth`) from a small scheduled Lambda calling `getJobCounts`,
  and target-track on it. Scale to zero between bursts if the load is spiky.

Both services need **`stopTimeout: 120`**. `main.ts` calls
`app.enableShutdownHooks()`, so on SIGTERM Nest drains in-flight BullMQ jobs
(`worker.close()` waits for active jobs), closes sockets, and disconnects
Prisma and the realtime Redis clients. Too short a stop timeout kills that
drain partway.

### `notica-migrate`

A task definition run once per deploy, **before** the service update:

```bash
aws ecs run-task \
  --cluster notica \
  --task-definition notica-migrate \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-…],securityGroups=[sg-migrate]}' \
  --overrides '{"containerOverrides":[{"name":"migrate","command":["pnpm","--filter","api","exec","prisma","migrate","deploy"]}]}'
```

Wait for exit code 0 before updating the services. Current migrations are
additive, but any future destructive migration needs an expand/contract split
(additive migration → deploy code → deploy the removal), otherwise the rolling
update runs old code against a new schema.

## Frontend on S3 + CloudFront

```bash
pnpm --filter web run build         # with this environment's NEXT_PUBLIC_* values

aws s3 sync apps/web/out/ "s3://notica-web-prod/" --delete \
  --cache-control 'public,max-age=31536000,immutable' \
  --exclude '*.html'
aws s3 sync apps/web/out/ "s3://notica-web-prod/" \
  --cache-control 'public,max-age=0,must-revalidate' \
  --exclude '*' --include '*.html'

aws cloudfront create-invalidation --distribution-id E… --paths '/*'
```

Two passes because hashed `_next/static/*` assets are immutable while HTML
entry points must never be cached. The build sets `trailingSlash: true`, so add
a CloudFront Function (or default root object) mapping `/dashboard/` →
`/dashboard/index.html`. Keep the bucket private behind Origin Access Control.

`NEXT_PUBLIC_*` values are **baked in at build time** — one build per
environment, and changing the API URL means rebuilding.

## Deployment pipeline

On a tag or a `main` merge:

1. Build and push the image to ECR, tagged with the commit SHA (never `latest`).
2. Build the frontend with this environment's `NEXT_PUBLIC_*`; sync to S3;
   invalidate CloudFront.
3. `aws ecs run-task notica-migrate`; **wait for exit code 0**.
4. Update `notica-api` and `notica-worker` to the new task definition.
5. Poll `/health/ready` through the ALB until ready; roll back to the previous
   task definition on failure.

Enable ECS deployment circuit breakers with rollback. The usual cause of a
crash-looping task is a missing environment variable tripping
`validateProductionEnvironment()`, and the circuit breaker reverts it
automatically.

## Indicative monthly cost

| Resource | Configuration | ~USD/month |
| --- | --- | --- |
| ECS Fargate, API | 2 × 0.5 vCPU / 1 GB, always on | 35 |
| ECS Fargate, worker | 1 × 0.25 vCPU / 0.5 GB | 9 |
| RDS PostgreSQL | `db.t4g.micro`, Multi-AZ, 20 GB gp3 | 60 |
| RDS Proxy | 1 instance | 15 |
| ElastiCache Redis | `cache.t4g.micro`, 1 replica | 25 |
| ALB | 1, low LCU | 20 |
| NAT Gateway | 1, single-AZ egress | 33 |
| S3 + CloudFront | low traffic | 5 |
| Secrets Manager, CloudWatch, SES | — | 10 |
| | **Total** | **≈ 210** |

Reductions roughly in order of value: single-AZ RDS (−30); drop RDS Proxy until
connection counts demand it (−15); VPC endpoints instead of NAT (−33, but Web
Push and OAuth still need internet egress); Fargate Spot for the worker (−6);
no ElastiCache replica (−12). A lean non-production environment lands near
90/month.
