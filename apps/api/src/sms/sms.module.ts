import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { runsDeliveryWorker } from '../config/environment';
import { SmsOutboxService } from './sms-outbox.service';
import { SmsChannelHandler } from './sms-channel.handler';
import { SmsMaintenanceProcessor } from './sms-maintenance.processor';
import { GatewayPresenceService } from './gateway/gateway-presence.service';
import { GatewayDispatcher } from './gateway/gateway-dispatcher.service';
import { GatewayDevicesService } from './gateway/gateway-devices.service';
import { GatewayRouter } from './gateway/gateway-router.service';
import { GatewayEventsService } from './gateway/gateway-events.service';
import { GatewaySocket } from './gateway/gateway.socket';
import { DeviceAuthGuard, GatewaySignatureGuard } from './gateway/device-auth.guard';
import { GatewayApiController } from './gateway/gateway-api.controller';
import { GatewayDevicesController } from './gateway/gateway-devices.controller';

const workerProviders = runsDeliveryWorker()
  ? [SmsMaintenanceProcessor]
  : [];

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    WebhooksModule,
    BullModule.registerQueue({ name: 'sms-maintenance' }),
  ],
  controllers: [GatewayApiController, GatewayDevicesController],
  providers: [
    SmsOutboxService,
    SmsChannelHandler,
    GatewayPresenceService,
    GatewayDispatcher,
    GatewayDevicesService,
    GatewayRouter,
    GatewayEventsService,
    GatewaySocket,
    DeviceAuthGuard,
    GatewaySignatureGuard,
    ...workerProviders,
  ],
})
export class SmsModule {}
