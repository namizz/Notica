-- AlterTable
ALTER TABLE "dashboard_users" ADD COLUMN     "auth_provider" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN     "auth_provider_id" TEXT,
ADD COLUMN     "is_two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "two_factor_secret" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;
