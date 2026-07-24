-- Extend delivery outcomes so simulated and intentionally skipped attempts are
-- not counted as successful external deliveries.
ALTER TYPE "DeliveryStatus" ADD VALUE 'SKIPPED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'SIMULATED';

-- Add project ownership as nullable while existing tenant-scoped records are
-- assigned to a deterministic project.
ALTER TABLE "recipient_users" ADD COLUMN "project_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "project_id" TEXT;
ALTER TABLE "device_tokens" ADD COLUMN "project_id" TEXT;

-- Historical data predates project isolation. Assign it to the tenant's oldest
-- project so no recipients, notifications, or subscriptions are discarded.
UPDATE "recipient_users" AS recipient
SET "project_id" = (
  SELECT project."id"
  FROM "projects" AS project
  WHERE project."tenant_id" = recipient."tenant_id"
  ORDER BY project."createdAt" ASC, project."id" ASC
  LIMIT 1
);

UPDATE "notifications" AS notification
SET "project_id" = recipient."project_id"
FROM "recipient_users" AS recipient
WHERE recipient."id" = notification."recipient_user_id";

UPDATE "device_tokens" AS device
SET "project_id" = recipient."project_id"
FROM "recipient_users" AS recipient
WHERE recipient."id" = device."recipient_user_id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "recipient_users" WHERE "project_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "notifications" WHERE "project_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "device_tokens" WHERE "project_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate project scope: tenant data exists without a project';
  END IF;
END
$$;

ALTER TABLE "recipient_users" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "device_tokens" ALTER COLUMN "project_id" SET NOT NULL;

DROP INDEX "recipient_users_tenant_id_external_user_id_key";
CREATE UNIQUE INDEX "recipient_users_project_id_external_user_id_key"
ON "recipient_users"("project_id", "external_user_id");

CREATE INDEX "recipient_users_tenant_id_idx" ON "recipient_users"("tenant_id");
CREATE INDEX "recipient_users_project_id_idx" ON "recipient_users"("project_id");
CREATE INDEX "notifications_tenant_id_idx" ON "notifications"("tenant_id");
CREATE INDEX "notifications_project_id_idx" ON "notifications"("project_id");
CREATE INDEX "device_tokens_tenant_id_idx" ON "device_tokens"("tenant_id");
CREATE INDEX "device_tokens_project_id_idx" ON "device_tokens"("project_id");

ALTER TABLE "recipient_users"
ADD CONSTRAINT "recipient_users_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_tokens"
ADD CONSTRAINT "device_tokens_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
