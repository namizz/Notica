-- Enable digest() so existing high-entropy API keys can be converted without
-- exposing or rotating them during deployment.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add the new credential columns as nullable while existing rows are migrated.
ALTER TABLE "projects"
ADD COLUMN "api_key_hash" TEXT,
ADD COLUMN "api_key_prefix" TEXT;

-- Preserve existing integrations by hashing their current key and retaining
-- only a short, non-secret identifier for the dashboard.
UPDATE "projects"
SET
  "api_key_hash" = encode(digest("api_key", 'sha256'), 'hex'),
  "api_key_prefix" = left("api_key", 17);

ALTER TABLE "projects"
ALTER COLUMN "api_key_hash" SET NOT NULL,
ALTER COLUMN "api_key_prefix" SET NOT NULL;

-- Dropping the raw column also removes its old unique index.
ALTER TABLE "projects" DROP COLUMN "api_key";

CREATE UNIQUE INDEX "projects_api_key_hash_key" ON "projects"("api_key_hash");
