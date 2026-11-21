-- SMS channel through paired Android gateway phones, email delivery tracking
-- (provider message ids, suppression after bounces), and customer webhooks.
-- ADD VALUE on ChannelType is safe here: nothing in this migration uses SMS.

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'DISPATCHED', 'ACCEPTED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "SmsEncoding" AS ENUM ('GSM7', 'UCS2');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterEnum
ALTER TYPE "ChannelType" ADD VALUE 'SMS';

-- AlterTable
ALTER TABLE "recipient_users" ADD COLUMN     "email_suppressed_at" TIMESTAMP(3),
ADD COLUMN     "email_suppression_reason" TEXT,
ADD COLUMN     "phone" VARCHAR(16);

-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "provider_message_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "gateway_devices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT,
    "pairing_code_hash" TEXT,
    "pairing_expires_at" TIMESTAMP(3),
    "paired_at" TIMESTAMP(3),
    "model" TEXT,
    "android_sdk" INTEGER,
    "app_version" TEXT,
    "sims" JSONB,
    "default_sim_slot" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "last_heartbeat" JSONB,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "gateway_device_id" TEXT,
    "to" VARCHAR(16) NOT NULL,
    "text" TEXT,
    "encoding" "SmsEncoding" NOT NULL,
    "parts" INTEGER NOT NULL,
    "sim_slot" INTEGER,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "dispatch_attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_until" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_events" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_status_code" INTEGER,
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gateway_devices_token_hash_key" ON "gateway_devices"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_devices_pairing_code_hash_key" ON "gateway_devices"("pairing_code_hash");

-- CreateIndex
CREATE INDEX "gateway_devices_project_id_idx" ON "gateway_devices"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_messages_delivery_id_key" ON "sms_messages"("delivery_id");

-- CreateIndex
CREATE INDEX "sms_messages_gateway_device_id_status_idx" ON "sms_messages"("gateway_device_id", "status");

-- CreateIndex
CREATE INDEX "sms_messages_status_lease_until_idx" ON "sms_messages"("status", "lease_until");

-- CreateIndex
CREATE INDEX "sms_messages_status_expires_at_idx" ON "sms_messages"("status", "expires_at");

-- CreateIndex
CREATE INDEX "sms_messages_project_id_created_at_idx" ON "sms_messages"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "sms_messages_notification_id_idx" ON "sms_messages"("notification_id");

-- CreateIndex
CREATE INDEX "gateway_events_received_at_idx" ON "gateway_events"("received_at");

-- CreateIndex
CREATE INDEX "webhook_endpoints_project_id_idx" ON "webhook_endpoints"("project_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpoint_id_created_at_idx" ON "webhook_deliveries"("endpoint_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_provider_message_id_idx" ON "notification_deliveries"("provider_message_id");

-- AddForeignKey
ALTER TABLE "gateway_devices" ADD CONSTRAINT "gateway_devices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "notification_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_gateway_device_id_fkey" FOREIGN KEY ("gateway_device_id") REFERENCES "gateway_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

