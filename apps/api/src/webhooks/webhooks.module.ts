import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { runsDeliveryWorker } from '../config/environment';
import { PrismaModule } from '../prisma/prisma.module';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { WEBHOOK_DELIVERY_QUEUE } from './webhook-events';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

const workerProviders = runsDeliveryWorker() ? [WebhookDeliveryProcessor] : [];

/**
 * Customer webhooks: projects register URLs and receive signed events.
 * Channel-agnostic; email and SMS publish into it through WebhooksService.
 */
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: WEBHOOK_DELIVERY_QUEUE }),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, ...workerProviders],
  exports: [WebhooksService],
})
export class WebhooksModule {}
