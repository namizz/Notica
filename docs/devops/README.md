# Notica DevOps

Operations documentation, split by concern.

| Document | Read it for |
| --- | --- |
| [1-description.md](./1-description.md) | What Notica is, the processes to run, and every environment variable |
| [2-render.md](./2-render.md) | Deploying the free-tier demo estate, and the monthly PostgreSQL rotation |
| [3-aws.md](./3-aws.md) | Deploying production on AWS |
| [4-operations.md](./4-operations.md) | Scaling status, CI/CD, observability, backups, security, open gaps |

Last reviewed: 2026-10-28.

## Quick reference

```bash
# Local dependencies
docker compose up -d                        # PostgreSQL :5433, Redis :6379

# Install and generate (prisma generate is mandatory before any build)
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate

# Run
pnpm dev                                    # API + web, watch mode
pnpm --filter api run test                  # 12 suites, 54 tests
pnpm --filter api exec prisma migrate deploy # deployed environments only
```

## The two things that will bite you

1. **The Render PostgreSQL instance is deleted 30 days after creation.** The
   dataset must be dumped and restored into a fresh instance every month.
   See [2-render.md](./2-render.md#monthly-postgresql-rotation).
2. **The API refuses to boot on a bad production environment.** A missing or
   weak variable is a crash loop, not a degraded service. Check the boot logs
   first on any failed deploy. See
   [1-description.md](./1-description.md#environment-variables).
