import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';
import { runsDeliveryWorker } from '../config/environment';

// APP_ROLE=api leaves delivery to the worker role, so request handling never
// shares an event loop with SMTP and Web Push calls. Every other role keeps
// the processor, which preserves the single-service default.
const deliveryProviders = runsDeliveryWorker() ? [NotificationsProcessor] : [];

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    RealtimeModule,
    PushModule,
    EmailModule,
    BullModule.registerQueue({
      name: 'notification-delivery',
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ...deliveryProviders],
  exports: [NotificationsService],
})
export class NotificationsModule {}
