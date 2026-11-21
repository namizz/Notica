-- Optional client-supplied key so a retried POST /notifications returns the
-- original notification instead of sending it again. Existing rows stay NULL,
-- and PostgreSQL treats NULLs as distinct, so they never conflict.
ALTER TABLE "notifications" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "notifications_project_id_idempotency_key_key"
ON "notifications"("project_id", "idempotency_key");
